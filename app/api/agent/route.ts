import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { z } from "zod";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { createTextStreamResponse, stepCountIs, streamText, tool } from "ai";
import { ChatSession } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/google-oauth";
import { listSites, searchAnalyticsQuery } from "@/lib/gsc";
import { stringify } from "csv-stringify/sync";
import { resolveDateRanges, resolveSite } from "@/lib/agent/context";
import { RUNBOOKS, runAudit, runCannibalization, runContentDecay, runQuickWins, runTopPages, runTopQueries } from "@/lib/agent/runbooks";
import type { UiBlock } from "@/lib/agent/analysis";

const runbookSchema = z.enum([
  "quick_wins",
  "content_decay",
  "cannibalization",
  "top_queries",
  "top_pages",
  "audit"
]);

const inputSchema = z
  .object({
    message: z.string().optional(),
    sessionId: z.string().optional(),
    siteHint: z.string().optional(),
    runbookId: runbookSchema.optional()
  })
  .refine((data) => (data.message && data.message.trim().length > 0) || data.runbookId, {
    message: "message or runbookId required"
  });

const querySchema = z.object({
  siteUrl: z.string().min(1),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  dimensions: z.array(z.string()).min(1),
  rowLimit: z.number().optional(),
  startRow: z.number().optional(),
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

const MAX_GSC_ROW_LIMIT = 5000;

type ToolStatusState = "running" | "done" | "error";

function formatStatusBlock(label: string, state: ToolStatusState) {
  return `\n[[JSON]]${JSON.stringify({ type: "status", label, state })}[[/JSON]]\n`;
}

function formatJsonBlock(block: UiBlock) {
  return `\n[[JSON]]${JSON.stringify(block)}[[/JSON]]\n`;
}

function renderBlocks(blocks: UiBlock[]) {
  return blocks.map((b) => formatJsonBlock(b)).join("");
}

function textStreamFromString(text: string) {
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    }
  });
}

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

function summarizeRows(
  rows: { clicks: number; impressions: number; ctr: number; position: number }[],
  totalRows: number
) {
  if (!rows?.length) return { totalRows, aggregatedRows: 0 };
  const agg = rows.reduce(
    (acc, r) => {
      acc.clicks.sum += r.clicks;
      acc.impr.sum += r.impressions;
      acc.ctr.sum += r.ctr;
      acc.pos.sum += r.position;
      acc.clicks.min = Math.min(acc.clicks.min, r.clicks);
      acc.impr.min = Math.min(acc.impr.min, r.impressions);
      acc.ctr.min = Math.min(acc.ctr.min, r.ctr);
      acc.pos.min = Math.min(acc.pos.min, r.position);
      acc.clicks.max = Math.max(acc.clicks.max, r.clicks);
      acc.impr.max = Math.max(acc.impr.max, r.impressions);
      acc.ctr.max = Math.max(acc.ctr.max, r.ctr);
      acc.pos.max = Math.max(acc.pos.max, r.position);
      return acc;
    },
    {
      clicks: { sum: 0, min: Infinity, max: -Infinity },
      impr: { sum: 0, min: Infinity, max: -Infinity },
      ctr: { sum: 0, min: Infinity, max: -Infinity },
      pos: { sum: 0, min: Infinity, max: -Infinity }
    }
  );
  const n = rows.length;
  return {
    totalRows,
    aggregatedRows: n,
    avg: {
      clicks: agg.clicks.sum / n,
      impressions: agg.impr.sum / n,
      ctr: agg.ctr.sum / n,
      position: agg.pos.sum / n
    },
    min: {
      clicks: agg.clicks.min,
      impressions: agg.impr.min,
      ctr: agg.ctr.min,
      position: agg.pos.min
    },
    max: {
      clicks: agg.clicks.max,
      impressions: agg.impr.max,
      ctr: agg.ctr.max,
      position: agg.pos.max
    }
  };
}

async function getAccessToken(userId: string) {
  const account = await getUserAccount(userId);
  if (!account?.refresh_token) throw new Error("Not connected");
  const tokens = await refreshAccessToken(decrypt(account.refresh_token));
  return tokens.access_token;
}

async function persistUserMessage(sessionId: string, userId: string, content: any) {
  await prisma.chatMessage.create({
    data: { sessionId, userId, role: "user", content: JSON.stringify(content) }
  });
}

