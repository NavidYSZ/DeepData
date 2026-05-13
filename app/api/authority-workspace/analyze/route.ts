import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { fetchAndExtract } from "@/lib/nlp/extract";
import {
  runKeywordMapReducePipeline,
  type KeywordMapReduceSource
} from "@/lib/nlp/pipeline";
import { fetchSerpTopUrls } from "@/lib/nlp/serp";
import {
  mergeKeywordExtractionsToGraph,
  type AuthorityKeywordResult
} from "@/lib/authority-workspace/merge-graph";

export const maxDuration = 900;

const ROUTE_VERSION = "2026-05-13.1-authority-workspace";
const TOP_N_URLS = 5;
const PER_URL_MAX_CHARS = 20_000;
const MAX_KEYWORDS_PER_REQUEST = 15;

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        keyword: z.string().min(2).max(200),
        clusterId: z.string().min(1).max(120),
        clusterName: z.string().min(1).max(280)
      })
    )
    .min(1)
    .max(MAX_KEYWORDS_PER_REQUEST)
});

type AnalyzeItem = z.infer<typeof bodySchema>["items"][number];

type SerpStepResult =
  | { ok: true; sources: KeywordMapReduceSource[]; serpStatus: number }
  | { ok: false; error: string; serpStatus: number };

async function fetchAndExtractSources(keyword: string): Promise<SerpStepResult> {
  const serp = await fetchSerpTopUrls(keyword, { topN: TOP_N_URLS });
  if (serp.urls.length === 0) {
    return {
      ok: false,
      error: serp.error ?? "No SERP results returned",
      serpStatus: serp.status
    };
  }

  const topUrls = serp.urls.slice(0, TOP_N_URLS);
  const extractResults = await Promise.allSettled(
    topUrls.map((u) => fetchAndExtract(u.url))
  );

  const sources: KeywordMapReduceSource[] = [];
  for (let i = 0; i < topUrls.length; i++) {
    const u = topUrls[i];
    const r = extractResults[i];
    if (r.status !== "fulfilled") continue;
    if (r.value.text.length < 50) continue;
    sources.push({
      position: u.position,
      finalUrl: r.value.finalUrl,
      title: r.value.title,
      description: r.value.description,
      text: r.value.text.slice(0, PER_URL_MAX_CHARS)
    });
  }

  if (sources.length === 0) {
    return {
      ok: false,
      error: "No usable text could be extracted from SERP top results",
      serpStatus: serp.status
    };
  }
  return { ok: true, sources, serpStatus: serp.status };
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.ZYTE_API_KEY) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: "Missing ZYTE_API_KEY (required for SERP fetching)."
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

  const items: AnalyzeItem[] = body.items.map((it) => ({
    ...it,
    keyword: it.keyword.trim()
  }));

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
          /* closed */
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
        send("run-start", {
          totalKeywords: items.length,
          keywords: items.map((it) => ({
            keyword: it.keyword,
            clusterId: it.clusterId,
            clusterName: it.clusterName
          }))
        });

        const overallStart = Date.now();
        const results: AuthorityKeywordResult[] = [];
        const failures: Array<{
          clusterId: string;
          keyword: string;
          error: string;
        }> = [];

        // Run all keywords in parallel — Phase 1 is gated by Promise.all
        // inside the pipeline (5 SERP fetches × N keywords = up to 75
        // concurrent Zyte+OpenAI calls for N=15). DeepSeek/OpenAI handle
        // the concurrency; if rate limits bite, lower MAX_KEYWORDS_PER_REQUEST.
        await Promise.all(
          items.map(async (item) => {
            const itemStart = Date.now();
            send("kw-start", {
              clusterId: item.clusterId,
              keyword: item.keyword,
              clusterName: item.clusterName
            });

            const serpStep = await fetchAndExtractSources(item.keyword);
            if (!serpStep.ok) {
              failures.push({
                clusterId: item.clusterId,
                keyword: item.keyword,
                error: serpStep.error
              });
              send("kw-failed", {
                clusterId: item.clusterId,
                keyword: item.keyword,
                stage: "serp",
                error: serpStep.error,
                durationMs: Date.now() - itemStart
              });
              return;
            }

            send("kw-serp-done", {
              clusterId: item.clusterId,
              keyword: item.keyword,
              sourceCount: serpStep.sources.length,
              durationMs: Date.now() - itemStart
            });

            const pipelineResult = await runKeywordMapReducePipeline({
              keyword: item.keyword,
              sources: serpStep.sources,
              routeVersion: ROUTE_VERSION,
              routeLogPrefix: `authority/${item.clusterId.slice(0, 6)}`,
              enableThinking: true
            });

            if (!pipelineResult.ok) {
              const errMsg = String(
                (pipelineResult.body as Record<string, unknown>)?.error ??
                  "pipeline failed"
              );
              failures.push({
                clusterId: item.clusterId,
                keyword: item.keyword,
                error: errMsg
              });
              send("kw-failed", {
                clusterId: item.clusterId,
                keyword: item.keyword,
                stage: pipelineResult.failedStep,
                error: errMsg,
                durationMs: Date.now() - itemStart
              });
              return;
            }

            results.push({
              keyword: item.keyword,
              clusterId: item.clusterId,
              clusterName: item.clusterName,
              extraction: pipelineResult.extraction
            });

            send("kw-done", {
              clusterId: item.clusterId,
              keyword: item.keyword,
              durationMs: Date.now() - itemStart,
              entityCount: pipelineResult.extraction.entities?.length ?? 0,
              relationCount: pipelineResult.extraction.relations?.length ?? 0
            });
          })
        );

        if (results.length === 0) {
          send("error", {
            _routeVersion: ROUTE_VERSION,
            error: "All keyword analyses failed",
            failures
          });
          return finish();
        }

        const graph = mergeKeywordExtractionsToGraph(results);

        send("result", {
          _routeVersion: ROUTE_VERSION,
          totalDurationMs: Date.now() - overallStart,
          succeeded: results.length,
          failed: failures.length,
          failures,
          perKeyword: results.map((r) => ({
            keyword: r.keyword,
            clusterId: r.clusterId,
            clusterName: r.clusterName,
            entityCount: r.extraction.entities?.length ?? 0,
            relationCount: r.extraction.relations?.length ?? 0
          })),
          graph
        });
        return finish();
      } catch (err) {
        send("error", {
          _routeVersion: ROUTE_VERSION,
          error: (err as Error)?.message ?? "Unhandled error"
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
