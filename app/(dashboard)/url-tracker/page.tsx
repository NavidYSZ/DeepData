"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableContainer } from "@/components/ui/table-container";
import { useSite } from "@/components/dashboard/site-context";
import type { QueryRow } from "@/components/dashboard/queries-table";
import { FullscreenOverlay } from "@/components/ui/fullscreen-overlay";
import {
  RankCharts,
  type SeriesPoint,
  type TrendPoint,
  type ChartPoint
} from "@/components/dashboard/rank-charts";
import { FilterBar, PageHeader, SectionCard, StatsRow } from "@/components/dashboard/page-shell";
import { SortableHeader, type SortDirection } from "@/components/dashboard/sortable-header";
import { EmptyState } from "@/components/dashboard/states";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";
import { formatRange, getLastNDaysRange, rangeToIso } from "@/lib/date-range";
import { toast } from "sonner";

interface QueryResponse {
  rows: QueryRow[];
}

interface UrlAgg {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPos: number;
  keywords: number;
  topKeyword?: string;
  topPos?: number;
  trafficShare: number;
}

const fetcher = async (url: string, body?: any) => {
  const res = await fetch(url, body);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(json?.error || "Fetch error");
    err.status = res.status;
    throw err;
  }
  return json;
};

function buildChartData(series: SeriesPoint[], queries: string[]): ChartPoint[] {
  if (!series.length || queries.length === 0) return [];
  const dateNums = Array.from(new Set(series.map((p) => p.dateNum))).sort((a, b) => a - b);
  const minDate = dateNums[0];
  const maxDate = dateNums[dateNums.length - 1];
  const oneDay = 24 * 60 * 60 * 1000;

  const byDate = new Map<number, Map<string, number>>();
  series.forEach((p) => {
    if (!queries.includes(p.query)) return;
    const entry = byDate.get(p.dateNum) || new Map<string, number>();
    entry.set(p.query, p.position);
    byDate.set(p.dateNum, entry);
  });

  const result: ChartPoint[] = [];
  for (let ts = minDate; ts <= maxDate; ts += oneDay) {
    const date = new Date(ts).toISOString().slice(0, 10);
    const point: ChartPoint = { date, dateNum: ts };
    queries.forEach((q) => {
      const val = byDate.get(ts)?.get(q);
      point[q] = val ?? null;
    });
    result.push(point);
  }
  return result;
}

function buildTrendData(series: SeriesPoint[]): TrendPoint[] {
  const byDate = new Map<number, { sum: number; count: number; date: string }>();
  series.forEach((p) => {
    const entry = byDate.get(p.dateNum) || { sum: 0, count: 0, date: p.date };
    entry.sum += p.position;
    entry.count += 1;
    byDate.set(p.dateNum, entry);
  });
  return Array.from(byDate.entries())
    .map(([dateNum, { sum, count, date }]) => ({
      dateNum,
      date,
      position: sum / count
    }))
    .sort((a, b) => a.dateNum - b.dateNum);
}

