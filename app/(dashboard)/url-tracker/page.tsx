"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSite } from "@/components/dashboard/site-context";
import type { QueryRow } from "@/components/dashboard/queries-table";
import { cn } from "@/lib/utils";

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

function lastNDaysRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toISO(start), end: toISO(end) };
}

export default function UrlTrackerPage() {
  const { site } = useSite();
  const [startDate, setStartDate] = useState(lastNDaysRange(28).start);
  const [endDate, setEndDate] = useState(lastNDaysRange(28).end);
  const [search, setSearch] = useState("");
  const [minImpr, setMinImpr] = useState(0);
  const [minClicks, setMinClicks] = useState(0);
  const [sortBy, setSortBy] = useState<"clicks" | "impressions" | "ctr" | "pos" | "keywords" | "traffic">("clicks");
  const [topN, setTopN] = useState<"200" | "500" | "all">("all");
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);

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
    arr.sort((a, b) => {
      switch (sortBy) {
        case "impressions":
          return (b.impressions ?? 0) - (a.impressions ?? 0);
        case "ctr":
          return (b.ctr ?? 0) - (a.ctr ?? 0);
        case "pos":
          return (a.avgPos ?? 0) - (b.avgPos ?? 0);
        case "keywords":
          return (b.keywords ?? 0) - (a.keywords ?? 0);
        case "traffic":
          return (b.trafficShare ?? 0) - (a.trafficShare ?? 0);
        case "clicks":
        default:
          return (b.clicks ?? 0) - (a.clicks ?? 0);
      }
    });
    return arr;
  }, [filtered, sortBy]);

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

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Start</label>
            <Input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Ende</label>
            <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Suche (URL/Keyword)</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="example.com/page" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Sortierung</label>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                { key: "clicks", label: "Clicks" },
                { key: "impressions", label: "Impressions" },
                { key: "ctr", label: "CTR" },
                { key: "pos", label: "Ø Position" },
                { key: "keywords", label: "#Keywords" },
                { key: "traffic", label: "Traffic %" }
              ].map((opt) => (
                <Button
                  key={opt.key}
                  size="sm"
                  variant={sortBy === opt.key ? "secondary" : "outline"}
                  onClick={() => setSortBy(opt.key as any)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
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
        </CardContent>
      </Card>

      {notConnected && (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-between py-4">
            <span className="text-sm text-muted-foreground">Bitte Google Search Console verbinden.</span>
            <Button onClick={() => (window.location.href = "/api/auth/google")}>Verbinden</Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
              <Badge variant="secondary">URLs: {limited.length}</Badge>
              <Badge variant="secondary">Zeitraum: {startDate} – {endDate}</Badge>
            </div>
            {limited.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Daten im Zeitraum.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2 pr-4 text-left">URL</th>
                      <th className="py-2 pr-4 text-right">Impr</th>
                      <th className="py-2 pr-4 text-right">Clicks</th>
                      <th className="py-2 pr-4 text-right">CTR</th>
                      <th className="py-2 pr-4 text-right">Ø Pos</th>
                      <th className="py-2 pr-4 text-right">#KW</th>
                      <th className="py-2 pr-4 text-left">Top Keyword</th>
                      <th className="py-2 pr-4 text-right">Traffic %</th>
                      <th className="py-2 pr-2 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {limited.map((row) => {
                      const expanded = expandedUrl === row.url;
                      return (
                        <tr key={row.url} className="border-b border-border/70 align-top">
                          <td className="py-2 pr-4">
                            <a className="text-primary hover:underline break-all" href={row.url} target="_blank" rel="noreferrer">
                              {row.url}
                            </a>
                          </td>
                          <td className="py-2 pr-4 text-right">{row.impressions.toLocaleString("de-DE")}</td>
                          <td className="py-2 pr-4 text-right font-semibold">{row.clicks.toLocaleString("de-DE")}</td>
                          <td className="py-2 pr-4 text-right">{(row.ctr * 100).toFixed(2)}%</td>
                          <td className="py-2 pr-4 text-right">{row.avgPos.toFixed(2)}</td>
                          <td className="py-2 pr-4 text-right">{row.keywords}</td>
                          <td className="py-2 pr-4 text-left">
                            {row.topKeyword ? (
                              <span className="text-foreground">{row.topKeyword} <span className="text-muted-foreground">(Pos {row.topPos?.toFixed(1)})</span></span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right">{(row.trafficShare * 100).toFixed(2)}%</td>
                          <td className="py-2 pr-2 text-right">
                            <Button
                              size="sm"
                              variant={expanded ? "secondary" : "outline"}
                              onClick={() => setExpandedUrl(expanded ? null : row.url)}
                            >
                              {expanded ? "Schließen" : "Keywords"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {expandedUrl && (
        <Card className="border-primary/30">
          <CardContent className="py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-semibold">Keywords für:</span>{" "}
                <span className="text-primary break-all">{expandedUrl}</span>
              </div>
              <div className="flex items-center gap-2">
                {detailError && (
                  <Button size="sm" variant="outline" onClick={() => reloadDetail()}>
                    Erneut laden
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setExpandedUrl(null)}>
                  Schließen
                </Button>
              </div>
            </div>
            {detailLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : detailError ? (
              <p className="text-sm text-destructive">Fehler beim Laden</p>
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
                    {(detailData?.rows || []).map((r) => (
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
