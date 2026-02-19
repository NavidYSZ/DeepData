import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/google-oauth";
import { normalizeKeyword } from "@/lib/keyword-workspace/normalize";
import { runPrecluster } from "@/lib/keyword-workspace/precluster";

type MetricInput = {
  kwRaw: string;
  impressions?: number | null;
  clicks?: number | null;
  position?: number | null;
  volume?: number | null;
  url?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

const MONTH_DAYS = 30.4375;

function toDay(value?: Date | null) {
  if (!value) return null;
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daySpan(dateFrom?: Date | null, dateTo?: Date | null) {
  const from = toDay(dateFrom);
  const to = toDay(dateTo);
  if (!from || !to) return 30;
  const diff = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
  return Math.max(diff, 1);
}

function impressionsToMonthly(impressions: number, dateFrom?: Date | null, dateTo?: Date | null) {
  const days = daySpan(dateFrom, dateTo);
  const months = days / MONTH_DAYS;
  return impressions / Math.max(months, 1 / MONTH_DAYS);
}

export async function getAccessTokenForUser(userId: string) {
  const cookieStore = cookies();
  const accountId = cookieStore.get("accountId")?.value;
  const account = accountId
    ? await prisma.gscAccount.findFirst({ where: { id: accountId, userId } })
    : await prisma.gscAccount.findFirst({ where: { userId }, orderBy: { created_at: "asc" } });
  if (!account?.refresh_token) {
    throw new Error("Not connected");
  }
  const tokens = await refreshAccessToken(decrypt(account.refresh_token));
  return tokens.access_token;
}

export async function ensureWorkspaceProject(userId: string, siteUrl: string) {
  const existing = await prisma.keywordProject.findFirst({
    where: { userId, gscSiteUrl: siteUrl },
    orderBy: { createdAt: "asc" }
  });
  if (existing) return existing;
  return prisma.keywordProject.create({
    data: {
      userId,
      name: siteUrl,
      gscSiteUrl: siteUrl,
      lang: "de",
      country: "DE",
      gscDefaultDays: 30
    }
  });
}

export async function ensureWorkspaceSource(
  projectId: string,
  type: "gsc" | "upload",
  name: string,
  meta?: Record<string, unknown>
) {
  const source = await prisma.keywordSource.findFirst({
    where: { projectId, type, name },
    orderBy: { createdAt: "asc" }
  });
  if (source) {
    if (meta) {
      await prisma.keywordSource.update({
        where: { id: source.id },
        data: { metaJson: JSON.stringify(meta) }
      });
      return { ...source, metaJson: JSON.stringify(meta) };
    }
    return source;
  }
  return prisma.keywordSource.create({
    data: {
      projectId,
      type,
      name,
      metaJson: meta ? JSON.stringify(meta) : null
    }
  });
}

export async function ingestSourceMetrics(params: {
  projectId: string;
  sourceId: string;
  rows: MetricInput[];
  replaceExistingForSource?: boolean;
}) {
  const { projectId, sourceId, rows, replaceExistingForSource = false } = params;
  const normalizedRows = rows
    .map((row) => {
      const normalized = normalizeKeyword(row.kwRaw);
      if (!normalized) return null;
      return {
        kwRaw: row.kwRaw.trim(),
        kwNorm: normalized.kwNorm,
        kwSig: normalized.kwSig,
        impressions: row.impressions ?? null,
        clicks: row.clicks ?? null,
        position: row.position ?? null,
        sistrixVolume: row.volume ?? null,
        url: row.url ?? null,
        dateFrom: row.dateFrom ?? null,
        dateTo: row.dateTo ?? null
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const rowByNorm = new Map<string, (typeof normalizedRows)[number]>();
  for (const row of normalizedRows) {
    const existing = rowByNorm.get(row.kwNorm);
    if (!existing) {
      rowByNorm.set(row.kwNorm, row);
      continue;
    }
    rowByNorm.set(row.kwNorm, {
      ...existing,
      impressions: (existing.impressions ?? 0) + (row.impressions ?? 0),
      clicks: (existing.clicks ?? 0) + (row.clicks ?? 0),
      position: row.position ?? existing.position,
      sistrixVolume: Math.max(existing.sistrixVolume ?? 0, row.sistrixVolume ?? 0),
      url: row.url ?? existing.url
    });
  }

  const deduped = Array.from(rowByNorm.values());
  const norms = deduped.map((row) => row.kwNorm);
  const existingKeywords = norms.length
    ? await prisma.keyword.findMany({
        where: { projectId, kwNorm: { in: norms } },
        select: { id: true, kwNorm: true }
      })
    : [];

  const existingByNorm = new Map(existingKeywords.map((kw) => [kw.kwNorm, kw.id]));
  const missing = deduped.filter((row) => !existingByNorm.has(row.kwNorm));

  if (missing.length) {
    await prisma.keyword.createMany({
      data: missing.map((row) => ({
        projectId,
        kwRaw: row.kwRaw,
        kwNorm: row.kwNorm,
        kwSig: row.kwSig
      }))
    });
  }

  const keywords = norms.length
    ? await prisma.keyword.findMany({
        where: { projectId, kwNorm: { in: norms } },
        select: { id: true, kwNorm: true }
      })
    : [];
  const keywordIdByNorm = new Map(keywords.map((kw) => [kw.kwNorm, kw.id]));

  if (replaceExistingForSource) {
    await prisma.keywordSourceMetric.deleteMany({ where: { sourceId } });
  }

  for (const row of deduped) {
    const keywordId = keywordIdByNorm.get(row.kwNorm);
    if (!keywordId) continue;
    await prisma.keywordSourceMetric.upsert({
      where: { keywordId_sourceId: { keywordId, sourceId } },
      create: {
        keywordId,
        sourceId,
        impressions: row.impressions,
        clicks: row.clicks,
        position: row.position,
        sistrixVolume: row.sistrixVolume,
        url: row.url,
        dateFrom: row.dateFrom,
        dateTo: row.dateTo
      },
      update: {
        impressions: row.impressions,
        clicks: row.clicks,
        position: row.position,
        sistrixVolume: row.sistrixVolume,
        url: row.url,
        dateFrom: row.dateFrom,
        dateTo: row.dateTo
      }
    });
  }
}

export async function recomputeDemandForProject(projectId: string) {
  const keywords = await prisma.keyword.findMany({
    where: { projectId },
    include: {
      sourceMetrics: {
        include: {
          source: {
            select: { type: true }
          }
        }
      }
    }
  });

  for (const keyword of keywords) {
    let gscMonthly: number | null = null;
    let uploadMonthly: number | null = null;

    for (const metric of keyword.sourceMetrics) {
      if (metric.source.type === "gsc" && metric.impressions !== null) {
        const monthly = impressionsToMonthly(metric.impressions, metric.dateFrom, metric.dateTo);
        gscMonthly = gscMonthly === null ? monthly : Math.max(gscMonthly, monthly);
      }
      if (metric.source.type === "upload" && metric.sistrixVolume !== null) {
        uploadMonthly = uploadMonthly === null ? metric.sistrixVolume : Math.max(uploadMonthly, metric.sistrixVolume);
      }
    }

    const demandMonthly = gscMonthly ?? uploadMonthly ?? 0;
    const demandSource = gscMonthly !== null ? "gsc" : uploadMonthly !== null ? "upload" : "none";

    await prisma.keywordDemand.upsert({
      where: { keywordId: keyword.id },
      create: {
        keywordId: keyword.id,
        projectId,
        demandMonthly,
        demandSource
      },
      update: {
        demandMonthly,
        demandSource
      }
    });
  }
}

export async function rebuildPreclusters(projectId: string) {
  const keywords = await prisma.keyword.findMany({
    where: { projectId },
    include: { demand: true }
  });
  if (!keywords.length) {
    return { algoVersion: "lex-charstem-v1", clusterCount: 0, keywordCount: 0 };
  }

  const pre = runPrecluster(
    keywords.map((keyword) => ({
      id: keyword.id,
      kwRaw: keyword.kwRaw,
      demandMonthly: keyword.demand?.demandMonthly ?? 0
    }))
  );

  await prisma.$transaction([
    prisma.preclusterMember.deleteMany({ where: { precluster: { projectId } } }),
    prisma.precluster.deleteMany({ where: { projectId } }),
    prisma.clusterMember.deleteMany({ where: { cluster: { projectId } } }),
    prisma.cluster.deleteMany({ where: { projectId } })
  ]);

  for (const cluster of pre.clusters) {
    const clusterId = `${projectId}-${cluster.id}`;
    await prisma.precluster.create({
      data: {
        id: clusterId,
        projectId,
        algoVersion: pre.algoVersion,
        label: cluster.label,
        totalDemand: cluster.totalDemand,
        cohesion: cluster.cohesion,
        members: {
          createMany: {
            data: cluster.keywordIds.map((keywordId) => ({
              keywordId,
              score: 1
            }))
          }
        }
      }
    });
    await prisma.cluster.create({
      data: {
        id: clusterId,
        projectId,
        name: cluster.label,
        members: {
          createMany: {
            data: cluster.keywordIds.map((keywordId) => ({ keywordId }))
          }
        }
      }
    });
  }

  return {
    algoVersion: pre.algoVersion,
    clusterCount: pre.clusters.length,
    keywordCount: keywords.length
  };
}
