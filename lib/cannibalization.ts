import type { QueryRow } from "@/components/dashboard/queries-table";

export interface UrlAgg {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
  share: number;
}

export interface CannibalRow {
  query: string;
  totalClicks: number;
  totalImpressions: number;
  urls: UrlAgg[];
  topShare: number;
  secondShare: number;
  spread: number;
  switches?: number;
  score: number;
  priority: number;
  priorityLevel?: "high" | "medium" | "low";
}

export function assignPriorityLevels(rows: CannibalRow[]) {
  if (!rows.length) return rows;
  const priorities = rows.map((r) => r.priority).sort((a, b) => a - b);
  const q25 = priorities[Math.floor(priorities.length * 0.25)] ?? 0;
  const q75 = priorities[Math.floor(priorities.length * 0.75)] ?? 0;
  rows.forEach((r) => {
    if (r.priority >= q75) r.priorityLevel = "high";
    else if (r.priority >= q25) r.priorityLevel = "medium";
    else r.priorityLevel = "low";
  });
  return rows;
}

export function normalizeUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.host.toLowerCase();
    const path = u.pathname.replace(/\/$/, "");
    return `${u.protocol}//${host}${path || "/"}`;
  } catch {
    // fallback: basic cleanup
    return url.trim().replace(/\/$/, "").toLowerCase();
  }
}

export function aggregateQueryPage(rows: QueryRow[]) {
  const byQuery = new Map<string, QueryRow[]>();
  rows.forEach((r) => {
    const query = r.keys[0];
    const page = normalizeUrl(r.keys[1] ?? "");
    const copy: QueryRow = { ...r, keys: [query, page] };
    const arr = byQuery.get(query) || [];
    arr.push(copy);
    byQuery.set(query, arr);
  });
  return byQuery;
}

export function computeCannibalRows(byQuery: Map<string, QueryRow[]>, metric: "clicks" | "impressions" = "clicks") {
  const results: CannibalRow[] = [];

  for (const [query, list] of byQuery.entries()) {
    // group by page
    const byPage = new Map<string, { clicks: number; impressions: number; posSum: number; posWeight: number }>();
    let totalClicks = 0;
    let totalImpr = 0;
    list.forEach((r) => {
      const page = r.keys[1];
      const entry = byPage.get(page) || { clicks: 0, impressions: 0, posSum: 0, posWeight: 0 };
      entry.clicks += r.clicks;
      entry.impressions += r.impressions;
      entry.posSum += r.position * r.impressions;
      entry.posWeight += r.impressions;
      byPage.set(page, entry);
      totalClicks += r.clicks;
      totalImpr += r.impressions;
    });

    if (byPage.size < 2) continue;

    const urls: UrlAgg[] = Array.from(byPage.entries()).map(([page, v]) => ({
      page,
      clicks: v.clicks,
      impressions: v.impressions,
      position: v.posWeight ? v.posSum / v.posWeight : 0,
      share: 0
    }));

    const denom = metric === "clicks" ? totalClicks || totalImpr || 1 : totalImpr || totalClicks || 1;
    urls.forEach((u) => {
      const basis = metric === "clicks" ? (u.clicks || u.impressions) : (u.impressions || u.clicks);
      u.share = basis / denom;
    });

    urls.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    const topShare = urls[0]?.share ?? 0;
    const secondShare = urls[1]?.share ?? 0;
    const positions = urls.map((u) => u.position);
    const spread = Math.max(...positions) - Math.min(...positions);
    const score = (1 - topShare) * Math.log1p(totalImpr || totalClicks || 1);
    const priority = (totalImpr || totalClicks || 0) * (1 - topShare) * Math.log2(urls.length + 1) * Math.log2(spread + 1);

    results.push({
      query,
      totalClicks,
      totalImpressions: totalImpr,
      urls,
      topShare,
      secondShare,
      spread,
      score,
      priority
    });
  }

  // sort descending by score
  results.sort((a, b) => b.score - a.score);
  return results;
}

export function computeSwitches(dailyRows: QueryRow[]) {
  const byQueryDate = new Map<string, Map<string, Map<string, { clicks: number; impressions: number }>>>();

  dailyRows.forEach((r) => {
    const [date, query, pageRaw] = r.keys;
    const page = normalizeUrl(pageRaw ?? "");
    const dateMap = byQueryDate.get(query) || new Map();
    const pageMap = dateMap.get(date) || new Map();
    const cur = pageMap.get(page) || { clicks: 0, impressions: 0 };
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    pageMap.set(page, cur);
    dateMap.set(date, pageMap);
    byQueryDate.set(query, dateMap);
  });

  const switches = new Map<string, number>();
  for (const [query, dateMap] of byQueryDate.entries()) {
    const days = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let prevTop: string | null = null;
    let changes = 0;
    days.forEach(([, pages]) => {
      const top = Array.from(pages.entries()).sort((a, b) => b[1].clicks - a[1].clicks || b[1].impressions - a[1].impressions)[0]?.[0];
      if (top) {
        if (prevTop && top !== prevTop) changes += 1;
        prevTop = top;
      }
    });
    switches.set(query, changes);
  }
  return switches;
}
