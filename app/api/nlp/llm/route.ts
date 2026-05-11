import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { authOptions } from "@/lib/auth";
import { fetchAndExtract } from "@/lib/nlp/extract";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/nlp/extraction-prompt";
import type { ExtractionOutput } from "@/lib/nlp/types";

export const maxDuration = 120;

const bodySchema = z.object({
  url: z.string().url()
});

const MAX_TEXT_CHARS = 24_000;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing DEEPSEEK_API_KEY. Set DEEPSEEK_API_KEY in your .env.local. Optional: DEEPSEEK_BASE_URL (default https://api.deepseek.com), DEEPSEEK_MODEL (default deepseek-v4-pro, alt: deepseek-v4-flash)."
      },
      { status: 500 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let extracted;
  try {
    extracted = await fetchAndExtract(body.url);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to fetch URL" },
      { status: 422 }
    );
  }

  if (extracted.text.length < 50) {
    return NextResponse.json(
      {
        error:
          "Extracted body content is too short (<50 chars). The page may require JavaScript, be paywalled, or block bots.",
        extracted
      },
      { status: 422 }
    );
  }

  const truncated = extracted.text.slice(0, MAX_TEXT_CHARS);

  const deepseek = createOpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  });
  const modelId = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

  const userPrompt = `# Der zu analysierende Text:\n\n${truncated}`;

  const started = Date.now();
  let resultText: string;
  try {
    const result = await generateText({
      model: deepseek(modelId),
      temperature: 0.1,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    });
    resultText = result.text;
  } catch (err: any) {
    const statusCode: number | undefined = err?.statusCode ?? err?.status;
    const responseBody: string | undefined =
      err?.responseBody ?? err?.data?.error?.message ?? err?.cause?.message;
    const url: string | undefined = err?.url;
    const hint =
      statusCode === 404
        ? `Model "${modelId}" or endpoint not found. Valid models: deepseek-v4-pro, deepseek-v4-flash. Base URL must be https://api.deepseek.com (no /v1).`
        : statusCode === 401
          ? "DeepSeek rejected the API key — check DEEPSEEK_API_KEY."
          : undefined;
    return NextResponse.json(
      {
        error: err?.message ?? "DeepSeek request failed",
        hint,
        statusCode,
        url,
        responseBody,
        model: modelId,
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        extracted
      },
      { status: 502 }
    );
  }
  const durationMs = Date.now() - started;

  let parsed: ExtractionOutput;
  try {
    parsed = parseJsonFromText<ExtractionOutput>(resultText);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "LLM response could not be parsed as JSON",
        details: err?.message ?? String(err),
        raw: resultText,
        extracted
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    extracted: {
      ...extracted,
      analyzedChars: truncated.length,
      truncated: truncated.length < extracted.text.length
    },
    extraction: parsed,
    model: modelId,
    durationMs
  });
}

function parseJsonFromText<T>(text: string): T {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in response");
  }
  return JSON.parse(s.slice(firstBrace, lastBrace + 1)) as T;
}
