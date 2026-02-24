import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { getLatestSerpStatus } from "@/lib/keyword-workspace/serp-cluster";

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const runId = new URL(req.url).searchParams.get("runId") ?? undefined;
  const run = await getLatestSerpStatus(ctx.params.id, runId ?? undefined);
  if (!run) return NextResponse.json({ status: "none" });
  const found = run.eligibleKeywordCount ?? 0;
  const resolved = run.resolvedKeywordCount ?? 0;
  const used = run.usedKeywordCount ?? 0;
  const missing = Math.max(found - resolved, 0);
  const complete = found > 0 && used >= found && missing === 0 && run.status === "completed";

  return NextResponse.json({
    id: run.id,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    minDemand: run.minDemand,
    urlOverlapThreshold: run.urlOverlapThreshold,
    topResults: run.topResults,
    clusterAlgorithm: run.clusterAlgorithm,
    snapshotReuseMode: run.snapshotReuseMode,
    missingSnapshotCount: run.missingSnapshotCount,
    fetchedMissingCount: run.fetchedMissingCount,
    zyteRequested: run.zyteRequested,
    zyteSucceeded: run.zyteSucceeded,
    zyteCached: run.zyteCached,
    eligibleKeywordCount: run.eligibleKeywordCount,
    resolvedKeywordCount: run.resolvedKeywordCount,
    usedKeywordCount: run.usedKeywordCount,
    waveCount: run.waveCount,
    keywordCoverage: {
      found,
      resolved,
      used,
      missing,
      complete
    },
    error: run.error
  });
}
