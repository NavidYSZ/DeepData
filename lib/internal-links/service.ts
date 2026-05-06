import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { resolveUserSiteAccess } from "@/lib/gsc-access";

import { crawl, type CrawlOptions } from "./crawler";
import { fetchPageMetrics } from "./gsc-sync";
import { buildRecommendations, computeExecutiveKpis, scoreOpportunities } from "./scoring";
import type {
  AnchorClass,
  ExecutiveKpis,
  InboundLink,
  InternalLink,
  LinkPlacement,
  LinkRecommendation,
  OpportunityRow,
  PageType,
  UrlSnapshot
} from "./types";

export interface StartCrawlInput {
  userId: string;
  siteUrl: string;
  seedUrl: string;
  maxUrls?: number;
}

export interface CrawlRunSummary {
  id: string;
  siteUrl: string;
  seedUrl: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  urlsCrawled: number;
  linksFound: number;
  error: string | null;
}

// Orchestrates: crawl → GSC sync → persistence. Returns the final run row so
// the caller (API route) can pass the id back to the UI immediately.
export async function startCrawlRun(input: StartCrawlInput): Promise<CrawlRunSummary> {
  const maxUrls = input.maxUrls ?? 500;

  const run = await prisma.crawlRun.create({
    data: {
      userId: input.userId,
      siteUrl: input.siteUrl,
      seedUrl: input.seedUrl,
      maxUrls,
      status: "running"
    }
  });

  try {
    const pages = await crawl(input.seedUrl, { maxUrls } as Partial<CrawlOptions>);

    // Pull GSC metrics best-effort. A failure here should not invalidate the
    // crawl — the matrix still functions on impressions=null (those rows just
    // get filtered to "low_data" by the scoring layer).
    let metrics: Awaited<ReturnType<typeof fetchPageMetrics>> = new Map();
    try {
      const access = await resolveUserSiteAccess(input.userId, input.siteUrl);
      metrics = await fetchPageMetrics(access.accessToken, input.siteUrl);
    } catch {
      metrics = new Map();
    }

    // Persist snapshots first so we have ids to FK from InternalLink.
    const snapshotIdByUrl = new Map<string, string>();
    for (const page of pages) {
      const m = metrics.get(page.url);
      const snap = await prisma.urlSnapshot.create({
        data: {
          runId: run.id,
          url: page.url,
          title: page.title,
          h1: page.h1,
          canonical: page.canonical,
          statusCode: page.statusCode,
          indexable: page.indexable,
          pageType: page.pageType,
          cluster: page.cluster,
          position: m?.position ?? null,
          impressions: m?.impressions ?? null,
          clicks: m?.clicks ?? null
        },
        select: { id: true }
      });
      snapshotIdByUrl.set(page.url, snap.id);
    }

    // Now insert internal links. We only persist links whose target was also
    // crawled — external links and skipped-due-to-cap targets are dropped.
    const linkInserts: Prisma.InternalLinkCreateManyInput[] = [];
    for (const page of pages) {
      const sourceId = snapshotIdByUrl.get(page.url);
      if (!sourceId) continue;
      for (const link of page.outboundLinks) {
        const targetId = snapshotIdByUrl.get(link.targetUrl);
        if (!targetId) continue;
        linkInserts.push({
          runId: run.id,
          sourceId,
          targetId,
          anchorText: link.anchorText,
          anchorClass: link.anchorClass ?? "generic",
          placement: link.placement,
          isContextual: link.placement === "content",
          isNofollow: link.isNofollow
        });
      }
    }
    // Batch insert to keep transaction count manageable on large crawls.
    const BATCH = 200;
    for (let i = 0; i < linkInserts.length; i += BATCH) {
      const slice = linkInserts.slice(i, i + BATCH);
      await prisma.internalLink.createMany({ data: slice });
    }

    return await prisma.crawlRun
      .update({
        where: { id: run.id },
        data: {
          status: "completed",
          finishedAt: new Date(),
          urlsCrawled: pages.length,
          linksFound: linkInserts.length
        }
      })
      .then(toSummary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Crawl failed";
    await prisma.crawlRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), error: message }
    });
    throw error;
  }
}

export async function listRunsForUser(userId: string): Promise<CrawlRunSummary[]> {
  const runs = await prisma.crawlRun.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: 50
  });
  return runs.map(toSummary);
}

export interface OpportunityWithDetails extends OpportunityRow {
  recommendations: LinkRecommendation[];
  inboundLinks: InboundLink[];
}

export interface OpportunitiesPayload {
  run: CrawlRunSummary;
  kpis: ExecutiveKpis;
  opportunities: OpportunityWithDetails[];
}

// Loads a single run from the DB and runs scoring + recommendations against
// it. Returned shape mirrors what the UI already consumes from mock data.
export async function loadOpportunitiesForRun(
  userId: string,
  runId: string
): Promise<OpportunitiesPayload | null> {
  const run = await prisma.crawlRun.findFirst({
    where: { id: runId, userId },
    include: {
      snapshots: true,
      links: true
    }
  });
  if (!run) return null;

  const snapshots: UrlSnapshot[] = run.snapshots.map((s) => ({
    id: s.id,
    url: s.url,
    title: s.title ?? s.url,
    h1: s.h1,
    pageType: (s.pageType as PageType) ?? "other",
    cluster: s.cluster,
    indexable: s.indexable,
    position: s.position ?? 0,
    impressions: s.impressions ?? 0,
    clicks: s.clicks ?? 0
  }));

  const links: InternalLink[] = run.links.map((l) => ({
    id: l.id,
    sourceId: l.sourceId,
    targetId: l.targetId,
    anchorText: l.anchorText,
    anchorClass: l.anchorClass as AnchorClass,
    placement: l.placement as LinkPlacement,
    isContextual: l.isContextual,
    isNofollow: l.isNofollow
  }));

  const rows = scoreOpportunities(snapshots, links);
  const snapshotById = new Map(snapshots.map((s) => [s.id, s]));
  const opportunities: OpportunityWithDetails[] = rows.map((row) => {
    const inboundLinks: InboundLink[] = links
      .filter((l) => l.targetId === row.snapshot.id)
      .map((l) => ({
        sourceId: l.sourceId,
        sourceUrl: snapshotById.get(l.sourceId)?.url ?? "",
        anchorText: l.anchorText,
        anchorClass: l.anchorClass,
        placement: l.placement,
        isContextual: l.isContextual,
        isNofollow: l.isNofollow
      }));
    return {
      ...row,
      recommendations: buildRecommendations(row, snapshots, links),
      inboundLinks
    };
  });

  return { run: toSummary(run), kpis: computeExecutiveKpis(rows), opportunities };
}

function toSummary(run: {
  id: string;
  siteUrl: string;
  seedUrl: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  urlsCrawled: number;
  linksFound: number;
  error: string | null;
}): CrawlRunSummary {
  return {
    id: run.id,
    siteUrl: run.siteUrl,
    seedUrl: run.seedUrl,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    urlsCrawled: run.urlsCrawled,
    linksFound: run.linksFound,
    error: run.error
  };
}
