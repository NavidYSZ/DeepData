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

const bodySchema = z.object({
  clusters: z.array(z.object({ name: z.string(), keywordIds: z.array(z.string()) })).min(1),
  leftoverKeywordIds: z.array(z.string()).min(1)
});

type AiAssignResponse = {
  assignments: { keywordId: string; clusterName: string }[];
  newClusters: { name: string; keywordIds: string[] }[];
  leftoverKeywordIds: string[];
  rationale?: string;
};

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  if (!process.env.OPENAI_API_KEY) return err("NO_API_KEY", "OPENAI_API_KEY not configured on server", {}, 500);

  const project = await prisma.keywordProject.findFirst({ where: { id: ctx.params.id, userId } });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", { projectId: ctx.params.id }, 404);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return err("INVALID_BODY", "Invalid body shape. Provide clusters and leftoverKeywordIds.");
  }

  const keywordIds = Array.from(new Set(body.leftoverKeywordIds));
  const keywords = await prisma.keyword.findMany({
    where: { projectId: project.id, id: { in: keywordIds } },
    include: { demand: true }
  });
  if (!keywords.length) return err("NO_KEYWORDS", "No matching leftover keywords found for project", {}, 404);

  const keywordMap = new Map(keywords.map((k) => [k.id, k]));

  const clustersForPrompt = body.clusters.map((c) => ({
    name: c.name,
    keywordIds: c.keywordIds,
    keywords: c.keywordIds
      .map((id) => keywordMap.get(id))
      .filter(Boolean)
      .map((k) => ({
        id: k!.id,
        text: k!.kwRaw,
        demand: k!.demand?.demandMonthly ?? 0
      }))
  }));

  const leftoverForPrompt = keywords.map((k) => ({
    id: k.id,
    text: k.kwRaw,
    demand: k.demand?.demandMonthly ?? 0
  }));

  const payload = { clusters: clustersForPrompt, leftoverKeywords: leftoverForPrompt };

  const systemPrompt =
    "You are a precise SEO keyword clustering assistant. You receive proposed clusters plus leftover keywords. " +
    "Assign every leftover keyword to the best cluster. If none fit, create a small new cluster. " +
    "Return STRICT JSON only: {\"assignments\":[{\"keywordId\":\"\",\"clusterName\":\"\"}],\"newClusters\":[{\"name\":\"\",\"keywordIds\":[]}],\"leftoverKeywordIds\":[],\"rationale\":\"optional\"}. " +
    "Use only provided keywordIds. Do not invent ids or texts.";

  const userPrompt = `Here are clusters and leftover keywords:\n${JSON.stringify(payload, null, 2)}\nReturn the JSON as specified.`;

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

  let parsed: AiAssignResponse;
  try {
    parsed = parseJsonFromText<AiAssignResponse>(result.text);
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
