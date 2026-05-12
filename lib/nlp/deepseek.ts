import { EXTRACTION_SYSTEM_PROMPT } from "./extraction-prompt";
import type { ExtractionOutput } from "./types";

export const DEEPSEEK_TIMEOUT_MS = 290_000;
export const MAX_TEXT_CHARS = 24_000;

// Default max output tokens for the single-shot extraction. Multi-step
// pipelines override this per step via runDeepSeekJsonCall.
const DEFAULT_MAX_TOKENS = 8000;

export type DeepSeekJsonCallSuccess<T> = {
  ok: true;
  data: T;
  endpoint: string;
  baseURL: string;
  model: string;
  durationMs: number;
  firstChunkMs: number | null;
  usage: unknown;
  finishReason: string | null;
};

export type DeepSeekJsonCallFailure = {
  ok: false;
  status: number;
  body: Record<string, unknown>;
};

export type DeepSeekJsonCallResult<T> =
  | DeepSeekJsonCallSuccess<T>
  | DeepSeekJsonCallFailure;

export type DeepSeekJsonCallOptions = {
  systemPrompt: string;
  userMessage: string;
  routeVersion: string;
  routeLogPrefix: string;
  /**
   * Hard max output tokens for this call. Defaults to DEFAULT_MAX_TOKENS.
   * Each step in a multi-step pipeline sets this explicitly.
   */
  maxTokens?: number;
  /**
   * Override the env-var driven thinking/reasoning mode.
   * - true: enable reasoning (omits the thinking.disabled flag)
   * - false: explicitly disable reasoning
   * - undefined: fall back to DEEPSEEK_DISABLE_THINKING env var (default disabled)
   */
  enableThinking?: boolean;
  /**
   * Optional label included in console logs. Useful when chaining steps.
   */
  stepLabel?: string;
};

export type DeepSeekExtractSuccess = {
  ok: true;
  extraction: ExtractionOutput;
  endpoint: string;
  baseURL: string;
  model: string;
  durationMs: number;
  firstChunkMs: number | null;
  usage: unknown;
  finishReason: string | null;
};

export type DeepSeekExtractFailure = DeepSeekJsonCallFailure;

export type DeepSeekExtractResult =
  | DeepSeekExtractSuccess
  | DeepSeekExtractFailure;

export type DeepSeekExtractOptions = {
  text: string;
  routeVersion: string;
  routeLogPrefix: string;
  userMessageBuilder?: (text: string) => string;
};

const defaultUserMessageBuilder = (text: string) =>
  `# Der zu analysierende Text:\n\n${text}`;

/**
 * Single-shot extraction call using the unified EXTRACTION_SYSTEM_PROMPT.
 * Kept for backwards compatibility with the existing routes' "single"
 * pipeline mode.
 */
export async function runDeepSeekExtraction(
  options: DeepSeekExtractOptions
): Promise<DeepSeekExtractResult> {
  const buildUserMessage = options.userMessageBuilder ?? defaultUserMessageBuilder;
  const result = await runDeepSeekJsonCall<ExtractionOutput>({
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    userMessage: buildUserMessage(options.text),
    routeVersion: options.routeVersion,
    routeLogPrefix: options.routeLogPrefix,
    maxTokens: DEFAULT_MAX_TOKENS,
    stepLabel: "single-shot"
  });
  if (!result.ok) return result;
  return {
    ok: true,
    extraction: result.data,
    endpoint: result.endpoint,
    baseURL: result.baseURL,
    model: result.model,
    durationMs: result.durationMs,
    firstChunkMs: result.firstChunkMs,
    usage: result.usage,
    finishReason: result.finishReason
  };
}

/**
 * Generic DeepSeek JSON-mode call. Used by both runDeepSeekExtraction and
 * the multi-step pipeline orchestrators in lib/nlp/pipeline.ts.
 */
