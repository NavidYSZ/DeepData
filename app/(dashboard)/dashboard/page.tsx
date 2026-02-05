"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSite } from "@/components/dashboard/site-context";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCards, type KpiData } from "@/components/dashboard/kpi-cards";
import { ResultsTable, type ResultRow } from "@/components/dashboard/results-table";
import { TrafficChart, type ChartPoint } from "@/components/dashboard/traffic-chart";

interface SitesResponse {
  sites: { siteUrl: string; permissionLevel: string }[];
}

interface QueryResponse {
  rows: ResultRow[];
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error: any = new Error("Fetch error");
    error.status = res.status;
    throw error;
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

export default function DashboardPage() {
  const { data: sites, error: sitesError } = useSWR<SitesResponse>("/api/gsc/sites", fetcher);
  const { site, setSite } = useSite();
  const [startDate, setStartDate] = useState(lastNDaysRange(28).start);
  const [endDate, setEndDate] = useState(lastNDaysRange(28).end);
  const [tableRows, setTableRows] = useState<ResultRow[]>([]);
  const [timeRows, setTimeRows] = useState<ResultRow[]>([]);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  useEffect(() => {
    if (!site && sites?.sites?.length) {
      setSite(sites.sites[0].siteUrl);
    }
  }, [sites, site, setSite]);

  const kpiData: KpiData | null = useMemo(() => {
    if (!tableRows.length) return null;
    const totals = tableRows.reduce(
      (acc, row) => {
        acc.clicks += row.clicks;
        acc.impressions += row.impressions;
        acc.ctr += row.ctr;
        acc.position += row.position;
        return acc;
      },
      { clicks: 0, impressions: 0, ctr: 0, position: 0 }
    );
    const avgCtr = totals.ctr / tableRows.length;
    const avgPos = totals.position / tableRows.length;
    return {
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: avgCtr,
      position: avgPos
    };
  }, [tableRows]);

  const chartData: ChartPoint[] = useMemo(() => {
    return timeRows
      .filter((r) => r.keys[0]?.match(/\\d{4}-\\d{2}-\\d{2}/))
      .map((r) => ({
        date: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [timeRows]);

  async function handleQuery() {
    if (!site) return;
    setLoadingQuery(true);
    setQueryError(null);
    try {
      const [timeRes, tableRes] = await Promise.all([
        fetch("/api/gsc/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteUrl: site,
            startDate,
            endDate,
            dimensions: ["date"],
            rowLimit: 250
          })
        }),
        fetch("/api/gsc/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteUrl: site,
            startDate,
            endDate,
            dimensions: ["query"],
            rowLimit: 250
          })
        })
      ]);

      if (!timeRes.ok) {
        const text = await timeRes.text();
        throw new Error(text || `Time series request failed: ${timeRes.status}`);
      }
      if (!tableRes.ok) {
        const text = await tableRes.text();
        throw new Error(text || `Table request failed: ${tableRes.status}`);
      }

      const timeData: QueryResponse = await timeRes.json();
      const tableData: QueryResponse = await tableRes.json();

      setTimeRows(timeData.rows || []);
      setTableRows(tableData.rows || []);
    } catch (err: any) {
      console.error(err);
      setQueryError(err.message ?? "Fehler beim Laden");
      setTimeRows([]);
      setTableRows([]);
    } finally {
      setLoadingQuery(false);
    }
  }

  const notConnected = sitesError?.status === 401;

  return (
    <div className="space-y-6">
      {notConnected && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Verbinde Google Search Console</h2>
              <p className="text-sm text-muted-foreground">
                Klicke auf verbinden, um den OAuth-Flow zu starten.
              </p>
            </div>
            <Button onClick={() => (window.location.href = "/api/auth/google")}>
              Mit Google verbinden
            </Button>
          </CardContent>
        </Card>
      )}

      {!notConnected && (
        <Card>
          <CardContent className="grid gap-4 py-4 md:grid-cols-3 md:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start</label>
              <Input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Ende</label>
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-transparent">.</label>
              <Button onClick={handleQuery} disabled={loadingQuery || !site}>
                {loadingQuery ? "Laden..." : "Laden"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">
          Status: {notConnected ? "Nicht verbunden" : "Verbunden"}
        </Badge>
        <span>
          Zeitraum: {startDate} – {endDate}
        </span>
      </div>

      <KpiCards data={kpiData} />

      {/* Performance overview moved to Rank Tracker */}

      {queryError && (
        <p className="text-sm text-destructive">Fehler beim Laden: {queryError}</p>
      )}
    </div>
  );
}
