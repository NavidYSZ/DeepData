import { EXTRACTION_SYSTEM_PROMPT } from "./extraction-prompt";
import type { ExtractionOutput } from "./types";

export const LLM_TIMEOUT_MS = 900_000;
export const MAX_TEXT_CHARS = 24_000;

// Default max output tokens for the single-shot extraction. Multi-step
// pipelines override this per step via runLlmJsonCall.
// GPT-5.4 supports a large completion budget; max_completion_tokens covers
// reasoning + content together, so we set this fat to leave headroom for
// thinking mode.
const DEFAULT_MAX_TOKENS = 380_000;

export type LlmJsonCallSuccess<T> = {
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

export type LlmJsonCallFailure = {
  ok: false;
  status: number;
  body: Record<string, unknown>;
};

export type LlmJsonCallResult<T> = LlmJsonCallSuccess<T> | LlmJsonCallFailure;

export type ModelHint = "default" | "fast";

export type LlmJsonCallOptions = {
  systemPrompt: string;
  userMessage: string;
  routeVersion: string;
  routeLogPrefix: string;
  /**
   * Hard max output tokens for this call. Defaults to DEFAULT_MAX_TOKENS.
   * Each step in a multi-step pipeline sets this explicitly.
   * On OpenAI this is sent as `max_completion_tokens`.
   */
  maxTokens?: number;
  /**
   * Reasoning toggle. Maps to OpenAI's `reasoning_effort`:
   * - true: `medium` (synthesis-style steps)
   * - false: `minimal` (mechanical extraction)
   * - undefined: omit field, let API default apply
   */
  enableThinking?: boolean;
  /**
   * Per-call override for the OpenAI model id. Wins over OPENAI_MODEL env
   * and over `modelHint`.
   */
  modelOverride?: string;
  /**
   * Provider-agnostic hint instead of a full override. Map-Reduce uses
   * "fast" for Phase 1 → resolves to OPENAI_MODEL_FAST (default gpt-5.4-mini).
   * "default" (or undefined) → OPENAI_MODEL (default gpt-5.4).
   */
  modelHint?: ModelHint;
  /**
   * Optional label included in console logs. Useful when chaining steps.
   */
  stepLabel?: string;
};

export type LlmExtractSuccess = {
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

export type LlmExtractFailure = LlmJsonCallFailure;

export type LlmExtractResult = LlmExtractSuccess | LlmExtractFailure;

export type LlmExtractOptions = {
  text: string;
  routeVersion: string;
  routeLogPrefix: string;
  userMessageBuilder?: (text: string) => string;
};

const defaultUserMessageBuilder = (text: string) =>
  `# Der zu analysierende Text:\n\n${text}`;

export function resolveModel(hint?: ModelHint): string {
  if (hint === "fast") {
    return process.env.OPENAI_MODEL_FAST ?? "gpt-5.4-mini";
  }
  return process.env.OPENAI_MODEL ?? "gpt-5.4";
}

/**
 * Single-shot extraction call using the unified EXTRACTION_SYSTEM_PROMPT.
 * Kept for the "single" pipeline mode in both routes.
 */
export async function runLlmExtraction(
  options: LlmExtractOptions
): Promise<LlmExtractResult> {
  const buildUserMessage = options.userMessageBuilder ?? defaultUserMessageBuilder;
  const result = await runLlmJsonCall<ExtractionOutput>({
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
 * Generic OpenAI JSON-mode call (chat completions API). Used by both
 * runLlmExtraction and the multi-step pipeline orchestrators in
 * lib/nlp/pipeline.ts.
 *
 * Uses `max_completion_tokens` (not legacy `max_tokens`) and
 * `reasoning_effort` (not DeepSeek's `thinking`). Omits `temperature`
 * because gpt-5 reasoning models reject custom values.
 */
export async function runLlmJsonCall<T>(
  options: LlmJsonCallOptions
): Promise<LlmJsonCallResult<T>> {
  const {
    systemPrompt,
    userMessage,
    routeVersion,
    routeLogPrefix,
    maxTokens = DEFAULT_MAX_TOKENS,
    enableThinking,
    modelOverride,
    modelHint,
    stepLabel
  } = options;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      body: {
        _routeVersion: routeVersion,
        error:
          "Missing OPENAI_API_KEY. Set OPENAI_API_KEY in your env. Optional: OPENAI_BASE_URL (default https://api.openai.com/v1), OPENAI_MODEL (default gpt-5.4), OPENAI_MODEL_FAST (default gpt-5.4-mini)."
      }
    };
  }

  const baseURL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/$/,
    ""
  );
  const endpoint = `${baseURL}/chat/completions`;
  const modelId = modelOverride || resolveModel(modelHint);

  // enableThinking → reasoning_effort. Undefined leaves the field off so
  // the API default applies (varies by model).
  // GPT-5.x models accept: "none" | "low" | "medium" | "high" | "xhigh".
  // ("minimal" is not supported on gpt-5.4 / gpt-5.4-mini.)
  let reasoningEffort: string | undefined;
  if (enableThinking === false) reasoningEffort = "none";
  else if (enableThinking === true) reasoningEffort = "medium";

  const requestBody: Record<string, unknown> = {
    model: modelId,
    stream: true,
    max_completion_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ]
  };
  if (reasoningEffort) requestBody.reasoning_effort = reasoningEffort;

  const label = stepLabel ? ` step=${stepLabel}` : "";
  console.log(
    `[${routeLogPrefix} ${routeVersion}]${label} POST ${endpoint} model=${modelId} reasoning_effort=${reasoningEffort ?? "default"} stream=true max_completion_tokens=${maxTokens} sysChars=${systemPrompt.length} userChars=${userMessage.length}`
  );

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

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
          ? "OpenAI request timed out (no response headers within timeout)"
          : (err as Error)?.message ?? "Network error calling OpenAI",
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
        ? `Bad request — check that model "${modelId}" exists for your key and accepts reasoning_effort + response_format=json_object. May also be max_completion_tokens too high.`
        : upstreamRes.status === 401
          ? "OpenAI rejected the API key — check OPENAI_API_KEY."
          : upstreamRes.status === 403
            ? "OpenAI forbids this request — your account may not have access to this model."
            : upstreamRes.status === 404
              ? `Endpoint or model not found. Verify base URL (${baseURL}) and model "${modelId}".`
              : upstreamRes.status === 429
                ? "OpenAI rate-limit or quota exceeded."
                : undefined;
    return {
      ok: false,
      status: 502,
      body: {
        _routeVersion: routeVersion,
        error: `OpenAI HTTP ${upstreamRes.status} ${upstreamRes.statusText}`,
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
        error: "OpenAI returned empty stream",
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
          ? `OpenAI stream timed out after ${Math.round((Date.now() - started) / 1000)}s (first chunk: ${firstChunkAt ? `${firstChunkAt - started}ms` : "never"})`
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
        error: "OpenAI stream produced no content",
        endpoint,
        model: modelId,
        stepLabel,
        finishReason,
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
