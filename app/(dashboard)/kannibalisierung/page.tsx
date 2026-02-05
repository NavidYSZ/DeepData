"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CannibalizationTable } from "@/components/dashboard/cannibalization-table";
import { useSite } from "@/components/dashboard/site-context";
import type { QueryRow } from "@/components/dashboard/queries-table";
import { aggregateQueryPage, computeCannibalRows, computeSwitches } from "@/lib/cannibalization";

interface SitesResponse {
  sites: { siteUrl: string; permissionLevel: string }[];
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

const PAGE_SIZE = 25000;
const MAX_ROWS = 125000;

async function fetchAllRows(body: any, signal?: AbortSignal) {
  let startRow = 0;
  const rows: QueryRow[] = [];
  while (startRow < MAX_ROWS) {
    const res = await fetch("/api/gsc/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, startRow, pageSize: PAGE_SIZE }),
      signal
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed ${res.status}`);
    }
    const json = await res.json();
    const batch: QueryRow[] = json.rows || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    startRow += PAGE_SIZE;
  }
  return rows;
}

export default function KannibalisierungPage() {
  const { site, setSite } = useSite();
  const { data: sitesData } = useSWR<SitesResponse>("/api/gsc/sites", fetcher);

  const [startDate, setStartDate] = useState(lastNDaysRange(28).start);
  const [endDate, setEndDate] = useState(lastNDaysRange(28).end);
  const [minImpr, setMinImpr] = useState(50);
  const [minClicks, setMinClicks] = useState(5);
  const [topN, setTopN] = useState(100);
  const [contains, setContains] = useState("");
  const [notContains, setNotContains] = useState("");
  const [includeSwitches, setIncludeSwitches] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<QueryRow[]>([]);
  const [dailyRows, setDailyRows] = useState<QueryRow[]>([]);

  useEffect(() => {
    if (!site && sitesData?.sites?.length) {
      setSite(sitesData.sites[0].siteUrl);
    }
  }, [site, sitesData, setSite]);

  useEffect(() => {
    if (!site) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const summary = await fetchAllRows({
          siteUrl: site,
          startDate,
          endDate,
          dimensions: ["query", "page"],
          rowLimit: PAGE_SIZE
        }, controller.signal);
        setRows(summary);

        if (includeSwitches) {
          const daily = await fetchAllRows({
            siteUrl: site,
            startDate,
            endDate,
            dimensions: ["date", "query", "page"],
            rowLimit: PAGE_SIZE
          }, controller.signal);
          setDailyRows(daily);
        } else {
          setDailyRows([]);
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error(err);
        setError(err.message ?? "Fehler beim Laden");
        setRows([]);
        setDailyRows([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [site, startDate, endDate, includeSwitches]);

  const filteredRows = useMemo(() => {
    const byQuery = aggregateQueryPage(rows);
    const base = computeCannibalRows(byQuery);

    const switchesMap = includeSwitches && dailyRows.length ? computeSwitches(dailyRows) : null;
    if (switchesMap) {
      base.forEach((r) => {
        const val = switchesMap.get(r.query);
        if (val !== undefined) r.switches = val;
      });
    }

    const list = base.filter((r) => {
      const passesUrls = r.urls.length >= 2;
      const passesThreshold = r.totalImpressions >= minImpr || r.totalClicks >= minClicks;
      const q = r.query.toLowerCase();
      const containsOk = contains.trim() ? q.includes(contains.trim().toLowerCase()) : true;
      const notContainsOk = notContains.trim() ? !q.includes(notContains.trim().toLowerCase()) : true;
      return passesUrls && passesThreshold && containsOk && notContainsOk;
    });

    return list.slice(0, topN);
  }, [rows, dailyRows, minImpr, minClicks, contains, notContains, topN, includeSwitches]);

  const stats = useMemo(() => {
    if (!filteredRows.length) return null;
    const agg = filteredRows.reduce(
      (acc, r) => {
        acc.impr += r.totalImpressions;
        acc.clicks += r.totalClicks;
        acc.topShare += r.topShare;
        acc.urls += r.urls.length;
        return acc;
      },
      { impr: 0, clicks: 0, topShare: 0, urls: 0 }
    );
    const n = filteredRows.length;
    return {
      queries: n,
      impressions: agg.impr,
      clicks: agg.clicks,
      avgTopShare: agg.topShare / n,
      avgUrls: agg.urls / n
    };
  }, [filteredRows]);

  const notConnected = error && error.toLowerCase().includes("not connected");

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
        <CardContent className="grid gap-4 py-4 md:grid-cols-6 md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Start</label>
            <Input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Ende</label>
            <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
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
            <Input type="number" min={1} value={topN} onChange={(e) => setTopN(Number(e.target.value) || 1)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Switching</label>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={includeSwitches} onChange={(e) => setIncludeSwitches(e.target.checked)} />
              <span className="text-sm text-muted-foreground">URL-Wechsel berechnen</span>
            </div>
          </div>
          <div className="space-y-2 md:col-span-3">
            <label className="text-sm font-medium">Query enthält</label>
            <Input placeholder="z.B. kaufen" value={contains} onChange={(e) => setContains(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-3">
            <label className="text-sm font-medium">Query enthält nicht</label>
            <Input placeholder="z.B. gratis" value={notContains} onChange={(e) => setNotContains(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {error && !notConnected && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">Zeitraum: {startDate} – {endDate}</Badge>
        <Badge variant="secondary">Queries: {stats?.queries ?? 0}</Badge>
        <Badge variant="secondary">Impressions: {(stats?.impressions ?? 0).toLocaleString("de-DE")}</Badge>
        <Badge variant="secondary">Clicks: {(stats?.clicks ?? 0).toLocaleString("de-DE")}</Badge>
        <Badge variant="secondary">Ø Top Share: {stats ? (stats.avgTopShare * 100).toFixed(1) : "-"}%</Badge>
        <Badge variant="secondary">Ø URLs/Query: {stats ? stats.avgUrls.toFixed(1) : "-"}</Badge>
      </div>

      {loading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : (
        <CannibalizationTable rows={filteredRows} showSwitches={includeSwitches} />
      )}
    </div>
  );
}
