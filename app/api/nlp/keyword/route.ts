import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { fetchAndExtract } from "@/lib/nlp/extract";
import { runDeepSeekExtraction, MAX_TEXT_CHARS } from "@/lib/nlp/deepseek";
import {
  runPipeline,
  type PipelineStepMetric,
  type PipelineMode
} from "@/lib/nlp/pipeline";
import { fetchSerpTopUrls } from "@/lib/nlp/serp";

export const maxDuration = 300;

const ROUTE_VERSION = "2026-05-12.4-keyword-pipeline";

const TOP_N_URLS = 5;
const PER_URL_RESERVE_CHARS = 200;
const PER_URL_MAX_CHARS = Math.max(
  1200,
  Math.floor((MAX_TEXT_CHARS - PER_URL_RESERVE_CHARS * TOP_N_URLS) / TOP_N_URLS)
);

const bodySchema = z.object({
  keyword: z.string().min(2).max(200),
  pipeline: z.enum(["single", "2step", "3step", "4step"]).default("single")
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

  // 1. Fetch SERP top URLs via Zyte.
  const serpStarted = Date.now();
  const serp = await fetchSerpTopUrls(keyword, { topN: TOP_N_URLS });
  const serpDurationMs = Date.now() - serpStarted;

  if (serp.error && serp.urls.length === 0) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: `SERP fetch failed: ${serp.error}`,
        keyword,
        serpStatus: serp.status,
        serpDurationMs
      },
      { status: 502 }
    );
  }

  if (serp.urls.length === 0) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: "No SERP results returned for this keyword",
        keyword,
        serpStatus: serp.status,
        serpDurationMs
      },
      { status: 404 }
    );
  }

  const topUrls = serp.urls.slice(0, TOP_N_URLS);

  // 2. Fetch + extract each URL in parallel.
  const fetchStarted = Date.now();
  const extractResults = await Promise.allSettled(
    topUrls.map((u) => fetchAndExtract(u.url))
  );
  const fetchDurationMs = Date.now() - fetchStarted;

  const sources: ExtractedSource[] = [];
  const usableSections: string[] = [];

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
        error:
          (result.reason as Error)?.message ?? "extraction_failed"
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
    const slice = ex.text.slice(0, PER_URL_MAX_CHARS);
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
    usableSections.push(
      `## Quelle ${u.position}: ${ex.finalUrl}${ex.title ? `\n### ${ex.title}` : ""}\n\n${slice}`
    );
  }

  if (usableSections.length === 0) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error:
          "Could not extract usable content (>=50 chars) from any of the top SERP results. Pages may require JavaScript or block bots.",
        keyword,
        serpStatus: serp.status,
        serpDurationMs,
        fetchDurationMs,
        sources
      },
      { status: 422 }
    );
  }

  const concatenated = usableSections.join("\n\n---\n\n");
  const analyzedChars = concatenated.length;

  const userMessageBuilder = (text: string) =>
    `# Der zu analysierende Text\n\nUnten findest du die zusammengesetzten Body-Inhalte der Top-${usableSections.length} Google-SERP-Ergebnisse für das Keyword "${keyword}". Analysiere sie GEMEINSAM, als wären sie ein zusammenhängendes Korpus zum Thema. Extrahiere genau eine konsolidierte semantische Karte des Themas, keine pro-Quelle-Auswertung.\n\n${text}`;

  // 3. Run extraction (single-shot or multi-step pipeline).
  if (body.pipeline === "single") {
    const result = await runDeepSeekExtraction({
      text: concatenated,
      routeVersion: ROUTE_VERSION,
      routeLogPrefix: "nlp/keyword",
      userMessageBuilder
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ...result.body,
          keyword,
          serpStatus: serp.status,
          serpDurationMs,
          fetchDurationMs,
          sources
        },
        { status: result.status }
      );
    }

    const step: PipelineStepMetric = {
      step: "single-shot",
      model: result.model,
      durationMs: result.durationMs,
      firstChunkMs: result.firstChunkMs,
      finishReason: result.finishReason,
      usage: result.usage
    };

    return NextResponse.json({
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
  }

  const pipelineResult = await runPipeline(body.pipeline, {
    text: concatenated,
    routeVersion: ROUTE_VERSION,
    routeLogPrefix: "nlp/keyword",
    userMessageBuilder,
    enableThinking: true
  });

  if (!pipelineResult.ok) {
    return NextResponse.json(
      {
        ...pipelineResult.body,
        keyword,
        serpStatus: serp.status,
        serpDurationMs,
        fetchDurationMs,
        sources,
        pipeline: {
          mode: body.pipeline,
          steps: pipelineResult.stepsCompleted,
          totalDurationMs: pipelineResult.totalDurationMs,
          failedStep: pipelineResult.failedStep
        }
      },
      { status: pipelineResult.status }
    );
  }

  const lastStep = pipelineResult.steps[pipelineResult.steps.length - 1];
  const firstStep = pipelineResult.steps[0];

  return NextResponse.json({
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
}
