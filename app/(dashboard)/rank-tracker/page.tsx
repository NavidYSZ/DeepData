"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RankCharts,
  type SeriesPoint,
  type TrendPoint,
  type ChartPoint
} from "@/components/dashboard/rank-charts";
import { QueriesTable, type QueryRow } from "@/components/dashboard/queries-table";
import { QueryMultiSelect } from "@/components/dashboard/query-multiselect";
import { useSite } from "@/components/dashboard/site-context";

interface QueryResponse {
  rows: QueryRow[];
}

const fetcher = async (url: string, body?: any) => {
  const res = await fetch(url, body);
  if (!res.ok) {
    const err: any = new Error("Fetch error");
    err.status = res.status;
    throw err;
  }
  return res.json();
};

function lastNDaysRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toISO(start), end: toISO(end) };
}

export default function RankTrackerPage() {
  const { site } = useSite();
  const [startDate, setStartDate] = useState(lastNDaysRange(28).start);
  const [endDate, setEndDate] = useState(lastNDaysRange(28).end);
  const [selectedQueries, setSelectedQueries] = useState<string[]>([]);
  const autoSelectedSite = useRef<string | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTrend, setShowTrend] = useState(false);

  const { data: topQueries, isLoading: topLoading, error: topError, mutate } = useSWR<QueryResponse>(
    site
      ? ["/api/gsc/query", site, startDate, endDate]
      : null,
    async () => {
      return fetcher("/api/gsc/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: site,
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: 1000
        })
      });
    }
  );

  useEffect(() => {
    // Preselect all queries only once per site; allow user to clear selection afterwards.
    const key = site ?? "default";
    if (topQueries?.rows?.length && selectedQueries.length === 0 && autoSelectedSite.current !== key) {
      const all = topQueries.rows.map((r) => r.keys[0]);
      setSelectedQueries(all);
    } else if (selectedQueries.length > 0) {
      autoSelectedSite.current = key;
    }
  }, [topQueries, selectedQueries.length, site]);

  async function loadSeries(queries: string[]) {
    if (!site || queries.length === 0) {
      setSeries([]);
      return;
    }
    setLoadingSeries(true);
    setError(null);
    try {
      const res = await fetcher("/api/gsc/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: site,
          startDate,
          endDate,
          dimensions: ["date", "query"],
          rowLimit: 25000
        })
      });
      const rows: QueryRow[] = res.rows || [];
      const points: SeriesPoint[] = rows
        .filter((r) => queries.length === 0 || queries.includes(r.keys[1]))
        .map((r) => ({
          date: r.keys[0],
          dateNum: new Date(r.keys[0]).getTime(),
          query: r.keys[1],
          position: r.position
        }));
      setSeries(points);
    } catch (e: any) {
      setError(e.message ?? "Fehler beim Laden");
      setSeries([]);
    } finally {
      setLoadingSeries(false);
    }
  }

  useEffect(() => {
    if (selectedQueries.length) {
      loadSeries(selectedQueries);
    } else {
      setSeries([]);
    }
  }, [selectedQueries, startDate, endDate, site]);

  const notConnected = topError && (topError as any).status === 401;
  const tableRows = useMemo(() => topQueries?.rows || [], [topQueries]);
  const filteredTableRows = useMemo(() => {
    if (!selectedQueries.length) return tableRows;
    return tableRows.filter((r) => selectedQueries.includes(r.keys[0]));
  }, [tableRows, selectedQueries]);

  const impressionsMap = useMemo(() => {
    const map = new Map<string, number>();
    tableRows.forEach((r) => map.set(r.keys[0], r.impressions ?? 0));
    return map;
  }, [tableRows]);

  // nur für Charts: begrenze auf Top 15 nach Impressions der selektierten
  const chartQueries = useMemo(() => {
    const pool = selectedQueries.length ? selectedQueries : tableRows.map((r) => r.keys[0]);
    return [...pool]
      .sort((a, b) => (impressionsMap.get(b) ?? 0) - (impressionsMap.get(a) ?? 0))
      .slice(0, 15);
  }, [selectedQueries, tableRows, impressionsMap]);

  const chartSeries = useMemo(() => {
    const filtered = series.filter((p) => chartQueries.includes(p.query));
    return filtered.sort((a, b) => a.dateNum - b.dateNum);
  }, [series, chartQueries]);

  const chartData: ChartPoint[] = useMemo(() => {
    if (!chartSeries.length) return [];

    const dateNums = Array.from(new Set(chartSeries.map((p) => p.dateNum))).sort((a, b) => a - b);
    const minDate = dateNums[0];
    const maxDate = dateNums[dateNums.length - 1];
    const oneDay = 24 * 60 * 60 * 1000;

    const byDate = new Map<number, Map<string, number>>();
    chartSeries.forEach((p) => {
      if (!chartQueries.includes(p.query)) return;
      const entry = byDate.get(p.dateNum) || new Map<string, number>();
      entry.set(p.query, p.position);
      byDate.set(p.dateNum, entry);
    });

    const result: ChartPoint[] = [];
    for (let ts = minDate; ts <= maxDate; ts += oneDay) {
      const date = new Date(ts).toISOString().slice(0, 10);
      const point: ChartPoint = { date, dateNum: ts };
      chartQueries.forEach((q) => {
        const val = byDate.get(ts)?.get(q);
        point[q] = val ?? null;
      });
      result.push(point);
    }

    return result;
  }, [chartSeries, chartQueries]);

  const trendData: TrendPoint[] = useMemo(() => {
    const byDate = new Map<number, { sum: number; count: number; date: string }>();
    chartSeries.forEach((p) => {
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
  }, [chartSeries]);

  return (
    <div className="space-y-6">
      {notConnected && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Verbinde Google Search Console</h2>
              <p className="text-sm text-muted-foreground">Klicke auf verbinden, um den OAuth-Flow zu starten.</p>
            </div>
            <Button onClick={() => (window.location.href = "/api/auth/google")}>Mit Google verbinden</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-4 py-4 md:grid-cols-5 md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Start</label>
            <Input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Ende</label>
            <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="md:col-span-3 text-sm text-muted-foreground flex items-end justify-end gap-2">
            <Badge variant="secondary">Zeitraum: {startDate} – {endDate}</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {loadingSeries ? (
            <Skeleton className="h-[680px] w-full" />
          ) : (
            <RankCharts
              chartData={chartData}
              queries={chartQueries}
              trend={trendData}
              showTrend={showTrend}
              onToggleTrend={() => setShowTrend((s) => !s)}
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="lg:col-span-1 space-y-3">
          <QueryMultiSelect
            options={(tableRows || []).map((r) => ({
              value: r.keys[0],
              label: r.keys[0],
              impressions: r.impressions
            }))}
            selected={selectedQueries}
            onChange={(vals) => setSelectedQueries(Array.from(new Set(vals)))}
            onOnly={(v) => setSelectedQueries([v])}
            max={9999}
          />
          {topLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <QueriesTable rows={filteredTableRows} maxHeight={520} />
          )}
        </div>
      </div>
    </div>
  );
}
