import { searchAnalyticsQuery } from "@/lib/gsc";

import { normaliseUrl } from "./crawler";

export interface PageMetrics {
  position: number;
  impressions: number;
  clicks: number;
}

export interface FetchPageMetricsOptions {
  // ISO YYYY-MM-DD. Defaults to a 28-day window ending two days ago (GSC lag).
  startDate?: string;
  endDate?: string;
  // Cap on rows pulled from GSC. The API allows 25k per request and we page
  // until we hit this number.
  maxRows?: number;
}

function defaultDateRange() {
  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

// Pull page-level metrics from GSC for an entire property. Returns a map keyed
// by the *normalised* URL so a downstream join against the crawler output
// doesn't get derailed by trailing slashes or http/https mismatches.
export async function fetchPageMetrics(
  accessToken: string,
  siteUrl: string,
  options: FetchPageMetricsOptions = {}
): Promise<Map<string, PageMetrics>> {
  const { startDate, endDate } = options.startDate && options.endDate
    ? { startDate: options.startDate, endDate: options.endDate }
    : defaultDateRange();
  const maxRows = options.maxRows ?? 25_000;

  const result = new Map<string, PageMetrics>();
  const pageSize = 25_000;
  let startRow = 0;

  while (result.size < maxRows) {
    const rows = await searchAnalyticsQuery(accessToken, siteUrl, {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: pageSize,
      startRow
    });
    if (!rows.length) break;
    for (const row of rows) {
      const url = row.keys[0];
      if (!url) continue;
      const normalised = normaliseUrl(url);
      if (!normalised) continue;
      result.set(normalised, {
        position: row.position,
        impressions: row.impressions,
        clicks: row.clicks
      });
    }
    if (rows.length < pageSize) break;
    startRow += rows.length;
  }

  return result;
}
