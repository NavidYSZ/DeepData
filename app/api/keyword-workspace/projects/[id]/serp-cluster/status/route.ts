import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { getLatestSerpStatus } from "@/lib/keyword-workspace/serp-cluster";

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const run = await getLatestSerpStatus(ctx.params.id);
  if (!run) return NextResponse.json({ status: "none" });
  return NextResponse.json({
    id: run.id,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    minDemand: run.minDemand,
    urlOverlapThreshold: run.urlOverlapThreshold,
    zyteRequested: run.zyteRequested,
    zyteSucceeded: run.zyteSucceeded,
    zyteCached: run.zyteCached,
    error: run.error
  });
}
