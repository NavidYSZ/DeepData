import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { searchAnalyticsQuery } from "@/lib/gsc";
import {
  ensureWorkspaceProject,
  ensureWorkspaceSource,
  getAccessTokenForUser,
  ingestSourceMetrics,
  recomputeDemandForProject,
  rebuildPreclusters
} from "@/lib/keyword-workspace/service";

const bodySchema = z.object({
  siteUrl: z.string().min(1),
  days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(180)]).default(30)
});

function err(code: string, message: string, details: Record<string, unknown> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

function toIso(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getRange(days: number) {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(to.getDate() - days + 1);
  return { from, to };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return err("INVALID_BODY", "Invalid body");
  }

  const project = await ensureWorkspaceProject(userId, body.siteUrl);
  const source = await ensureWorkspaceSource(project.id, "gsc", "GSC Auto", {
    siteUrl: body.siteUrl,
    days: body.days
  });

  let rows;
  try {
    const token = await getAccessTokenForUser(userId);
    const { from, to } = getRange(body.days);
    rows = await searchAnalyticsQuery(token, body.siteUrl, {
      startDate: toIso(from),
      endDate: toIso(to),
      dimensions: ["query"],
      rowLimit: 5000
    });
    await ingestSourceMetrics({
      projectId: project.id,
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
    await recomputeDemandForProject(project.id);
  } catch (e) {
    return err("GSC_SYNC_FAILED", "Failed to load GSC data", { reason: (e as Error).message }, 500);
  }

  const clusterCount = await prisma.cluster.count({ where: { projectId: project.id } });
  let autoReclustered = false;
  let preclusterStats = { algoVersion: "lex-charstem-v1", clusterCount: 0, keywordCount: 0 };
  if (clusterCount === 0) {
    preclusterStats = await rebuildPreclusters(project.id);
    autoReclustered = true;
  }

  return NextResponse.json({
    status: "DONE",
    projectId: project.id,
    rowCount: rows?.length ?? 0,
    autoReclustered,
    ...preclusterStats
  });
}
