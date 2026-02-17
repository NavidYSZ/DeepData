import { searchAnalyticsQuery } from "@/lib/gsc";
import { buildCannibalization, buildContentDecay, buildOverallMetrics, buildQuickWins, buildTopList, GscRow, UiBlock } from "@/lib/agent/analysis";
import type { DateRanges } from "@/lib/agent/context";

export type RunbookId =
  | "quick_wins"
  | "content_decay"
  | "cannibalization"
  | "top_queries"
  | "top_pages"
  | "audit";

export const RUNBOOKS: Record<RunbookId, { label: string; description: string }> = {
  quick_wins: { label: "Quick Wins (letzte 28 Tage)", description: "CTR niedrig, Position 4–15" },
  content_decay: { label: "Content Decay (28 Tage vs vorher)", description: "Verlierer im Vergleichszeitraum" },
  cannibalization: { label: "Cannibalization (letzte 28 Tage)", description: "Queries mit mehreren URLs" },
  top_queries: { label: "Top Queries (letzte 28 Tage)", description: "Top Keywords nach Impressions" },
  top_pages: { label: "Top Pages (letzte 28 Tage)", description: "Top URLs nach Impressions" },
  audit: { label: "Gesamt-Audit (28 Tage)", description: "Quick Wins, Decay, Cannibalization, Top Listen" }
};

export type RunbookContext = {
  siteUrl: string;
  ranges: DateRanges;
  rowLimit: number;
  topN: number;
  cannibalTopQueries: number;
  cannibalMinImpr: number;
};

export type RunbookOutput = {
  title: string;
  blocks: UiBlock[];
  facts: Record<string, any>;
};

async function query(
  token: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit: number
) {
  return (await searchAnalyticsQuery(token, siteUrl, {
    startDate,
    endDate,
    dimensions,
    rowLimit
  })) as GscRow[];
}

export async function runQuickWins(token: string, ctx: RunbookContext): Promise<RunbookOutput> {
  const rows = await query(
    token,
    ctx.siteUrl,
    ctx.ranges.current.start,
    ctx.ranges.current.end,
    ["query", "page"],
    ctx.rowLimit
  );
  const { blocks, facts } = buildQuickWins(rows, ctx.topN);
  return { title: RUNBOOKS.quick_wins.label, blocks, facts };
}

export async function runContentDecay(token: string, ctx: RunbookContext): Promise<RunbookOutput> {
  const current = await query(
    token,
    ctx.siteUrl,
    ctx.ranges.current.start,
    ctx.ranges.current.end,
    ["page"],
    ctx.rowLimit
  );
  const previous = await query(
    token,
    ctx.siteUrl,
    ctx.ranges.previous.start,
    ctx.ranges.previous.end,
    ["page"],
    ctx.rowLimit
  );
  const { blocks, facts } = buildContentDecay(current, previous, ctx.topN);
  return { title: RUNBOOKS.content_decay.label, blocks, facts };
}

export async function runCannibalization(token: string, ctx: RunbookContext): Promise<RunbookOutput> {
  const rows = await query(
    token,
    ctx.siteUrl,
    ctx.ranges.current.start,
    ctx.ranges.current.end,
    ["query", "page"],
    ctx.rowLimit
  );
  const { blocks, facts } = buildCannibalization(rows, ctx.topN, ctx.cannibalTopQueries, ctx.cannibalMinImpr);
  return { title: RUNBOOKS.cannibalization.label, blocks, facts };
}

export async function runTopQueries(token: string, ctx: RunbookContext): Promise<RunbookOutput> {
  const rows = await query(
    token,
    ctx.siteUrl,
    ctx.ranges.current.start,
    ctx.ranges.current.end,
    ["query"],
    ctx.rowLimit
  );
  const { blocks, facts } = buildTopList(rows, ctx.topN, "Top Queries", "Query");
  return { title: RUNBOOKS.top_queries.label, blocks, facts };
}

export async function runTopPages(token: string, ctx: RunbookContext): Promise<RunbookOutput> {
  const rows = await query(
    token,
    ctx.siteUrl,
    ctx.ranges.current.start,
    ctx.ranges.current.end,
    ["page"],
    ctx.rowLimit
  );
  const { blocks, facts } = buildTopList(rows, ctx.topN, "Top Pages", "URL");
  return { title: RUNBOOKS.top_pages.label, blocks, facts };
}

export async function runAudit(token: string, ctx: RunbookContext): Promise<RunbookOutput> {
  const results: RunbookOutput[] = [];
  results.push(await runQuickWins(token, ctx));
  results.push(await runContentDecay(token, ctx));
  results.push(await runCannibalization(token, ctx));
  results.push(await runTopQueries(token, ctx));
  results.push(await runTopPages(token, ctx));

  const metricsSource = await query(
    token,
    ctx.siteUrl,
    ctx.ranges.current.start,
    ctx.ranges.current.end,
    ["query"],
    ctx.rowLimit
  );
  const overall = buildOverallMetrics(metricsSource, "Gesamt-Metriken (letzte 28 Tage)");

  const blocks = [
    ...overall.blocks,
    ...results.flatMap((r) => r.blocks)
  ];
  const facts = {
    overall: overall.facts,
    quickWins: results[0].facts,
    contentDecay: results[1].facts,
    cannibalization: results[2].facts,
    topQueries: results[3].facts,
    topPages: results[4].facts
  };
  return { title: RUNBOOKS.audit.label, blocks, facts };
}