export default function UrlTrackerPage() {
  const { site } = useSite();
  const [range, setRange] = useState<DateRange | undefined>(getLastNDaysRange(28));
  const [search, setSearch] = useState("");
  const [minImpr, setMinImpr] = useState(0);
  const [minClicks, setMinClicks] = useState(0);
  type SortCol = "url" | "impressions" | "clicks" | "ctr" | "pos" | "keywords" | "traffic" | "topKeyword";
  const [sortCol, setSortCol] = useState<SortCol>("clicks");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [topN, setTopN] = useState<"200" | "500" | "all">("all");
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [detailShowTrend, setDetailShowTrend] = useState(false);
  const toasted = useRef(false);

  function toggleSort(col: SortCol) {
    if (col !== sortCol) {
      setSortCol(col);
      setSortDir("desc");
    } else {
      if (sortDir === "desc") setSortDir("asc");
      else if (sortDir === "asc") {
        setSortCol(col);
        setSortDir(null);
      } else {
        setSortDir("desc");
      }
    }
  }

  const { startDate, endDate } = useMemo(() => rangeToIso(range, 28), [range]);

  const { data, error, isLoading } = useSWR<QueryResponse>(
    site ? ["/api/gsc/query", site, startDate, endDate, "page-query"] : null,
    async () => {
      return fetcher("/api/gsc/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: site,
          startDate,
          endDate,
          dimensions: ["page", "query"],
          rowLimit: 10000
        })
      });
    }
  );

  const notConnected = (error as any)?.status === 401;

  useEffect(() => {
    if (notConnected && !toasted.current) {
      toasted.current = true;
      toast.error("GSC nicht verbunden", { description: "Bitte OAuth erneut verbinden." });
    }
  }, [notConnected]);

  const { rows = [] } = data ?? {};

  const totals = useMemo(() => {
    let totalClicks = 0;
    rows.forEach((r) => {
      totalClicks += r.clicks ?? 0;
    });
    return { totalClicks };
  }, [rows]);

  const aggRows: UrlAgg[] = useMemo(() => {
    const map = new Map<
      string,
      {
        clicks: number;
        impressions: number;
        posWeighted: number;
        keywords: number;
        topKeyword?: string;
        topPos?: number;
      }
    >();

    rows.forEach((r) => {
      const url = r.keys[0];
      const query = r.keys[1];
      const clicks = r.clicks ?? 0;
      const impr = r.impressions ?? 0;
      const pos = r.position ?? 0;
      if (!map.has(url)) {
        map.set(url, {
          clicks: 0,
          impressions: 0,
          posWeighted: 0,
          keywords: 0
        });
      }
      const entry = map.get(url)!;
      entry.clicks += clicks;
      entry.impressions += impr;
      entry.posWeighted += (pos || 0) * (impr || 0);
      entry.keywords += 1;
      const betterTop = entry.topPos == null || pos < (entry.topPos ?? Infinity);
      if (betterTop) {
        entry.topKeyword = query;
        entry.topPos = pos;
      }
    });

    return Array.from(map.entries()).map(([url, v]) => {
      const ctr = v.impressions ? v.clicks / v.impressions : 0;
      const avgPos = v.impressions ? v.posWeighted / v.impressions : 0;
      const trafficShare = totals.totalClicks ? v.clicks / totals.totalClicks : 0;
      return {
        url,
        clicks: v.clicks,
        impressions: v.impressions,
        ctr,
        avgPos,
        keywords: v.keywords,
        topKeyword: v.topKeyword,
        topPos: v.topPos,
        trafficShare
      };
    });
  }, [rows, totals.totalClicks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return aggRows
      .filter((r) => r.impressions >= minImpr && r.clicks >= minClicks)
      .filter((r) => (q ? r.url.toLowerCase().includes(q) || r.topKeyword?.toLowerCase().includes(q) : true));
  }, [aggRows, minImpr, minClicks, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (!sortDir) return arr;
    arr.sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      switch (sortCol) {
        case "url":
          return a.url.localeCompare(b.url) * dir;
        case "topKeyword":
          return (a.topKeyword ?? "").localeCompare(b.topKeyword ?? "") * dir;
        case "impressions":
          return ((a.impressions ?? 0) - (b.impressions ?? 0)) * dir;
        case "ctr":
          return ((a.ctr ?? 0) - (b.ctr ?? 0)) * dir;
        case "pos":
          return ((a.avgPos ?? 0) - (b.avgPos ?? 0)) * dir;
        case "keywords":
          return ((a.keywords ?? 0) - (b.keywords ?? 0)) * dir;
        case "traffic":
          return ((a.trafficShare ?? 0) - (b.trafficShare ?? 0)) * dir;
        case "clicks":
        default:
          return ((a.clicks ?? 0) - (b.clicks ?? 0)) * dir;
      }
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  const limited = useMemo(() => {
    if (topN === "all") return sorted;
    const n = topN === "200" ? 200 : 500;
    return sorted.slice(0, n);
  }, [sorted, topN]);

  // Detail fetch for expanded URL
  const { data: detailData, isLoading: detailLoading, error: detailError, mutate: reloadDetail } = useSWR<QueryResponse>(
    expandedUrl && site
      ? ["/api/gsc/query", "detail", expandedUrl, site, startDate, endDate]
      : null,
    async () => {
      return fetcher("/api/gsc/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: site,
          startDate,
          endDate,
          dimensions: ["query", "page"],
          filters: [{ dimension: "page", operator: "equals", expression: expandedUrl }],
          rowLimit: 500
        })
      });
    }
  );

  const {
    data: detailSeriesData,
    isLoading: detailSeriesLoading,
    error: detailSeriesError,
    mutate: reloadSeries
  } = useSWR<QueryResponse>(
    expandedUrl && site
      ? ["/api/gsc/query", "detail-series", expandedUrl, site, startDate, endDate]
      : null,
    async () => {
      return fetcher("/api/gsc/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: site,
          startDate,
          endDate,
          dimensions: ["date", "query", "page"],
          filters: [{ dimension: "page", operator: "equals", expression: expandedUrl }],
          rowLimit: 25000
        })
      });
    }
  );

  useEffect(() => {
    if (expandedUrl) setDetailShowTrend(false);
  }, [expandedUrl]);

  const detailRows = useMemo(() => detailData?.rows || [], [detailData]);

  const detailImpressions = useMemo(() => {
    const map = new Map<string, number>();
    detailRows.forEach((r) => {
      const query = r.keys[0];
      map.set(query, (map.get(query) ?? 0) + (r.impressions ?? 0));
    });
    return map;
  }, [detailRows]);

  const detailChartQueries = useMemo(() => {
    const queries = Array.from(detailImpressions.entries())
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([q]) => q)
      .slice(0, 15);
    return queries;
  }, [detailImpressions]);

  const detailSeriesPoints: SeriesPoint[] = useMemo(() => {
    const rows = detailSeriesData?.rows || [];
    return rows.map((r) => ({
      date: r.keys[0],
      dateNum: new Date(r.keys[0]).getTime(),
      query: r.keys[1],
      position: r.position
    }));
  }, [detailSeriesData]);

  const detailChartData = useMemo(
    () => buildChartData(detailSeriesPoints, detailChartQueries),
    [detailSeriesPoints, detailChartQueries]
  );

  const detailTrendData = useMemo(
    () => buildTrendData(detailSeriesPoints.filter((p) => detailChartQueries.includes(p.query))),
    [detailSeriesPoints, detailChartQueries]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="by Site"
        description="Sieh, welche URLs welche Keywords tragen – inklusive Verlauf."
      />

      {!notConnected && (
        <FilterBar className="md:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Zeitraum</label>
            <DateRangePicker value={range} onChange={setRange} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Suche (URL/Keyword)</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="example.com/page" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Min Impressions</label>
            <Input type="number" min={0} value={minImpr} onChange={(e) => setMinImpr(Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Min Clicks</label>
            <Input type="number" min={0} value={minClicks} onChange={(e) => setMinClicks(Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Top N</label>
            <div className="flex gap-2">
              {["200", "500", "all"].map((val) => (
                <Button
                  key={val}
                  size="sm"
                  variant={topN === val ? "secondary" : "outline"}
                  onClick={() => setTopN(val as any)}
                >
                  {val === "all" ? "Alle" : val}
                </Button>
              ))}
            </div>
          </div>
        </FilterBar>
      )}

      {!notConnected && (
        <StatsRow>
          <Badge variant="secondary">Zeitraum: {formatRange(range, 28)}</Badge>
          {search ? <Badge variant="secondary">Suche: {search}</Badge> : null}
          {minImpr > 0 ? <Badge variant="secondary">Min Impr: {minImpr}</Badge> : null}
          {minClicks > 0 ? <Badge variant="secondary">Min Clicks: {minClicks}</Badge> : null}
        </StatsRow>
      )}

      {notConnected && (
        <SectionCard>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Bitte Google Search Console verbinden.</span>
            <Button onClick={() => (window.location.href = "/api/auth/google")}>Verbinden</Button>
          </div>
        </SectionCard>
      )}

      {isLoading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : (
        <SectionCard title="URLs" description="Sortiere die Spalten direkt in der Tabelle.">
          <StatsRow>
            <Badge variant="secondary">URLs: {limited.length}</Badge>
          </StatsRow>
          {limited.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Keine Daten" description="Keine URLs im gewählten Zeitraum." />
            </div>
          ) : (
            <TableContainer className="mt-3">
              <Table className="min-w-[760px] text-sm lg:min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortableHeader
                        label="URL"
                        active={sortCol === "url"}
                        direction={sortCol === "url" ? sortDir : null}
                        onClick={() => toggleSort("url")}
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortableHeader
                        label="Impr"
                        active={sortCol === "impressions"}
                        direction={sortCol === "impressions" ? sortDir : null}
                        onClick={() => toggleSort("impressions")}
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortableHeader
                        label="Clicks"
                        active={sortCol === "clicks"}
                        direction={sortCol === "clicks" ? sortDir : null}
                        onClick={() => toggleSort("clicks")}
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortableHeader
                        label="CTR"
                        active={sortCol === "ctr"}
                        direction={sortCol === "ctr" ? sortDir : null}
                        onClick={() => toggleSort("ctr")}
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortableHeader
                        label="Ø Pos"
                        active={sortCol === "pos"}
                        direction={sortCol === "pos" ? sortDir : null}
                        onClick={() => toggleSort("pos")}
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortableHeader
                        label="#KW"
                        active={sortCol === "keywords"}
                        direction={sortCol === "keywords" ? sortDir : null}
                        onClick={() => toggleSort("keywords")}
                      />
                    </TableHead>
                    <TableHead className="hidden xl:table-cell">
                      <SortableHeader
                        label="Top Keyword"
                        active={sortCol === "topKeyword"}
                        direction={sortCol === "topKeyword" ? sortDir : null}
                        onClick={() => toggleSort("topKeyword")}
                      />
                    </TableHead>
                    <TableHead className="hidden text-right xl:table-cell">
                      <SortableHeader
                        label="Traffic %"
                        active={sortCol === "traffic"}
                        direction={sortCol === "traffic" ? sortDir : null}
                        onClick={() => toggleSort("traffic")}
                      />
                    </TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {limited.map((row) => {
                    const expanded = expandedUrl === row.url;
                    return (
                      <TableRow key={row.url}>
                        <TableCell className="max-w-[420px] truncate">
                          <a className="text-primary hover:underline break-all" href={row.url} target="_blank" rel="noreferrer">
                            {row.url}
                          </a>
                        </TableCell>
                        <TableCell className="text-right">{row.impressions.toLocaleString("de-DE")}</TableCell>
                        <TableCell className="text-right font-semibold">{row.clicks.toLocaleString("de-DE")}</TableCell>
                        <TableCell className="text-right">{(row.ctr * 100).toFixed(2)}%</TableCell>
                        <TableCell className="text-right">{row.avgPos.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{row.keywords}</TableCell>
                        <TableCell className="hidden max-w-[280px] truncate xl:table-cell">
                          {row.topKeyword ? (
                            <span className="text-foreground">
                              {row.topKeyword} <span className="text-muted-foreground">(Pos {row.topPos?.toFixed(1)})</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-right xl:table-cell">{(row.trafficShare * 100).toFixed(2)}%</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={expanded ? "secondary" : "outline"}
                            onClick={() => setExpandedUrl(expanded ? null : row.url)}
                          >
                            {expanded ? "Schließen" : "Keywords"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>
      )}

      {expandedUrl && (
        <FullscreenOverlay title="Keyword-Verlauf pro URL" onClose={() => setExpandedUrl(null)}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-semibold">URL:</span>{" "}
                <span className="text-primary break-all">{expandedUrl}</span>
              </div>
              <div className="flex items-center gap-2">
                {detailError && (
                  <Button size="sm" variant="outline" onClick={() => reloadDetail()}>
                    Erneut laden
                  </Button>
                )}
                {detailSeriesError && (
                  <Button size="sm" variant="outline" onClick={() => reloadSeries()}>
                    Charts neu laden
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">Zeitraum: {formatRange(range, 28)}</Badge>
              <Badge variant="secondary">Top 15 Keywords (nach Impr.)</Badge>
            </div>

            {detailSeriesLoading ? (
              <Skeleton className="h-[520px] w-full" />
            ) : detailSeriesError ? (
              <p className="text-sm text-destructive">Fehler beim Laden der Zeitreihen</p>
            ) : (
              <RankCharts
                chartData={detailChartData}
                queries={detailChartQueries}
                trend={detailTrendData}
                showTrend={detailShowTrend}
                onToggleTrend={() => setDetailShowTrend((s) => !s)}
              />
            )}

            <div className="rounded-md border border-border p-3">
              <div className="mb-2 text-sm font-semibold">Keywords (Aggregiert)</div>
              {detailLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : detailError ? (
                <p className="text-sm text-destructive">Fehler beim Laden</p>
              ) : detailRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Keywords im Zeitraum.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-2 pr-4 text-left">Keyword</th>
                        <th className="py-2 pr-4 text-right">Impr</th>
                        <th className="py-2 pr-4 text-right">Clicks</th>
                        <th className="py-2 pr-4 text-right">CTR</th>
                        <th className="py-2 pr-4 text-right">Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((r) => (
                        <tr key={r.keys.join("|")} className="border-b border-border/70">
                          <td className="py-2 pr-4">{r.keys[0]}</td>
                          <td className="py-2 pr-4 text-right">{(r.impressions ?? 0).toLocaleString("de-DE")}</td>
                          <td className="py-2 pr-4 text-right">{(r.clicks ?? 0).toLocaleString("de-DE")}</td>
                          <td className="py-2 pr-4 text-right">
                            {r.impressions ? (((r.clicks ?? 0) / r.impressions) * 100).toFixed(2) : "-"}%
                          </td>
                          <td className="py-2 pr-4 text-right">{(r.position ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}
