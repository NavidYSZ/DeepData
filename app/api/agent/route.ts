import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { z } from "zod";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { ChatSession } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/google-oauth";
import { listSites, searchAnalyticsQuery } from "@/lib/gsc";
import { stringify } from "csv-stringify/sync";

const inputSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional()
});

const querySchema = z.object({
  siteUrl: z.string().min(1),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  dimensions: z.array(z.string()).min(1),
  rowLimit: z.number().optional(),
  filters: z
    .array(
      z.object({
        dimension: z.string(),
        operator: z.string(),
        expression: z.string()
      })
    )
    .optional()
});

const exportSchema = z.object({
  rows: z.array(z.record(z.any())).min(1),
  filename: z.string().optional()
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || ""
});

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function getUserAccount(userId: string) {
  const cookieStore = cookies();
  const accountId = cookieStore.get("accountId")?.value;
  const account = accountId
    ? await prisma.gscAccount.findFirst({ where: { id: accountId, userId } })
    : await prisma.gscAccount.findFirst({ where: { userId }, orderBy: { created_at: "asc" } });
  return account;
}

async function getAccessToken(userId: string) {
  const account = await getUserAccount(userId);
  if (!account?.refresh_token) throw new Error("Not connected");
  const tokens = await refreshAccessToken(decrypt(account.refresh_token));
  return tokens.access_token;
}

async function persistUserMessage(sessionId: string, userId: string, content: any) {
  await prisma.chatMessage.create({
    data: { sessionId, userId, role: "user", content }
  });
}

async function persistAssistantMessage(sessionId: string, content: any, model?: string) {
  await prisma.chatMessage.create({
    data: { sessionId, role: "assistant", content, model }
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = inputSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { message, sessionId: incomingSessionId } = body.data;

  // upsert session
  const sessionRecord = incomingSessionId
    ? await prisma.chatSession.findFirst({ where: { id: incomingSessionId, userId, archived: false } })
    : null;

  const chatSession: ChatSession =
    sessionRecord ??
    (await prisma.chatSession.create({
      data: { userId, title: message.slice(0, 60) }
    }));

  const history = await prisma.chatMessage.findMany({
    where: { sessionId: chatSession.id },
    orderBy: { createdAt: "asc" },
    take: 50
  });

  const coreMessages = history.map((m) => ({
    role: m.role as "user" | "assistant" | "system" | "tool",
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
  }));

  // append new user message for the call
  coreMessages.push({ role: "user", content: message });

  const agentTools: any = {
    listSites: {
      description: "List GSC sites for the current user",
      parameters: z.object({}),
      execute: async () => {
        const token = await getAccessToken(userId);
        const sites = await listSites(token);
        return {
          type: "data",
          sites: sites.map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }))
        };
      }
    },
    querySearchAnalytics: {
      description: "Query Google Search Console searchAnalytics",
      parameters: querySchema,
      execute: async (input: z.infer<typeof querySchema>) => {
        const token = await getAccessToken(userId);
        const rows = await searchAnalyticsQuery(token, input.siteUrl, {
          startDate: input.startDate,
          endDate: input.endDate,
          dimensions: input.dimensions,
          rowLimit: input.rowLimit,
          dimensionFilterGroups: input.filters
            ? [
                {
                  groupType: input.filters.length > 1 ? "or" : "and",
                  filters: input.filters.map((f) => ({
                    dimension: f.dimension,
                    operator: f.operator,
                    expression: f.expression
                  }))
                }
              ]
            : undefined
        });
        return { type: "data", rows };
      }
    },
    exportCsv: {
      description: "Create a CSV file from provided rows and return a download reference",
      parameters: exportSchema,
      execute: async (input: z.infer<typeof exportSchema>) => {
        const dir = path.join(process.cwd(), "data", "agent-files");
        await ensureDir(dir);
        const id = crypto.randomUUID();
        const filename = input.filename ? `${input.filename}.csv` : `export-${id}.csv`;
        const fullPath = path.join(dir, `${id}-${filename}`);
        const csv = stringify(input.rows, { header: true });
        await writeFile(fullPath, csv, "utf8");
        const stats = fs.statSync(fullPath);
        await prisma.chatFile.create({
          data: {
            id,
            sessionId: chatSession.id,
            userId,
            filename,
            mime: "text/csv",
            path: fullPath,
            size: stats.size,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2) // 2 days
          }
        });
        return {
          type: "file",
          fileId: id,
          filename,
          mime: "text/csv",
          size: stats.size,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString()
        };
      }
    }
  };

  const result = await streamText({
    model: openai("gpt-4.1-mini"),
    messages: coreMessages as any,
    system:
      "Du bist der GSC-Agent. Nutze die bereitgestellten Tools, um Daten aus der Google Search Console abzurufen, CSV-Exporte zu liefern und kurze, prägnante Antworten auf Deutsch zu geben. Nutze die Tools, wenn Daten benötigt werden.",
    tools: agentTools as any,
    onFinish: async ({ text, toolCalls, response }) => {
      await persistUserMessage(chatSession.id, userId, { text: message });
      await persistAssistantMessage(chatSession.id, { text, toolCalls, response }, response?.modelId);
      await prisma.chatSession.update({
        where: { id: chatSession.id },
        data: { title: chatSession.title?.startsWith("Neue Unterhaltung") ? message.slice(0, 60) : chatSession.title }
      });
    }
  });

  return result.toTextStreamResponse();
}
