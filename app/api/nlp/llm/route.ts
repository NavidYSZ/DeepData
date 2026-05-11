import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { fetchAndExtract } from "@/lib/nlp/extract";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/nlp/extraction-prompt";
import type { ExtractionOutput } from "@/lib/nlp/types";

export const maxDuration = 300;

// Bump this whenever the route logic changes so the client can confirm
// the redeploy is live. Visible in the JSON response as `_routeVersion`.
const ROUTE_VERSION = "2026-05-11.6-thinking-disabled-streamed";

const bodySchema = z.object({
  url: z.string().url()
});

const MAX_TEXT_CHARS = 24_000;
const DEEPSEEK_TIMEOUT_MS = 290_000;

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

  const disableThinking = (process.env.DEEPSEEK_DISABLE_THINKING ?? "true").toLowerCase() !== "false";

  const requestBody: Record<string, unknown> = {
    model: modelId,
    temperature: 0.1,
    stream: true,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: `# Der zu analysierende Text:\n\n${truncated}` }
    ]
  };
  if (disableThinking) {
    // deepseek-v4-pro runs thinking-mode by default which can take minutes.
    // For structured JSON extraction we don't need reasoning tokens.
    requestBody.thinking = { type: "disabled" };
  }

  console.log(
    `[nlp/llm ${ROUTE_VERSION}] POST ${endpoint} model=${modelId} thinking=${disableThinking ? "disabled" : "enabled"} stream=true`
  );

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (err: any) {
    clearTimeout(timer);
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error:
          err?.name === "AbortError"
            ? "DeepSeek request timed out (no response headers within timeout)"
            : err?.message ?? "Network error calling DeepSeek",
        endpoint,
        model: modelId
      },
      { status: 502 }
    );
  }

  const headersAt = Date.now();
  console.log(
    `[nlp/llm ${ROUTE_VERSION}] headers status=${upstreamRes.status} in ${headersAt - started}ms`
  );

  if (!upstreamRes.ok) {
    clearTimeout(timer);
    const errText = await upstreamRes.text().catch(() => "");
    let parsedBody: unknown = errText;
    try {
      parsedBody = JSON.parse(errText);
    } catch {
      /* keep as raw text */
    }
    const hint =
      upstreamRes.status === 400
        ? "Bad request — check thinking/response_format support for this model or set DEEPSEEK_DISABLE_THINKING=false."
        : upstreamRes.status === 401
          ? "DeepSeek rejected the API key — check DEEPSEEK_API_KEY."
          : upstreamRes.status === 402
            ? "DeepSeek payment required — top up your account balance."
            : upstreamRes.status === 404
              ? `Endpoint or model not found. Verify base URL (${baseURL}) and model "${modelId}".`
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

  if (!upstreamRes.body) {
    clearTimeout(timer);
    return NextResponse.json(
      { _routeVersion: ROUTE_VERSION, error: "DeepSeek returned empty stream", extracted },
      { status: 502 }
    );
  }

  let resultText = "";
  let firstChunkAt: number | null = null;
  let usage: unknown = null;
  let finishReason: string | null = null;
  const reader = upstreamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (firstChunkAt === null) {
        firstChunkAt = Date.now();
        console.log(
          `[nlp/llm ${ROUTE_VERSION}] first chunk after ${firstChunkAt - started}ms`
        );
      }
      buffer += decoder.decode(value, { stream: true });
      // SSE: events separated by \n\n, each event has one or more `data: ...` lines.
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const evt of events) {
        for (const line of evt.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string") resultText += delta;
            const fr = parsed?.choices?.[0]?.finish_reason;
            if (fr) finishReason = fr;
            if (parsed?.usage) usage = parsed.usage;
          } catch {
            /* ignore malformed event */
          }
        }
      }
    }
  } catch (err: any) {
    clearTimeout(timer);
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error:
          err?.name === "AbortError"
            ? `DeepSeek stream timed out after ${Math.round((Date.now() - started) / 1000)}s (first chunk: ${firstChunkAt ? `${firstChunkAt - started}ms` : "never"})`
            : err?.message ?? "Stream read error",
        endpoint,
        model: modelId,
        firstChunkMs: firstChunkAt ? firstChunkAt - started : null,
        partial: resultText.slice(0, 2000),
        extracted
      },
      { status: 502 }
    );
  }
  clearTimeout(timer);

  console.log(
    `[nlp/llm ${ROUTE_VERSION}] stream complete in ${Date.now() - started}ms, ${resultText.length} chars, finish=${finishReason}`
  );

  if (!resultText) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: "DeepSeek stream produced no content",
        endpoint,
        model: modelId,
        firstChunkMs: firstChunkAt ? firstChunkAt - started : null,
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
    firstChunkMs: firstChunkAt ? firstChunkAt - started : null,
    usage,
    finishReason
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
