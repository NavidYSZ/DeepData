import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { fetchAndExtract } from "@/lib/nlp/extract";
import { runDeepSeekExtraction, MAX_TEXT_CHARS } from "@/lib/nlp/deepseek";
import {
  runPipeline,
  runKeywordMapReducePipeline,
  type PipelineStepMetric,
  type PipelineMode,
  type PipelineProgressEvent,
  type KeywordMapReduceSource
} from "@/lib/nlp/pipeline";
import { fetchSerpTopUrls } from "@/lib/nlp/serp";

export const maxDuration = 900;

const ROUTE_VERSION = "2026-05-12.8-mapreduce-fast";

const TOP_N_URLS = 5;
const PER_URL_RESERVE_CHARS = 200;
// Concat-mode (single/2step/3step/4step) shares one MAX_TEXT_CHARS budget
// across all 5 sources, so each gets ~4-5k chars.
const PER_URL_MAX_CHARS = Math.max(
  1200,
  Math.floor((MAX_TEXT_CHARS - PER_URL_RESERVE_CHARS * TOP_N_URLS) / TOP_N_URLS)
);
// Map-Reduce makes a separate LLM call per source, so each can use the full
// 20k chars without competing with the others.
const MAPREDUCE_PER_URL_MAX_CHARS = 20_000;

const bodySchema = z.object({
  keyword: z.string().min(2).max(200),
  pipeline: z
    .enum(["single", "2step", "3step", "4step", "mapreduce"])
    .default("single")
});

