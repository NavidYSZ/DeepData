import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { fetchAndExtract } from "@/lib/nlp/extract";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/nlp/extraction-prompt";
import type { ExtractionOutput } from "@/lib/nlp/types";

export const maxDuration = 120;

// Bump this whenever the route logic changes so the client can confirm
// the redeploy is live. Visible in the JSON response as `_routeVersion`.
const ROUTE_VERSION = "2026-05-11.4-direct-fetch";

const bodySchema = z.object({
  url: z.string().url()
});

const MAX_TEXT_CHARS = 24_000;
const DEEPSEEK_TIMEOUT_MS = 110_000;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error:
          "Missing DEEPSEEK_API_KEY. Set DEEPSEEK_API_KEY in your env. Optional: DEEPSEEK_BASE_URL (default https://api.deepseek.com), DEEPSEEK_MODEL (default deepseek-v4-pro)."
      },
      { status: 500 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { _routeVersion: ROUTE_VERSION, error: "Invalid body" },
      { status: 400 }
    );
  }

  let extracted;
  try {
    extracted = await fetchAndExtract(body.url);
  } catch (err: any) {
    return NextResponse.json(
      { _routeVersion: ROUTE_VERSION, error: err?.message ?? "Failed to fetch URL" },
      { status: 422 }
    );
  }

  if (extracted.text.length < 50) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error:
          "Extracted body content is too short (<50 chars). The page may require JavaScript, be paywalled, or block bots.",
        extracted
      },
      { status: 422 }
    );
  }

  const truncated = extracted.text.slice(0, MAX_TEXT_CHARS);
  const baseURL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const endpoint = `${baseURL}/chat/completions`;
  const modelId = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

  console.log(`[nlp/llm ${ROUTE_VERSION}] POST ${endpoint} model=${modelId}`);

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

  let upstreamRes: Response;
  let upstreamText: string;
  try {
    upstreamRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      },
      body: JSON.stringify({
        model: modelId,
        temperature: 0.1,
        stream: false,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: `# Der zu analysierende Text:\n\n${truncated}` }
        ]
      }),
      signal: controller.signal
    });
    upstreamText = await upstreamRes.text();
  } catch (err: any) {
    clearTimeout(timer);
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: err?.name === "AbortError" ? "DeepSeek request timed out" : err?.message ?? "Network error calling DeepSeek",
        endpoint,
        model: modelId
      },
      { status: 502 }
    );
  }
  clearTimeout(timer);

  console.log(
    `[nlp/llm ${ROUTE_VERSION}] response status=${upstreamRes.status} bytes=${upstreamText.length} in ${Date.now() - started}ms`
  );

  if (!upstreamRes.ok) {
    let parsedBody: unknown = upstreamText;
    try {
      parsedBody = JSON.parse(upstreamText);
    } catch {
      /* keep as raw text */
    }
    const hint =
      upstreamRes.status === 404
        ? `Endpoint or model not found. Verify base URL (${baseURL}) and model "${modelId}". Valid models: deepseek-v4-pro, deepseek-v4-flash.`
        : upstreamRes.status === 401
          ? "DeepSeek rejected the API key — check DEEPSEEK_API_KEY."
          : upstreamRes.status === 402
            ? "DeepSeek payment required — top up your account balance."
            : upstreamRes.status === 429
              ? "DeepSeek rate-limit or quota exceeded."
              : undefined;
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: `DeepSeek HTTP ${upstreamRes.status} ${upstreamRes.statusText}`,
        hint,
        statusCode: upstreamRes.status,
        endpoint,
        url: endpoint,
        baseURL,
        model: modelId,
        responseBody: parsedBody,
        extracted
      },
      { status: 502 }
    );
  }

  let upstreamJson: any;
  try {
    upstreamJson = JSON.parse(upstreamText);
  } catch (err: any) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: "DeepSeek returned non-JSON response",
        details: err?.message ?? String(err),
        raw: upstreamText.slice(0, 2000),
        extracted
      },
      { status: 502 }
    );
  }

  const resultText: string | undefined = upstreamJson?.choices?.[0]?.message?.content;
  if (typeof resultText !== "string" || !resultText.length) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: "DeepSeek response missing choices[0].message.content",
        upstream: upstreamJson,
        extracted
      },
      { status: 502 }
    );
  }

  let parsed: ExtractionOutput;
  try {
    parsed = parseJsonFromText<ExtractionOutput>(resultText);
  } catch (err: any) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: "LLM response could not be parsed as JSON",
        details: err?.message ?? String(err),
        raw: resultText,
        extracted
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    _routeVersion: ROUTE_VERSION,
    extracted: {
      ...extracted,
      analyzedChars: truncated.length,
      truncated: truncated.length < extracted.text.length
    },
    extraction: parsed,
    model: modelId,
    durationMs: Date.now() - started,
    usage: upstreamJson?.usage ?? null
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
