import { searchAnalyticsQuery } from "@/lib/gsc";

import { normaliseUrl } from "./crawler";
import type { TopQuery } from "./types";

export interface PageMetrics {
  position: number;
  impressions: number;
  clicks: number;
}

const TOP_QUERIES_PER_URL = 10;

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

// Pull page+query metrics across the whole property in a single paginated
// pass, then group into the top-N queries per URL. One call replaces N
// per-URL calls — important because the GSC API is quota-limited and
// per-call latency dominates the total sync time.
export async function fetchTopQueriesPerUrl(
  accessToken: string,
  siteUrl: string,
  options: FetchPageMetricsOptions = {}
): Promise<Map<string, TopQuery[]>> {
  const { startDate, endDate } = options.startDate && options.endDate
    ? { startDate: options.startDate, endDate: options.endDate }
    : defaultDateRange();
  // Cap pulled rows hard. 25k page+query rows comfortably covers a site of
  // ~2.5k URLs with 10 queries each; bigger properties just get the highest-
  // impression slice, which is exactly what we want for anchor candidates.
  const maxRows = options.maxRows ?? 25_000;

  const buckets = new Map<string, TopQuery[]>();
  const pageSize = 25_000;
  let startRow = 0;
  let pulled = 0;

  while (pulled < maxRows) {
    const rows = await searchAnalyticsQuery(accessToken, siteUrl, {
      startDate,
      endDate,
      dimensions: ["page", "query"],
      rowLimit: Math.min(pageSize, maxRows - pulled),
      startRow
    });
    if (!rows.length) break;
    for (const row of rows) {
      const [pageRaw, queryRaw] = row.keys;
      if (!pageRaw || !queryRaw) continue;
      const url = normaliseUrl(pageRaw);
      if (!url) continue;
      const arr = buckets.get(url) ?? [];
      arr.push({
        query: queryRaw,
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position
      });
      buckets.set(url, arr);
    }
    pulled += rows.length;
    if (rows.length < pageSize) break;
    startRow += rows.length;
  }

  // Sort each bucket by impressions desc and keep the top N. We sort by
  // impressions rather than clicks because impressions captures relevance
  // even on URLs that haven't accumulated clicks yet — the latter is the
  // common case for under-linked pages, which is exactly what the matrix
  // is meant to find.
  for (const [url, queries] of buckets) {
    queries.sort((a, b) => b.impressions - a.impressions);
    buckets.set(url, queries.slice(0, TOP_QUERIES_PER_URL));
  }

  return buckets;
}
