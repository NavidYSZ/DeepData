import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { searchAnalyticsQuery } from "@/lib/gsc";
import { runSerpClustering } from "@/lib/keyword-workspace/serp-cluster";
import {
  ensureWorkspaceSource,
  getAccessTokenForUser,
  ingestSourceMetrics,
  recomputeDemandForProject
} from "@/lib/keyword-workspace/service";

const GSC_DAYS = 180; // 6 months

const bodySchema = z.object({
  forceRefetch: z.boolean().optional(),
  minDemand: z.coerce.number().optional(),
  overlapThreshold: z.coerce.number().optional()
});

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

function toIso(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("INVALID_BODY", "Invalid body");

  const projectId = ctx.params.id;
  const minDemand = parsed.data.minDemand ?? 5;

  // Check if there are keywords with sufficient demand already
  const kwCount = await prisma.keyword.count({
    where: { projectId, demand: { demandMonthly: { gte: minDemand } } }
  });

  // Auto-import GSC data if no keywords have demand
  if (kwCount === 0) {
    const project = await prisma.keywordProject.findFirst({
      where: { id: projectId, userId }
    });
    if (!project) return err("PROJECT_NOT_FOUND", "Project not found", {}, 404);
    if (!project.gscSiteUrl) return err("NO_GSC_SITE", "Project has no GSC site URL configured", {}, 400);

    try {
      const token = await getAccessTokenForUser(userId);
      const to = new Date();
      to.setHours(0, 0, 0, 0);
      const from = new Date(to);
      from.setDate(to.getDate() - GSC_DAYS + 1);

      const source = await ensureWorkspaceSource(projectId, "gsc", "GSC Auto", {
        siteUrl: project.gscSiteUrl,
        days: GSC_DAYS
      });

      const rows = await searchAnalyticsQuery(token, project.gscSiteUrl, {
        startDate: toIso(from),
        endDate: toIso(to),
        dimensions: ["query"],
        rowLimit: 5000
      });

      await ingestSourceMetrics({
        projectId,
        sourceId: source.id,
        replaceExistingForSource: true,
        rows: rows.map((row) => ({
          kwRaw: row.keys?.[0] ?? "",
          impressions: row.impressions,
          clicks: row.clicks,
          position: row.position,
          dateFrom: from,
          dateTo: to
        }))
      });

      await recomputeDemandForProject(projectId);
    } catch (e) {
      return err("GSC_SYNC_FAILED", `Auto GSC import failed: ${(e as Error).message}`, {}, 500);
    }
  }

  try {
    const result = await runSerpClustering({
      projectId,
      userId,
      ...parsed.data
    });
    return NextResponse.json({ status: "ok", runId: result.runId, counts: result.counts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    const status = msg === "PROJECT_NOT_FOUND" ? 404 : msg === "NO_KEYWORDS" ? 400 : 500;
    return err(msg, msg, {}, status);
  }
}
