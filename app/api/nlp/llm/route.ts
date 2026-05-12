import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { fetchAndExtract } from "@/lib/nlp/extract";
import { runDeepSeekExtraction, MAX_TEXT_CHARS } from "@/lib/nlp/deepseek";

export const maxDuration = 300;

// Bump this whenever the route logic changes so the client can confirm
// the redeploy is live. Visible in the JSON response as `_routeVersion`.
const ROUTE_VERSION = "2026-05-12.3-deepseek-helper";

const bodySchema = z.object({
  url: z.string().url()
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

  const result = await runDeepSeekExtraction({
    text: truncated,
    routeVersion: ROUTE_VERSION,
    routeLogPrefix: "nlp/llm"
  });

  if (!result.ok) {
    return NextResponse.json(
      { ...result.body, extracted },
      { status: result.status }
    );
  }

  return NextResponse.json({
    _routeVersion: ROUTE_VERSION,
    extracted: {
      ...extracted,
      analyzedChars: truncated.length,
      truncated: truncated.length < extracted.text.length
    },
    extraction: result.extraction,
    model: result.model,
    durationMs: result.durationMs,
    firstChunkMs: result.firstChunkMs,
    usage: result.usage,
    finishReason: result.finishReason
  });
}
