import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || ""
});

function err(code: string, message: string, details: Record<string, unknown> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

function parseJsonFromText<T>(text: string): T {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) throw new Error("No JSON object found");
  const slice = text.slice(firstBrace, lastBrace + 1);
  return JSON.parse(slice) as T;
}

type KeywordLite = { id: string; text: string; demand: number };
type ClusterLite = { id: string; label: string; totalDemand: number; keywords: KeywordLite[] };

type AiSuggestResponse = {
  clusters: { name: string; keywordIds: string[]; note?: string }[];
  leftoverKeywordIds: string[];
  rationale?: string;
};

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  if (!process.env.OPENAI_API_KEY) return err("NO_API_KEY", "OPENAI_API_KEY not configured on server", {}, 500);

  const project = await prisma.keywordProject.findFirst({ where: { id: ctx.params.id, userId } });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", { projectId: ctx.params.id }, 404);

  const preclusters = await prisma.precluster.findMany({
    where: { projectId: project.id },
    orderBy: [{ totalDemand: "desc" }, { label: "asc" }],
    include: {
      members: {
        include: {
          keyword: { include: { demand: true } }
        }
      }
    }
  });

  const clusters: ClusterLite[] = preclusters.map((c) => {
    const kwUnique = new Map<string, KeywordLite>();
    c.members.forEach((m) => {
      if (kwUnique.has(m.keywordId)) return;
      kwUnique.set(m.keywordId, {
        id: m.keywordId,
        text: m.keyword.kwRaw,
        demand: m.keyword.demand?.demandMonthly ?? 0
      });
    });
    // keep prompt small but representative
    const keywords = Array.from(kwUnique.values()).slice(0, 120);
    return {
      id: c.id,
      label: c.label,
      totalDemand: c.totalDemand,
      keywords
    };
  });

  const keywordIdsInClusters = new Set<string>();
  clusters.forEach((c) => c.keywords.forEach((k) => keywordIdsInClusters.add(k.id)));

  const leftoverKeywords = await prisma.keyword.findMany({
    where: { projectId: project.id, id: { notIn: Array.from(keywordIdsInClusters) } },
    take: 120,
    orderBy: [{ demand: { demandMonthly: "desc" } }],
    include: { demand: true }
  });

  const payload = {
    clusters: clusters.map((c) => ({
      id: c.id,
      name: c.label,
      totalDemand: Math.round(c.totalDemand),
      keywords: c.keywords
    })),
    leftoverKeywords: leftoverKeywords.map((k) => ({
      id: k.id,
      text: k.kwRaw,
      demand: k.demand?.demandMonthly ?? 0
    }))
  };

  const systemPrompt =
    "You are a precise SEO keyword clustering assistant. You receive clusters with keyword IDs and texts. " +
    "Clean and improve the clusters: merge duplicates, rename for clarity, move keywords when they obviously belong elsewhere. " +
    "If a keyword does not fit any cluster, put its ID into leftoverKeywordIds. " +
    "Respond with STRICT JSON only: {\"clusters\":[{\"name\":\"\",\"keywordIds\":[],\"note\":\"optional\"}],\"leftoverKeywordIds\":[],\"rationale\":\"optional\"}. " +
    "Use only the provided keywordIds. Do not invent new ids or texts.";

  const userPrompt = `Here is the current clustering JSON:\n${JSON.stringify(payload, null, 2)}\nReturn the cleaned JSON as specified.`;

  const started = Date.now();
  const result = await generateText({
    model: openai("gpt-4.1-mini"),
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });
  const durationMs = Date.now() - started;

  let parsed: AiSuggestResponse;
  try {
    parsed = parseJsonFromText<AiSuggestResponse>(result.text);
  } catch (e) {
    return err("PARSE_ERROR", "AI response could not be parsed as JSON", { text: result.text, error: String(e) }, 500);
  }

  return NextResponse.json({
    ...parsed,
    model: result.response?.modelId ?? "gpt-4.1-mini",
    durationMs,
    raw: result.text
  });
}
