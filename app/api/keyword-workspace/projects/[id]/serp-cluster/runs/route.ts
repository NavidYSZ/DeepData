import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listSerpClusterRuns } from "@/lib/keyword-workspace/serp-cluster";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(200).optional()
});

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const project = await prisma.keywordProject.findFirst({ where: { id: ctx.params.id, userId } });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", {}, 404);

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) return err("INVALID_QUERY", "Invalid query params");

  const runs = await listSerpClusterRuns(project.id, parsed.data.limit ?? 50);
  return NextResponse.json(
    runs.map((run) => ({
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
      error: run.error
    }))
  );
}