export async function runDeepSeekJsonCall<T>(
  options: DeepSeekJsonCallOptions
): Promise<DeepSeekJsonCallResult<T>> {
  const {
    systemPrompt,
    userMessage,
    routeVersion,
    routeLogPrefix,
    maxTokens = DEFAULT_MAX_TOKENS,
    enableThinking,
    stepLabel
  } = options;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      body: {
        _routeVersion: routeVersion,
        error:
          "Missing DEEPSEEK_API_KEY. Set DEEPSEEK_API_KEY in your env. Optional: DEEPSEEK_BASE_URL (default https://api.deepseek.com), DEEPSEEK_MODEL (default deepseek-v4-pro)."
      }
    };
  }

  const baseURL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(
    /\/$/,
    ""
  );
  const endpoint = `${baseURL}/chat/completions`;
  const modelId = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

  // Thinking/reasoning: an explicit param wins over the env var.
  const disableThinking =
    enableThinking === undefined
      ? (process.env.DEEPSEEK_DISABLE_THINKING ?? "true").toLowerCase() !== "false"
      : !enableThinking;

  const requestBody: Record<string, unknown> = {
    model: modelId,
    temperature: 0.1,
    stream: true,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ]
  };
  if (disableThinking) requestBody.thinking = { type: "disabled" };

  const label = stepLabel ? ` step=${stepLabel}` : "";
  console.log(
    `[${routeLogPrefix} ${routeVersion}]${label} POST ${endpoint} model=${modelId} thinking=${disableThinking ? "disabled" : "enabled"} stream=true max_tokens=${maxTokens} sysChars=${systemPrompt.length} userChars=${userMessage.length}`
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
  } catch (err: unknown) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 502,
      body: {
        _routeVersion: routeVersion,
        error: isAbort
          ? "DeepSeek request timed out (no response headers within timeout)"
          : (err as Error)?.message ?? "Network error calling DeepSeek",
        endpoint,
        model: modelId,
        stepLabel
      }
    };
  }

  const headersAt = Date.now();
  console.log(
    `[${routeLogPrefix} ${routeVersion}]${label} headers status=${upstreamRes.status} in ${headersAt - started}ms`
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
    return {
      ok: false,
      status: 502,
      body: {
        _routeVersion: routeVersion,
        error: `DeepSeek HTTP ${upstreamRes.status} ${upstreamRes.statusText}`,
        hint,
        statusCode: upstreamRes.status,
        endpoint,
        url: endpoint,
        baseURL,
        model: modelId,
        stepLabel,
        responseBody: parsedBody
      }
    };
  }

  if (!upstreamRes.body) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 502,
      body: {
        _routeVersion: routeVersion,
        error: "DeepSeek returned empty stream",
        endpoint,
        model: modelId,
        stepLabel
      }
    };
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
          `[${routeLogPrefix} ${routeVersion}]${label} first chunk after ${firstChunkAt - started}ms`
        );
      }
      buffer += decoder.decode(value, { stream: true });
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
  } catch (err: unknown) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 502,
      body: {
        _routeVersion: routeVersion,
        error: isAbort
          ? `DeepSeek stream timed out after ${Math.round((Date.now() - started) / 1000)}s (first chunk: ${firstChunkAt ? `${firstChunkAt - started}ms` : "never"})`
          : (err as Error)?.message ?? "Stream read error",
        endpoint,
        model: modelId,
        stepLabel,
        firstChunkMs: firstChunkAt ? firstChunkAt - started : null,
        partial: resultText.slice(0, 2000)
      }
    };
  }
  clearTimeout(timer);

  console.log(
    `[${routeLogPrefix} ${routeVersion}]${label} stream complete in ${Date.now() - started}ms, ${resultText.length} chars, finish=${finishReason}`
  );

  if (!resultText) {
    return {
      ok: false,
      status: 502,
      body: {
        _routeVersion: routeVersion,
        error: "DeepSeek stream produced no content",
        endpoint,
        model: modelId,
        stepLabel,
        firstChunkMs: firstChunkAt ? firstChunkAt - started : null
      }
    };
  }

  let data: T;
  try {
    data = parseJsonFromText<T>(resultText);
  } catch (err: unknown) {
    return {
      ok: false,
      status: 502,
      body: {
        _routeVersion: routeVersion,
        error: "LLM response could not be parsed as JSON",
        details: (err as Error)?.message ?? String(err),
        stepLabel,
        finishReason,
        raw: resultText
      }
    };
  }

  return {
    ok: true,
    data,
    endpoint,
    baseURL,
    model: modelId,
    durationMs: Date.now() - started,
    firstChunkMs: firstChunkAt ? firstChunkAt - started : null,
    usage,
    finishReason
  };
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