type ExtractedSource = {
  position: number;
  serpUrl: string;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
  source: string | null;
  totalChars: number;
  usedChars: number;
  truncated: boolean;
  error: string | null;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.ZYTE_API_KEY) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error:
          "Missing ZYTE_API_KEY. Required for SERP fetching in keyword mode. Set ZYTE_API_KEY in your env."
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

  const keyword = body.keyword.trim();
  const pipeline = body.pipeline;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          /* closed mid-write */
        }
      };
      const sendComment = (msg: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ${msg}\n\n`));
        } catch {
          /* closed */
        }
      };

      // Keepalive every 10s so any idle-timeout proxy keeps the connection
      // alive even during long DeepSeek calls.
      const keepalive = setInterval(() => sendComment("keepalive"), 10_000);

      const finish = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        // ---------- 1. SERP fetch ----------
        send("serp-start", { keyword });
        const serpStarted = Date.now();
        const serp = await fetchSerpTopUrls(keyword, { topN: TOP_N_URLS });
        const serpDurationMs = Date.now() - serpStarted;
        send("serp-done", {
          status: serp.status,
          urlCount: serp.urls.length,
          durationMs: serpDurationMs,
          error: serp.error ?? null
        });

        if (serp.error && serp.urls.length === 0) {
          send("error", {
            _routeVersion: ROUTE_VERSION,
            error: `SERP fetch failed: ${serp.error}`,
            keyword,
            serpStatus: serp.status,
            serpDurationMs
          });
          return finish();
        }

        if (serp.urls.length === 0) {
          send("error", {
            _routeVersion: ROUTE_VERSION,
            error: "No SERP results returned for this keyword",
            keyword,
            serpStatus: serp.status,
            serpDurationMs
          });
          return finish();
        }

        const topUrls = serp.urls.slice(0, TOP_N_URLS);

        // ---------- 2. Fetch + extract each URL in parallel ----------
        send("crawl-start", {
          urls: topUrls.map((u) => ({ position: u.position, url: u.url }))
        });
        const fetchStarted = Date.now();
        const extractResults = await Promise.allSettled(
          topUrls.map((u) => fetchAndExtract(u.url))
        );
        const fetchDurationMs = Date.now() - fetchStarted;

        const isMapReduce = pipeline === "mapreduce";
        const perUrlMaxChars = isMapReduce
          ? MAPREDUCE_PER_URL_MAX_CHARS
          : PER_URL_MAX_CHARS;
        const sources: ExtractedSource[] = [];
        const usableSections: string[] = [];
        const usableForMapReduce: KeywordMapReduceSource[] = [];

        for (let i = 0; i < topUrls.length; i++) {
          const u = topUrls[i];
          const result = extractResults[i];
          if (result.status === "rejected") {
            sources.push({
              position: u.position,
              serpUrl: u.url,
              finalUrl: null,
              title: null,
              description: null,
              source: null,
              totalChars: 0,
              usedChars: 0,
              truncated: false,
              error: (result.reason as Error)?.message ?? "extraction_failed"
            });
            continue;
          }
          const ex = result.value;
          if (ex.text.length < 50) {
            sources.push({
              position: u.position,
              serpUrl: u.url,
              finalUrl: ex.finalUrl,
              title: ex.title,
              description: ex.description,
              source: ex.source,
              totalChars: ex.text.length,
              usedChars: 0,
              truncated: false,
              error: "extracted_text_too_short"
            });
            continue;
          }
          const slice = ex.text.slice(0, perUrlMaxChars);
          sources.push({
            position: u.position,
            serpUrl: u.url,
            finalUrl: ex.finalUrl,
            title: ex.title,
            description: ex.description,
            source: ex.source,
            totalChars: ex.text.length,
            usedChars: slice.length,
            truncated: slice.length < ex.text.length,
            error: null
          });
          if (isMapReduce) {
            usableForMapReduce.push({
              position: u.position,
              finalUrl: ex.finalUrl,
              title: ex.title,
              description: ex.description,
              text: slice
            });
          } else {
            usableSections.push(
              `## Quelle ${u.position}: ${ex.finalUrl}${ex.title ? `\n### ${ex.title}` : ""}\n\n${slice}`
            );
          }
        }

        const usableCount = isMapReduce
          ? usableForMapReduce.length
          : usableSections.length;

        send("crawl-done", {
          sources,
          durationMs: fetchDurationMs,
          usableCount
        });

        if (usableCount === 0) {
          send("error", {
            _routeVersion: ROUTE_VERSION,
            error:
              "Could not extract usable content (>=50 chars) from any of the top SERP results. Pages may require JavaScript or block bots.",
            keyword,
            serpStatus: serp.status,
            serpDurationMs,
            fetchDurationMs,
            sources
          });
          return finish();
        }

        const concatenated = isMapReduce ? "" : usableSections.join("\n\n---\n\n");
        const analyzedChars = isMapReduce
          ? usableForMapReduce.reduce((sum, s) => sum + s.text.length, 0)
          : concatenated.length;

        send("pipeline-start", {
          mode: pipeline,
          keyword,
          analyzedChars,
          usableCount
        });

        const onProgress = (event: PipelineProgressEvent) => {
          send(event.type, event);
        };

        // ---------- 3a. Map-Reduce dispatch ----------
        if (pipeline === "mapreduce") {
          const result = await runKeywordMapReducePipeline({
            keyword,
            sources: usableForMapReduce,
            routeVersion: ROUTE_VERSION,
            routeLogPrefix: "nlp/keyword",
            enableThinking: true,
            onProgress
          });
          if (!result.ok) {
            send("error", {
              ...result.body,
              keyword,
              serpStatus: serp.status,
              serpDurationMs,
              fetchDurationMs,
              sources,
              pipeline: {
                mode: pipeline,
                steps: result.stepsCompleted,
                totalDurationMs: result.totalDurationMs,
                failedStep: result.failedStep
              }
            });
            return finish();
          }
          const lastStep = result.steps[result.steps.length - 1];
          const firstStep = result.steps[0];
          send("result", {
            _routeVersion: ROUTE_VERSION,
            mode: "keyword",
            keyword,
            serpStatus: serp.status,
            serpDurationMs,
            fetchDurationMs,
            sources,
            analyzedChars,
            extraction: result.extraction,
            model: lastStep?.model ?? null,
            durationMs: result.totalDurationMs,
            firstChunkMs: firstStep?.firstChunkMs ?? null,
            usage: lastStep?.usage ?? null,
            finishReason: lastStep?.finishReason ?? null,
            pipeline: {
              mode: result.mode,
              steps: result.steps,
              totalDurationMs: result.totalDurationMs
            }
          });
          return finish();
        }

        // ---------- 3b. Single / 2step / 3step / 4step (concatenated corpus) ----------
        const userMessageBuilder = (text: string) =>
          `# Der zu analysierende Text\n\nUnten findest du die zusammengesetzten Body-Inhalte der Top-${usableCount} Google-SERP-Ergebnisse für das Keyword "${keyword}". Analysiere sie GEMEINSAM, als wären sie ein zusammenhängendes Korpus zum Thema. Extrahiere genau eine konsolidierte semantische Karte des Themas, keine pro-Quelle-Auswertung.\n\n${text}`;

        if (pipeline === "single") {
          onProgress({ type: "step-start", step: "single-shot" });
          const result = await runDeepSeekExtraction({
            text: concatenated,
            routeVersion: ROUTE_VERSION,
            routeLogPrefix: "nlp/keyword",
            userMessageBuilder
          });
          if (!result.ok) {
            const errMsg = String(
              (result.body as Record<string, unknown>)?.error ?? "single-shot failed"
            );
            onProgress({ type: "step-failed", step: "single-shot", error: errMsg });
            send("error", {
              ...result.body,
              keyword,
              serpStatus: serp.status,
              serpDurationMs,
              fetchDurationMs,
              sources
            });
            return finish();
          }
          const step: PipelineStepMetric = {
            step: "single-shot",
            model: result.model,
            durationMs: result.durationMs,
            firstChunkMs: result.firstChunkMs,
            finishReason: result.finishReason,
            usage: result.usage
          };
          onProgress({ type: "step-done", metric: step });
          send("result", {
            _routeVersion: ROUTE_VERSION,
            mode: "keyword",
            keyword,
            serpStatus: serp.status,
            serpDurationMs,
            fetchDurationMs,
            sources,
            analyzedChars,
            extraction: result.extraction,
            model: result.model,
            durationMs: result.durationMs,
            firstChunkMs: result.firstChunkMs,
            usage: result.usage,
            finishReason: result.finishReason,
            pipeline: {
              mode: "single" as PipelineMode,
              steps: [step],
              totalDurationMs: result.durationMs
            }
          });
          return finish();
        }

        // 2step / 3step / 4step
        const pipelineResult = await runPipeline(pipeline, {
          text: concatenated,
          routeVersion: ROUTE_VERSION,
          routeLogPrefix: "nlp/keyword",
          userMessageBuilder,
          enableThinking: true,
          onProgress
        });

        if (!pipelineResult.ok) {
          send("error", {
            ...pipelineResult.body,
            keyword,
            serpStatus: serp.status,
            serpDurationMs,
            fetchDurationMs,
            sources,
            pipeline: {
              mode: pipeline,
              steps: pipelineResult.stepsCompleted,
              totalDurationMs: pipelineResult.totalDurationMs,
              failedStep: pipelineResult.failedStep
            }
          });
          return finish();
        }

        const lastStep = pipelineResult.steps[pipelineResult.steps.length - 1];
        const firstStep = pipelineResult.steps[0];
        send("result", {
          _routeVersion: ROUTE_VERSION,
          mode: "keyword",
          keyword,
          serpStatus: serp.status,
          serpDurationMs,
          fetchDurationMs,
          sources,
          analyzedChars,
          extraction: pipelineResult.extraction,
          model: lastStep?.model ?? null,
          durationMs: pipelineResult.totalDurationMs,
          firstChunkMs: firstStep?.firstChunkMs ?? null,
          usage: lastStep?.usage ?? null,
          finishReason: lastStep?.finishReason ?? null,
          pipeline: {
            mode: pipelineResult.mode,
            steps: pipelineResult.steps,
            totalDurationMs: pipelineResult.totalDurationMs
          }
        });
        return finish();
      } catch (err: unknown) {
        send("error", {
          _routeVersion: ROUTE_VERSION,
          error: (err as Error)?.message ?? "Unhandled stream error",
          keyword
        });
        return finish();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