async function persistAssistantMessage(sessionId: string, content: any, model?: string) {
  await prisma.chatMessage.create({
    data: { sessionId, role: "assistant", content: JSON.stringify(content), model }
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const abortHandler = () => {
    console.warn("[agent] request aborted", { userId });
  };
  try {
    req.signal?.addEventListener("abort", abortHandler);
  } catch {
    // no-op if signal unavailable
  }

  const body = inputSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { message: rawMessage, sessionId: incomingSessionId, siteHint, runbookId } = body.data;
  const message = rawMessage?.trim() ?? "";
  const runbookLabel = runbookId ? RUNBOOKS[runbookId]?.label : null;

  // upsert session
  const sessionRecord = incomingSessionId
    ? await prisma.chatSession.findFirst({ where: { id: incomingSessionId, userId, archived: false } })
    : null;

  const titleSeed = message || runbookLabel || "Neue Unterhaltung";
  const chatSession: ChatSession =
    sessionRecord ??
    (await prisma.chatSession.create({
      data: { userId, title: titleSeed.slice(0, 60) }
    }));

  console.log("[agent] request", { userId, sessionId: chatSession.id, message, runbookId });

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
  if (message) {
    coreMessages.push({ role: "user", content: message });
  }

  // resolve default property: prefer exact siteHint, else last session property if stored, else first available
  let resolvedSite: string | null = null;
  let accessToken: string | null = null;
  try {
    accessToken = await getAccessToken(userId);
    const sites = await listSites(accessToken);
    resolvedSite = resolveSite(sites, siteHint);
  } catch (err) {
    console.error("[agent] resolve site error", err);
  }

  if (runbookId) {
    if (!accessToken) {
      const text = "Die GSC-Verbindung ist nicht aktiv. Bitte verbinde dein Konto erneut.";
      return createTextStreamResponse({ textStream: textStreamFromString(text) });
    }
    if (!resolvedSite) {
      const text = "Es konnte keine Property gefunden werden. Bitte wähle zuerst eine GSC-Property aus.";
      return createTextStreamResponse({ textStream: textStreamFromString(text) });
    }

    const ranges = resolveDateRanges();
    const ctx = {
      siteUrl: resolvedSite,
      ranges,
      rowLimit: MAX_GSC_ROW_LIMIT,
      topN: 50,
      cannibalTopQueries: 200,
      cannibalMinImpr: 100
    };

    let output;
    try {
      if (runbookId === "quick_wins") output = await runQuickWins(accessToken, ctx);
      else if (runbookId === "content_decay") output = await runContentDecay(accessToken, ctx);
      else if (runbookId === "cannibalization") output = await runCannibalization(accessToken, ctx);
      else if (runbookId === "top_queries") output = await runTopQueries(accessToken, ctx);
      else if (runbookId === "top_pages") output = await runTopPages(accessToken, ctx);
      else output = await runAudit(accessToken, ctx);
    } catch (err: any) {
      console.error("[agent] runbook error", err);
      const text = "Beim Abrufen der GSC-Daten ist ein Fehler aufgetreten. Bitte versuche es erneut.";
      return createTextStreamResponse({ textStream: textStreamFromString(text) });
    }

    const runbookSystem = `RUNBOOK-MODUS
- Du erhältst vorbereitete GSC-Daten (JSON). Nutze ausschließlich diese Daten.
- Keine Tool-Calls, keine Rückfragen.
- Antworte auf Deutsch, prägnant.
- Gib eine kurze Zusammenfassung (max. 5 Sätze) und füge danach EINEN Actions-Block hinzu.
- Actions-Block Format:
  [[JSON]]
  { "type": "actions", "items": ["...", "..."] }
  [[/JSON]]
`;

    const llmPayload = {
      runbookId,
      label: runbookLabel,
      siteUrl: resolvedSite,
      ranges,
      facts: output.facts
    };

    const result = await streamText({
      model: openai("gpt-5-mini-2025-08-07"),
      system: runbookSystem,
      messages: [{ role: "user", content: JSON.stringify(llmPayload) }],
      stopWhen: stepCountIs(5)
    });

    const summaryText = (await result.text).trim();
    const blocksText = renderBlocks(output.blocks);
    const finalText = summaryText ? `${summaryText}${blocksText}` : blocksText;

    try {
      await persistUserMessage(chatSession.id, userId, {
        text: message || runbookLabel || "Runbook",
        runbookId
      });
      await persistAssistantMessage(chatSession.id, { text: finalText }, (result as any)?.response?.modelId);
      await prisma.chatSession.update({
        where: { id: chatSession.id },
        data: {
          title: chatSession.title?.startsWith("Neue Unterhaltung")
            ? (message || runbookLabel || "Runbook").slice(0, 60)
            : chatSession.title
        }
      });
    } catch (err) {
      console.error("[agent] runbook persist error", err);
    }

    return createTextStreamResponse({ textStream: textStreamFromString(finalText) });
  }

  const agentTools: any = {
    listSites: tool({
      description: "List GSC sites for the current user",
      inputSchema: z.object({}),
      execute: async () => {
        console.log("[agent] tool:listSites start", { userId });
        const token = await getAccessToken(userId);
        const sites = await listSites(token);
        console.log("[agent] tool:listSites done", { count: sites.length });
        return {
          type: "data",
          sites: sites.map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }))
        };
      }
    }) as any,
    querySearchAnalytics: tool({
      description: "Query Google Search Console searchAnalytics",
      inputSchema: querySchema,
      execute: async (input: z.infer<typeof querySchema>) => {
        const started = Date.now();
        const siteUrl = input.siteUrl ?? resolvedSite;
        const rowLimit = Math.min(input.rowLimit ?? MAX_GSC_ROW_LIMIT, MAX_GSC_ROW_LIMIT);
        const startRow = Math.max(input.startRow ?? 0, 0);
        console.log("[agent] tool:querySearchAnalytics start", {
          siteUrl,
          dims: input.dimensions,
          rowLimit,
          startRow
        });
        if (!siteUrl || !input.startDate || !input.endDate || input.dimensions.length === 0) {
          return { type: "error", code: "validation_error", message: "siteUrl, dates und dimensions sind erforderlich." };
        }
        try {
          const token = await getAccessToken(userId);
          const rows = await searchAnalyticsQuery(token, siteUrl, {
            startDate: input.startDate,
            endDate: input.endDate,
            dimensions: input.dimensions,
            rowLimit,
            startRow,
            dimensionFilterGroups:
              input.filters && input.filters.length > 0
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
          const totalRows = rows?.length ?? 0;
          const stats = summarizeRows(rows, totalRows);
          console.log("[agent] tool:querySearchAnalytics done", {
            rows: totalRows,
            ms: Date.now() - started
          });
          return {
            type: "data",
            rows,
            totalRows,
            truncated: false,
            stats,
            pagination: { rowLimit, startRow }
          };
        } catch (err: any) {
          console.error("[agent] tool:querySearchAnalytics error", err);
          return { type: "error", code: "gsc_query_failed", message: err?.message ?? "GSC query failed" };
        }
      }
    }) as any,
    exportCsv: tool({
      description: "Create a CSV file from provided rows and return a download reference",
      inputSchema: exportSchema,
      execute: async (input: z.infer<typeof exportSchema>) => {
        console.log("[agent] tool:exportCsv start", { rows: input.rows.length, filename: input.filename });
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
        const result = {
          type: "file",
          fileId: id,
          filename,
          mime: "text/csv",
          size: stats.size,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString()
        };
        console.log("[agent] tool:exportCsv done", result);
        return result;
      }
    }) as any
  };

  try {
    const started = Date.now();
    console.log("[agent] stream start", {
      sessionId: chatSession.id,
      model: "gpt-5-mini-2025-08-07",
      resolvedSite
    });
    const result = await streamText({
      model: openai("gpt-5-mini-2025-08-07"),
      messages: coreMessages as any,
      system: `ZUSÄTZLICHE BETRIEBSREGELN
DEFAULT_PROPERTY: ${resolvedSite ?? "unbekannt"}

STANDARDZEITRÄUME
- Standard: letzte 28 Tage.
- Vergleich: vorherige 28 Tage.
- Wenn der User keinen Zeitraum nennt, nutze den Standard.

SPRACHE & STIL
- Antworte auf Deutsch, präzise und prägnant.
- Vermeide lange Einleitungen. Fokus auf Erkenntnisse und Maßnahmen.
- Keine technischen Setup-Details im Chat (keine siteUrl, Filter, Dimensionen erwähnen).

GSC-ONLY (STRICT)
- Aussagen NUR auf Basis von GSC-Daten.
- Kein Crawling: wenn nach H1/Title/On-Page gefragt wird, klar sagen: keine Crawl-Daten vorhanden; optional Hinweis "Crawler-Integration erforderlich".

FORMAT (JSON-BLOCKS)
- Strukturierte Inhalte IMMER als JSON-Blocks:
  [[JSON]]
  { ... }
  [[/JSON]]
- Erlaubte Blocktypen:
  type:"table" (columns, rows, title?)
  type:"metrics" (items[{label,value}], title?)
  type:"actions" (items[], title?)
  type:"note" (text, tone?)
- Tabellen/KPIs immer als JSON-Blocks rendern, niemals als Fließtext.
- Alles außerhalb der JSON-Blocks ist normaler Fließtext.

TOOL-CONTRACT (VERBINDLICH)
- Verfügbare Tools:
  1) listSites()
  2) querySearchAnalytics(siteUrl, startDate, endDate, dimensions[], rowLimit?, filters?)
  3) exportCsv(rows, filename?)
- Wenn echte GSC-Daten benötigt werden, nutze immer Tools (nie schätzen, nie erfinden).
- Wenn der Intent klar ist: sofort ausführen, nicht nachfragen.

PROPERTY-AUFLÖSUNG
- Nutze DEFAULT_PROPERTY. Keine Setup-Fragen. Rückfrage nur bei harten Blockern (kein Property / OAuth / Toolfehler).

FEHLERBEHANDLUNG
- Bei OAuth/Token/401/403: klar sagen, dass die Verbindung erneuert werden muss.
- Bei temporären Toolfehlern: bis zu 2 Retries, dann kompakt Fehler + nächster Schritt.
- Bei leeren Daten: transparent "keine ausreichenden Daten im gewählten Zeitraum".

EXPORT-REGELN
- exportCsv nur auf ausdrückliche Nachfrage des Users.
- Dateiname sprechend benennen: {property}_{intent}_{start}_{end}.csv
- Bei großen Abfragen paginiere: rowLimit <= 5000, nutze startRow.
- Wenn Tool ein Fehlerobjekt {type:"error", code, message} zurückgibt, erkläre den Fehler und biete nächsten Schritt an.

ANALYSE-QUALITÄT
- Für Kannibalisierung: immer query+page auswerten, inkl. Click-Share je URL, CTR/Position, Veränderung ggü. Vergleichszeitraum.
- Liefere priorisierte Findings nach Impact und konkrete Next Actions.
- Keine Frage wie "Welche Daten soll ich abrufen?", wenn der Intent bereits klar ist.
`,
      tools: agentTools as any,
      // allow up to 6 LLM/tool iterations; prevents infinite loops while enabling multi-step tool use
      stopWhen: stepCountIs(15),
      onFinish: async ({ text, toolCalls, response }) => {
        try {
          console.log("[agent] finish", {
            sessionId: chatSession.id,
            text: text?.slice(0, 120),
            toolCalls,
            responseId: (response as any)?.id,
            model: (response as any)?.modelId ?? (response as any)?.model,
            ms: Date.now() - started
          });
          await persistUserMessage(chatSession.id, userId, { text: message });
          await persistAssistantMessage(chatSession.id, { text, toolCalls, response }, response?.modelId);
          await prisma.chatSession.update({
            where: { id: chatSession.id },
            data: {
              title: chatSession.title?.startsWith("Neue Unterhaltung") ? message.slice(0, 60) : chatSession.title
            }
          });
        } catch (err) {
          console.error("[agent] onFinish error", err);
        }
      }
    });

    const textStream = new ReadableStream<string>({
      async start(controller) {
        try {
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              controller.enqueue(part.text);
              continue;
            }
            if (part.type === "tool-call") {
              controller.enqueue(formatStatusBlock(part.toolName, "running"));
              continue;
            }
            if (part.type === "tool-result") {
              controller.enqueue(formatStatusBlock(part.toolName, "done"));
              continue;
            }
            if (part.type === "tool-error") {
              controller.enqueue(formatStatusBlock(part.toolName, "error"));
            }
          }
        } catch (err) {
          controller.error(err);
          return;
        }
        controller.close();
      }
    });

    return createTextStreamResponse({ textStream });
  } catch (err: any) {
    console.error("[agent] error", err);
    return NextResponse.json({ error: err?.message ?? "agent error" }, { status: 500 });
  }
}
