import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { fetchAndExtract } from "@/lib/nlp/extract";
import { runLlmExtraction, MAX_TEXT_CHARS } from "@/lib/nlp/llm";
import {
  runPipeline,
  type PipelineStepMetric,
  type PipelineMode
} from "@/lib/nlp/pipeline";

export const maxDuration = 900;

// Bump this whenever the route logic changes so the client can confirm
// the redeploy is live. Visible in the JSON response as `_routeVersion`.
const ROUTE_VERSION = "2026-05-12.9-openai-gpt5.4";

const bodySchema = z.object({
  url: z.string().url(),
  pipeline: z.enum(["single", "2step", "3step", "4step"]).default("single")
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
  } catch (err: unknown) {
    return NextResponse.json(
      {
        _routeVersion: ROUTE_VERSION,
        error: (err as Error)?.message ?? "Failed to fetch URL"
      },
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
  const extractedShape = {
    ...extracted,
    analyzedChars: truncated.length,
    truncated: truncated.length < extracted.text.length
  };

  if (body.pipeline === "single") {
    const result = await runLlmExtraction({
      text: truncated,
      routeVersion: ROUTE_VERSION,
      routeLogPrefix: "nlp/llm"
    });

    if (!result.ok) {
      return NextResponse.json(
        { ...result.body, extracted: extractedShape },
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
      extracted: extractedShape,
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
    text: truncated,
    routeVersion: ROUTE_VERSION,
    routeLogPrefix: "nlp/llm",
    enableThinking: true
  });

  if (!pipelineResult.ok) {
    return NextResponse.json(
      {
        ...pipelineResult.body,
        extracted: extractedShape,
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
    extracted: extractedShape,
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
