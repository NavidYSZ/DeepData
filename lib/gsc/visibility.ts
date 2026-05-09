import { prisma } from "@/lib/db";
import type { CtrCurve } from "./ctr-curve";
import { getCtrCurve } from "./ctr-curve";

// Visibility = expected clicks given the position distribution. We compute
// this honestly: for each (query, page, day) row we already have impressions
// and a position from GSC, and we reweight by what *should* happen at that
// position rather than what did. The result is a "noise-free" daily series
// where a 1-impression-at-position-1 row contributes ~0.27 expected clicks
// instead of dominating an absolute-position dashboard.

export interface VisibilityRow {
  date: string;
  visibility: number;
  impressions: number;
  clicks: number;
}

export interface VisibilityContribution {
  query: string;
  page: string;
  visibility: number;
  impressions: number;
  clicks: number;
  // Average position weighted by impressions across the period.
  position: number;
}

function visibilityForRow(
  position: number,
  impressions: number,
  curve: CtrCurve
): number {
  if (!impressions || !position) return 0;
  return impressions * curve.ctrAt(position);
}

// Daily visibility series for a (user, site) over a date range. One row
// per day with the absolute "expected clicks" figure.
export async function visibilitySeries(
  userId: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  curveOverride?: CtrCurve
): Promise<VisibilityRow[]> {
  const curve = curveOverride ?? (await getCtrCurve(userId, siteUrl));
  const rows = await prisma.gscDailyMetric.findMany({
    where: {
      userId,
      siteUrl,
      date: { gte: startDate, lte: endDate }
    },
    select: {
      date: true,
      impressions: true,
      clicks: true,
      position: true
    }
  });

  const byDate = new Map<string, { v: number; imp: number; clk: number }>();
  for (const r of rows) {
    const entry = byDate.get(r.date) ?? { v: 0, imp: 0, clk: 0 };
    entry.v += visibilityForRow(r.position, r.impressions, curve);
    entry.imp += r.impressions;
    entry.clk += r.clicks;
    byDate.set(r.date, entry);
  }

  return [...byDate.entries()]
    .map(([date, v]) => ({
      date,
      visibility: v.v,
      impressions: v.imp,
      clicks: v.clk
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Per-(query, page) visibility contribution over a range. Used by Top
// Mover to rank movers by Δ-visibility instead of Δ-position, and by the
// "by Query" view to surface which keywords drive site visibility.
export async function visibilityByQueryPage(
  userId: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  curveOverride?: CtrCurve
): Promise<VisibilityContribution[]> {
  const curve = curveOverride ?? (await getCtrCurve(userId, siteUrl));
  const rows = await prisma.gscDailyMetric.findMany({
    where: {
      userId,
      siteUrl,
      date: { gte: startDate, lte: endDate }
    },
    select: {
      query: true,
      page: true,
      impressions: true,
      clicks: true,
      position: true
    }
  });

  const buckets = new Map<
    string,
    {
      query: string;
      page: string;
      v: number;
      imp: number;
      clk: number;
      posWeighted: number;
    }
  >();
  for (const r of rows) {
    const key = `${r.query}\0${r.page}`;
    const entry =
      buckets.get(key) ?? {
        query: r.query,
        page: r.page,
        v: 0,
        imp: 0,
        clk: 0,
        posWeighted: 0
      };
    entry.v += visibilityForRow(r.position, r.impressions, curve);
    entry.imp += r.impressions;
    entry.clk += r.clicks;
    entry.posWeighted += r.position * r.impressions;
    buckets.set(key, entry);
  }

  return [...buckets.values()].map((b) => ({
    query: b.query,
    page: b.page,
    visibility: b.v,
    impressions: b.imp,
    clicks: b.clk,
    position: b.imp > 0 ? b.posWeighted / b.imp : 0
  }));
}

// Compare two periods by visibility delta. Used by Top Mover.
export interface VisibilityMover {
  query: string;
  page: string;
  visibility1: number;
  visibility2: number;
  delta: number;
  position1: number;
  position2: number;
  impressions1: number;
  impressions2: number;
}

export async function visibilityMovers(
  userId: string,
  siteUrl: string,
  p1Start: string,
  p1End: string,
  p2Start: string,
  p2End: string,
  options: { minImpressions?: number } = {}
): Promise<VisibilityMover[]> {
  const curve = await getCtrCurve(userId, siteUrl);
  const [a, b] = await Promise.all([
    visibilityByQueryPage(userId, siteUrl, p1Start, p1End, curve),
    visibilityByQueryPage(userId, siteUrl, p2Start, p2End, curve)
  ]);

  const min = options.minImpressions ?? 0;
  const map1 = new Map(a.map((r) => [`${r.query}\0${r.page}`, r]));
  const out: VisibilityMover[] = [];
  for (const r2 of b) {
    const key = `${r2.query}\0${r2.page}`;
    const r1 = map1.get(key);
    if (!r1) continue;
    if (r1.impressions < min || r2.impressions < min) continue;
    out.push({
      query: r2.query,
      page: r2.page,
      visibility1: r1.visibility,
      visibility2: r2.visibility,
      delta: r2.visibility - r1.visibility,
      position1: r1.position,
      position2: r2.position,
      impressions1: r1.impressions,
      impressions2: r2.impressions
    });
  }
  return out;
}
