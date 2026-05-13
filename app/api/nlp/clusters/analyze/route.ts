import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchAndExtract } from "@/lib/nlp/extract";
import { fetchSerpTopUrls } from "@/lib/nlp/serp";
import {
  runClustersAnalysisPipeline,
  type ClusterAnalysisInput
} from "@/lib/nlp/cluster-pipeline";
import type { KeywordMapReduceSource } from "@/lib/nlp/pipeline";

export const maxDuration = 900;

const ROUTE_VERSION = "2026-05-13.1-clusters-analyze";

const TOP_N_URLS = 7;
const PER_URL_MAX_CHARS = 20_000;

const bodySchema = z.object({
  subclusterIds: z.array(z.string().min(1)).min(1).max(20)
});

type SourceMeta = {
  clusterId: string;
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
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.ZYTE_API_KEY) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error:
          "Missing ZYTE_API_KEY. Required for SERP fetching. Set ZYTE_API_KEY in your env."
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

  // Load + authorize subclusters. Each cluster's top-demand keyword is the
  // member with the highest demand.demandMonthly.
  const subclusters = await prisma.serpSubcluster.findMany({
    where: { id: { in: body.subclusterIds }, project: { userId } },
    include: {
      members: {
        include: {
          keyword: { include: { demand: true } }
        }
      }
    }
  });

  if (subclusters.length === 0) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: "No accessible subclusters for the given IDs"
      },
      { status: 404 }
    );
  }

  type ClusterPlan = {
    subclusterId: string;
    name: string;
    topKeyword: string;
  };
  const plans: ClusterPlan[] = [];
  const skipped: Array<{ subclusterId: string; name: string; reason: string }> = [];
  for (const s of subclusters) {
    const sorted = [...s.members].sort(
      (a, b) => (b.keyword.demand?.demandMonthly ?? 0) - (a.keyword.demand?.demandMonthly ?? 0)
    );
    const top = sorted[0];
    if (!top) {
      skipped.push({
        subclusterId: s.id,
        name: s.name,
        reason: "Cluster has no member keywords"
      });
      continue;
    }
    plans.push({
      subclusterId: s.id,
      name: s.name,
      topKeyword: top.keyword.kwRaw
    });
  }

  if (plans.length === 0) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: "No clusters with usable top-demand keyword",
        skipped
      },
      { status: 422 }
    );
  }

  // ---------- Open the SSE stream ----------
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
        send("init", {
          plans,
          skipped,
          topNUrls: TOP_N_URLS
        });

        // ---------- Phase A: SERP + crawl per cluster, parallel across clusters ----------
        type ClusterPrep = {
          plan: ClusterPlan;
          sources: KeywordMapReduceSource[];
          sourceMeta: SourceMeta[];
          serpStatus: number;
          serpDurationMs: number;
          fetchDurationMs: number;
        };

        async function prepCluster(plan: ClusterPlan): Promise<ClusterPrep | null> {
          send("cluster-serp-start", {
            clusterId: plan.subclusterId,
            name: plan.name,
            keyword: plan.topKeyword
          });
          const serpStarted = Date.now();
          const serp = await fetchSerpTopUrls(plan.topKeyword, { topN: TOP_N_URLS });
          const serpDurationMs = Date.now() - serpStarted;
          send("cluster-serp-done", {
            clusterId: plan.subclusterId,
            status: serp.status,
            urlCount: serp.urls.length,
            durationMs: serpDurationMs,
            error: serp.error ?? null
          });
          if (serp.urls.length === 0) {
            send("cluster-skipped", {
              clusterId: plan.subclusterId,
              reason: serp.error ?? "No SERP results"
            });
            return null;
          }
          const topUrls = serp.urls.slice(0, TOP_N_URLS);
          send("cluster-crawl-start", {
            clusterId: plan.subclusterId,
            urls: topUrls.map((u) => ({ position: u.position, url: u.url }))
          });
          const fetchStarted = Date.now();
          const extractResults = await Promise.allSettled(
            topUrls.map((u) => fetchAndExtract(u.url))
          );
          const fetchDurationMs = Date.now() - fetchStarted;

          const sourceMeta: SourceMeta[] = [];
          const sources: KeywordMapReduceSource[] = [];
          for (let i = 0; i < topUrls.length; i++) {
            const u = topUrls[i];
            const result = extractResults[i];
            if (result.status === "rejected") {
              sourceMeta.push({
                clusterId: plan.subclusterId,
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
              sourceMeta.push({
                clusterId: plan.subclusterId,
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
            const slice = ex.text.slice(0, PER_URL_MAX_CHARS);
            sourceMeta.push({
              clusterId: plan.subclusterId,
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
            sources.push({
              position: u.position,
              finalUrl: ex.finalUrl,
              title: ex.title,
              description: ex.description,
              text: slice
            });
          }

          send("cluster-crawl-done", {
            clusterId: plan.subclusterId,
            sources: sourceMeta,
            durationMs: fetchDurationMs,
            usableCount: sources.length
          });

          if (sources.length === 0) {
            send("cluster-skipped", {
              clusterId: plan.subclusterId,
              reason: "No usable sources after crawl"
            });
            return null;
          }

          return {
            plan,
            sources,
            sourceMeta,
            serpStatus: serp.status,
            serpDurationMs,
            fetchDurationMs
          };
        }

        const prepResults = await Promise.all(plans.map(prepCluster));
        const preps = prepResults.filter((p): p is ClusterPrep => p !== null);

        if (preps.length === 0) {
          send("error", {
            _routeVersion: ROUTE_VERSION,
            error: "No clusters produced usable SERP + crawl data",
            plans,
            skipped
          });
          return finish();
        }

        // ---------- Phase B: cluster pipeline (per-cluster extract → merge → synthesis) ----------
        const pipelineClusters: ClusterAnalysisInput[] = preps.map((p) => ({
          subclusterId: p.plan.subclusterId,
          name: p.plan.name,
          topKeyword: p.plan.topKeyword,
          sources: p.sources
        }));

        send("pipeline-start", {
          clusterCount: pipelineClusters.length,
          sourceCount: preps.reduce((s, p) => s + p.sources.length, 0)
        });

        const result = await runClustersAnalysisPipeline({
          clusters: pipelineClusters,
          routeVersion: ROUTE_VERSION,
          routeLogPrefix: "nlp/clusters",
          onProgress: (event) => send(event.type, event)
        });

        if (!result.ok) {
          send("error", {
            ...result.body,
            failedStep: result.failedStep,
            stepsCompleted: result.stepsCompleted,
            totalDurationMs: result.totalDurationMs
          });
          return finish();
        }

        const allSourceMeta = preps.flatMap((p) => p.sourceMeta);
        const lastStep = result.steps[result.steps.length - 1];
        const firstStep = result.steps[0];
        send("result", {
          _routeVersion: ROUTE_VERSION,
          extraction: result.extraction,
          clusters: result.clusters,
          sources: allSourceMeta,
          model: lastStep?.model ?? null,
          durationMs: result.totalDurationMs,
          firstChunkMs: firstStep?.firstChunkMs ?? null,
          usage: lastStep?.usage ?? null,
          finishReason: lastStep?.finishReason ?? null,
          pipeline: {
            mode: "clusters" as const,
            steps: result.steps,
            totalDurationMs: result.totalDurationMs
          }
        });
        return finish();
      } catch (err: unknown) {
        send("error", {
          _routeVersion: ROUTE_VERSION,
          error: (err as Error)?.message ?? "Unhandled stream error"
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
