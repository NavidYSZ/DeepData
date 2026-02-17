export type UiBlock =
  | { type: "table"; title?: string; columns: string[]; rows: (string | number)[][] }
  | { type: "metrics"; title?: string; items: { label: string; value: string }[] }
  | { type: "actions"; title?: string; items: string[] }
  | { type: "note"; tone?: "info" | "warn"; text: string };

export type GscRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type Agg = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

const nf = new Intl.NumberFormat("de-DE");

function fmtInt(value: number) {
  return nf.format(Math.round(value));
}

function fmtPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtPos(value: number) {
  return value.toFixed(1);
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function aggregateByKey(rows: GscRow[], keyIndex: number) {
  const map = new Map<string, { clicks: number; impressions: number; posSum: number; posWeight: number }>();
  rows.forEach((r) => {
    const key = r.keys[keyIndex] ?? "";
    const entry = map.get(key) || { clicks: 0, impressions: 0, posSum: 0, posWeight: 0 };
    entry.clicks += r.clicks;
    entry.impressions += r.impressions;
    entry.posSum += r.position * r.impressions;
    entry.posWeight += r.impressions;
    map.set(key, entry);
  });
  const out = new Map<string, Agg>();
  for (const [key, v] of map.entries()) {
    const ctr = v.impressions > 0 ? v.clicks / v.impressions : 0;
    const position = v.posWeight > 0 ? v.posSum / v.posWeight : 0;
    out.set(key, { clicks: v.clicks, impressions: v.impressions, ctr, position });
  }
  return out;
}

export function buildQuickWins(rows: GscRow[], topN: number) {
  const eligible = rows.filter((r) => r.position >= 4 && r.position <= 15 && r.impressions > 0);
  const medianCtr = median(eligible.map((r) => r.ctr));
  const wins = eligible
    .filter((r) => r.ctr < medianCtr)
    .map((r) => {
      const opportunity = Math.max(0, (medianCtr - r.ctr) * r.impressions);
      return { ...r, opportunity };
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, topN);

  if (!wins.length) {
    return {
      blocks: [{ type: "note", tone: "info", text: "Keine Quick-Wins im gewählten Zeitraum gefunden." }] as UiBlock[],
      facts: { medianCtr }
    };
  }

  const block: UiBlock = {
    type: "table",
    title: "Quick Wins (CTR niedrig, Position 4–15)",
    columns: ["Query", "URL", "Impr", "CTR", "Pos", "Clicks", "Opportunity"],
    rows: wins.map((r) => [
      r.keys[0] ?? "",
      r.keys[1] ?? "",
      fmtInt(r.impressions),
      fmtPct(r.ctr),
      fmtPos(r.position),
      fmtInt(r.clicks),
      fmtInt(r.opportunity)
    ])
  };

  return {
    blocks: [block],
    facts: {
      medianCtr,
      count: wins.length,
      top: wins.slice(0, 5).map((r) => ({
        query: r.keys[0],
        url: r.keys[1],
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position
      }))
    }
  };
}

export function buildContentDecay(current: GscRow[], previous: GscRow[], topN: number) {
  const curMap = aggregateByKey(current, 0);
  const prevMap = aggregateByKey(previous, 0);
  const pages = new Set<string>([...curMap.keys(), ...prevMap.keys()]);
  const rows = Array.from(pages).map((page) => {
    const cur = curMap.get(page) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const prev = prevMap.get(page) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    return {
      page,
      cur,
      prev,
      deltaClicks: cur.clicks - prev.clicks,
      deltaImpr: cur.impressions - prev.impressions,
      deltaCtr: cur.ctr - prev.ctr,
      deltaPos: cur.position - prev.position
    };
  });

  const losers = rows
    .filter((r) => r.deltaClicks < 0 || r.deltaImpr < 0)
    .sort((a, b) => a.deltaClicks - b.deltaClicks || a.deltaImpr - b.deltaImpr)
    .slice(0, topN);

  const sum = (map: Map<string, Agg>) => {
    let clicks = 0;
    let impressions = 0;
    let posSum = 0;
    let posWeight = 0;
    for (const v of map.values()) {
      clicks += v.clicks;
      impressions += v.impressions;
      posSum += v.position * v.impressions;
      posWeight += v.impressions;
    }
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const position = posWeight > 0 ? posSum / posWeight : 0;
    return { clicks, impressions, ctr, position };
  };

  const curTotals = sum(curMap);
  const prevTotals = sum(prevMap);

  const metrics: UiBlock = {
    type: "metrics",
    title: "Content Decay – Gesamt",
    items: [
      { label: "Clicks (aktuell)", value: fmtInt(curTotals.clicks) },
      { label: "Clicks (vorher)", value: fmtInt(prevTotals.clicks) },
      { label: "Impr (aktuell)", value: fmtInt(curTotals.impressions) },
      { label: "Impr (vorher)", value: fmtInt(prevTotals.impressions) },
      { label: "CTR (aktuell)", value: fmtPct(curTotals.ctr) },
      { label: "CTR (vorher)", value: fmtPct(prevTotals.ctr) },
      { label: "Avg. Pos (aktuell)", value: fmtPos(curTotals.position) },
      { label: "Avg. Pos (vorher)", value: fmtPos(prevTotals.position) }
    ]
  };

  if (!losers.length) {
    const note: UiBlock = { type: "note", tone: "info", text: "Keine klaren Verlierer im Zeitraum gefunden." };
    const blocks: UiBlock[] = [metrics, note];
    return {
      blocks,
      facts: { totals: { current: curTotals, previous: prevTotals } }
    };
  }

  const table: UiBlock = {
    type: "table",
    title: "Content Decay – Top Verlierer",
    columns: ["URL", "ΔClicks", "ΔImpr", "ΔCTR", "ΔPos", "Clicks (aktuell)", "Clicks (vorher)"],
    rows: losers.map((r) => [
      r.page,
      fmtInt(r.deltaClicks),
      fmtInt(r.deltaImpr),
      fmtPct(r.deltaCtr),
      fmtPos(r.deltaPos),
      fmtInt(r.cur.clicks),
      fmtInt(r.prev.clicks)
    ])
  };

  const blocks: UiBlock[] = [metrics, table];
  return {
    blocks,
    facts: {
      totals: { current: curTotals, previous: prevTotals },
      losers: losers.slice(0, 5).map((r) => ({
        page: r.page,
        deltaClicks: r.deltaClicks,
        deltaImpr: r.deltaImpr
      }))
    }
  };
}

export function buildCannibalization(
  rows: GscRow[],
  topN: number,
  topQueriesLimit: number,
  minImpressions: number
) {
  const byQuery = new Map<string, Map<string, { clicks: number; impressions: number; posSum: number }>>();
  rows.forEach((r) => {
    const query = r.keys[0] ?? "";
    const page = r.keys[1] ?? "";
    const queryMap = byQuery.get(query) || new Map<string, { clicks: number; impressions: number; posSum: number }>();
    const cur = queryMap.get(page) || { clicks: 0, impressions: 0, posSum: 0 };
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    cur.posSum += r.position * r.impressions;
    queryMap.set(page, cur);
    byQuery.set(query, queryMap);
  });

  const entries = Array.from(byQuery.entries())
    .map(([query, pages]) => {
      let totalImpr = 0;
      let totalClicks = 0;
      const pageEntries = Array.from(pages.entries()).map(([page, v]) => {
        totalImpr += v.impressions;
        totalClicks += v.clicks;
        const ctr = v.impressions > 0 ? v.clicks / v.impressions : 0;
        const position = v.impressions > 0 ? v.posSum / v.impressions : 0;
        return { page, clicks: v.clicks, impressions: v.impressions, ctr, position };
      });
      return { query, pages: pageEntries, totalImpr, totalClicks };
    })
    .filter((r) => r.pages.length >= 2 && r.totalImpr >= minImpressions);

  const topByImpr = entries.sort((a, b) => b.totalImpr - a.totalImpr).slice(0, topQueriesLimit);

  const scored = topByImpr
    .map((r) => {
      const sortedPages = [...r.pages].sort((a, b) => b.impressions - a.impressions);
      const top = sortedPages[0];
      const topShare = r.totalImpr > 0 ? top.impressions / r.totalImpr : 0;
      const ctr = r.totalImpr > 0 ? r.totalClicks / r.totalImpr : 0;
      const avgPos =
        r.pages.reduce((acc, p) => acc + p.position * p.impressions, 0) / (r.totalImpr || 1);
      const score = (1 - topShare) * Math.log1p(r.totalImpr);
      return {
        query: r.query,
        urlCount: r.pages.length,
        topUrl: top.page,
        topShare,
        ctr,
        position: avgPos,
        totalImpr: r.totalImpr,
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  if (!scored.length) {
    return {
      blocks: [{ type: "note", tone: "info", text: "Keine Kannibalisierung im Zeitraum gefunden." }] as UiBlock[],
      facts: { count: 0 }
    };
  }

  const table: UiBlock = {
    type: "table",
    title: "Cannibalization (Queries mit mehreren URLs)",
    columns: ["Query", "URL Count", "Top URL", "Top Share", "CTR", "Pos"],
    rows: scored.map((r) => [
      r.query,
      fmtInt(r.urlCount),
      r.topUrl,
      fmtPct(r.topShare),
      fmtPct(r.ctr),
      fmtPos(r.position)
    ])
  };

  return {
    blocks: [table],
    facts: {
      count: scored.length,
      top: scored.slice(0, 5).map((r) => ({
        query: r.query,
        urlCount: r.urlCount,
        topShare: r.topShare
      }))
    }
  };
}

export function buildTopList(rows: GscRow[], topN: number, label: string, keyLabel: string) {
  const sorted = [...rows].sort((a, b) => b.impressions - a.impressions).slice(0, topN);
  if (!sorted.length) {
    return {
      blocks: [{ type: "note", tone: "info", text: `Keine ${label} im Zeitraum gefunden.` }] as UiBlock[],
      facts: { count: 0 }
    };
  }
  const table: UiBlock = {
    type: "table",
    title: label,
    columns: [keyLabel, "Clicks", "Impr", "CTR", "Pos"],
    rows: sorted.map((r) => [
      r.keys[0] ?? "",
      fmtInt(r.clicks),
      fmtInt(r.impressions),
      fmtPct(r.ctr),
      fmtPos(r.position)
    ])
  };
  return {
    blocks: [table],
    facts: {
      count: sorted.length,
      top: sorted.slice(0, 5).map((r) => ({
        key: r.keys[0],
        impressions: r.impressions,
        ctr: r.ctr
      }))
    }
  };
}

export function buildOverallMetrics(rows: GscRow[], title: string) {
  if (!rows.length) {
    return {
      blocks: [{ type: "note", tone: "info", text: "Keine Daten im Zeitraum gefunden." }] as UiBlock[],
      facts: { totalRows: 0 }
    };
  }
  let clicks = 0;
  let impressions = 0;
  let posSum = 0;
  let posWeight = 0;
  rows.forEach((r) => {
    clicks += r.clicks;
    impressions += r.impressions;
    posSum += r.position * r.impressions;
    posWeight += r.impressions;
  });
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const position = posWeight > 0 ? posSum / posWeight : 0;
  const block: UiBlock = {
    type: "metrics",
    title,
    items: [
      { label: "Clicks", value: fmtInt(clicks) },
      { label: "Impressions", value: fmtInt(impressions) },
      { label: "CTR", value: fmtPct(ctr) },
      { label: "Avg. Position", value: fmtPos(position) }
    ]
  };
  return {
    blocks: [block],
    facts: { clicks, impressions, ctr, position }
  };
}
