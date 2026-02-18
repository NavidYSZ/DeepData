"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { CannibalizationTable } from "@/components/dashboard/cannibalization-table";
import { BubbleScatter, DumbbellChart } from "@/components/dashboard/cannibalization-visuals";
import { useSite } from "@/components/dashboard/site-context";
import type { QueryRow } from "@/components/dashboard/queries-table";
import { FilterBar, PageHeader, SectionCard, StatsRow } from "@/components/dashboard/page-shell";
import { ErrorState } from "@/components/dashboard/states";
import {
  aggregateQueryPage,
  computeCannibalRows,
  computeSwitches,
  assignPriorityLevels,
  type CannibalRow
} from "@/lib/cannibalization";
import { Maximize2 } from "lucide-react";
import { FullscreenOverlay } from "@/components/ui/fullscreen-overlay";

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
  const [shareMetric, setShareMetric] = useState<"clicks" | "impressions">("clicks");
  const [minImprSlider, setMinImprSlider] = useState(0);
  const [urlBucket, setUrlBucket] = useState<"all" | "2" | "3-4" | "5+">("all");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [selectedBubble, setSelectedBubble] = useState<CannibalRow | null>(null);

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
    const base = assignPriorityLevels(computeCannibalRows(byQuery, shareMetric));

    const switchesMap = includeSwitches && dailyRows.length ? computeSwitches(dailyRows) : null;
    if (switchesMap) {
      base.forEach((r) => {
        const val = switchesMap.get(r.query);
        if (val !== undefined) r.switches = val;
      });
    }

    const list = base.filter((r) => {
      const passesUrls = r.urls.length >= 2;
      const passesThreshold =
        r.totalImpressions >= Math.max(minImpr, minImprSlider) || r.totalClicks >= minClicks;
      const bucket = r.urls.length <= 2 ? "2" : r.urls.length <= 4 ? "3-4" : "5+";
      const bucketOk = urlBucket === "all" || urlBucket === bucket;
      const criticalOk = !onlyCritical || (r.topShare < 0.6 && r.spread > 20);
      const q = r.query.toLowerCase();
      const containsOk = contains.trim() ? q.includes(contains.trim().toLowerCase()) : true;
      const notContainsOk = notContains.trim() ? !q.includes(notContains.trim().toLowerCase()) : true;
      return passesUrls && passesThreshold && bucketOk && criticalOk && containsOk && notContainsOk;
    });

    return list.slice(0, topN);
  }, [rows, dailyRows, minImpr, minClicks, minImprSlider, urlBucket, onlyCritical, contains, notContains, topN, includeSwitches, shareMetric]);

  useEffect(() => {
    if (selectedBubble && !filteredRows.find((r) => r.query === selectedBubble.query)) {
      setSelectedBubble(null);
    }
  }, [filteredRows, selectedBubble]);

  const bubbleData = useMemo(() => {
    return filteredRows.map((r) => {
      const bucket = r.urls.length <= 2 ? "2" : r.urls.length <= 4 ? "3-4" : "5+";
      return {
        query: r.query,
        x: r.topShare * 100,
        y: r.spread,
        size: r.totalImpressions,
        urls: r.urls.length,
        topShare: r.topShare * 100,
        secondShare: r.secondShare * 100,
        impressions: r.totalImpressions,
        priority: r.priority,
        priorityLevel: r.priorityLevel,
        label: r.priorityLevel === "high" ? r.query : undefined,
        bucket
      };
    });
  }, [filteredRows]);

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

  const [activeQuadrant, setActiveQuadrant] = useState<"all" | "q1" | "q2" | "q3" | "q4">("all");
  const [fullscreen, setFullscreen] = useState(false);

  const filteredBubbleData = useMemo(() => {
    const data = bubbleData;
    if (activeQuadrant === "all") return data;
    const isQ1 = (p: any) => p.x > 60 && p.y < 20;
    const isQ2 = (p: any) => p.x <= 60 && p.y < 20;
    const isQ3 = (p: any) => p.x > 60 && p.y >= 20;
    const isQ4 = (p: any) => p.x <= 60 && p.y >= 20;
    const match = { q1: isQ1, q2: isQ2, q3: isQ3, q4: isQ4 }[activeQuadrant];
    return data.filter(match);
  }, [bubbleData, activeQuadrant]);

  useEffect(() => {
    if (selectedBubble && !filteredBubbleData.find((r) => r.query === selectedBubble.query)) {
      setSelectedBubble(null);
    }
  }, [filteredBubbleData, selectedBubble]);

  const notConnected = error && error.toLowerCase().includes("not connected");
  const recommendation = (r: CannibalRow) => {
    if (r.topShare < 0.6 && r.spread > 20) return "Merge/Simplify: klare Haupt-URL setzen, interne Links vereinheitlichen";
    if (r.urls.length >= 3 && r.secondShare > 0.2) return "Split intent / interne Verlinkung klarziehen";
    return "Keep & monitor";
  };

  const dumbbellData = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 20)
      .map((r) => ({
        query: r.query,
        top: r.topShare * 100,
        second: r.secondShare * 100,
        urls: r.urls.length,
        impressions: r.totalImpressions,
        priority: r.priority
      }));
  }, [filteredRows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kannibalisierung"
        description="Erkenne Keyword-Überlappung und priorisiere Handlungsbedarf."
      />

      {notConnected && (
        <SectionCard>
          <div className="flex flex-col gap-4 py-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Verbinde Google Search Console</h2>
              <p className="text-sm text-muted-foreground">Klicke auf verbinden, um den OAuth-Flow zu starten.</p>
            </div>
            <Button onClick={() => (window.location.href = "/api/auth/google")}>Mit Google verbinden</Button>
          </div>
        </SectionCard>
      )}

      <FilterBar className="md:grid-cols-6 md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Start</label>
            <Input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Ende</label>
            <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Shares</label>
            <RadioGroup
              value={shareMetric}
              onValueChange={(val) => setShareMetric(val as "clicks" | "impressions")}
              className="flex items-center gap-4 text-sm text-muted-foreground"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="clicks" id="share-clicks" />
                <label htmlFor="share-clicks" className="text-sm font-medium leading-none">
                  Clicks
                </label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="impressions" id="share-impressions" />
                <label htmlFor="share-impressions" className="text-sm font-medium leading-none">
                  Impressions
                </label>
              </div>
            </RadioGroup>
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
              <Checkbox
                id="include-switches"
                checked={includeSwitches}
                onCheckedChange={(val) => setIncludeSwitches(Boolean(val))}
              />
              <label htmlFor="include-switches" className="text-sm text-muted-foreground">
                URL-Wechsel berechnen
              </label>
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
          <div className="md:col-span-6 grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Min Impressions (Slider)</label>
              <input
                type="range"
                min={0}
                max={5000}
                step={50}
                value={minImprSlider}
                onChange={(e) => setMinImprSlider(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-muted-foreground">Aktuell: {minImprSlider}</div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">URL-Bucket</label>
              <div className="flex flex-wrap gap-2">
                {(["all", "2", "3-4", "5+"] as const).map((b) => (
                  <Button
                    key={b}
                    size="sm"
                    variant={urlBucket === b ? "secondary" : "outline"}
                    onClick={() => setUrlBucket(b)}
                  >
                    {b === "all" ? "Alle" : b === "2" ? "2 URLs" : b === "3-4" ? "3–4 URLs" : "5+ URLs"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nur kritisch</label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="only-critical"
                  checked={onlyCritical}
                  onCheckedChange={(val) => setOnlyCritical(Boolean(val))}
                />
                <label htmlFor="only-critical" className="text-sm text-muted-foreground">
                  Top Share &lt; 60% und Spread &gt; 20
                </label>
              </div>
            </div>
          </div>
        </FilterBar>

      {error && !notConnected && <ErrorState>{error}</ErrorState>}

      <StatsRow>
        <Badge variant="secondary">Zeitraum: {startDate} – {endDate}</Badge>
        <Badge variant="secondary">Queries: {stats?.queries ?? 0}</Badge>
        <Badge variant="secondary">Impressions: {(stats?.impressions ?? 0).toLocaleString("de-DE")}</Badge>
        <Badge variant="secondary">Clicks: {(stats?.clicks ?? 0).toLocaleString("de-DE")}</Badge>
        <Badge variant="secondary">Ø Top Share: {stats ? (stats.avgTopShare * 100).toFixed(1) : "-"}%</Badge>
        <Badge variant="secondary">Ø URLs/Query: {stats ? stats.avgUrls.toFixed(1) : "-"}</Badge>
      </StatsRow>

      {loading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : (
        <CannibalizationTable rows={filteredRows} showSwitches={includeSwitches} />
      )}

      {!loading && filteredRows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-base">Bubble: Top Share vs Spread</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { key: "all", label: "Alle" },
                { key: "q1", label: "Q1 (x>60,y<20)" },
                { key: "q2", label: "Q2 (x≤60,y<20)" },
                { key: "q3", label: "Q3 (x>60,y≥20)" },
                { key: "q4", label: "Q4 (x≤60,y≥20)" }
              ].map((q) => (
                      <Button
                        key={q.key}
                        size="sm"
                        variant={activeQuadrant === q.key ? "secondary" : "outline"}
                        onClick={() => setActiveQuadrant(q.key as any)}
                      >
                  {q.label}
                </Button>
              ))}
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setFullscreen(true)} aria-label="Vollbild">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 py-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 h-[520px]">
                <BubbleScatter
                  data={filteredBubbleData}
                  onSelect={(query) => {
                    const found = filteredRows.find((r) => r.query === query) || null;
                    setSelectedBubble(found);
                  }}
                />
              </div>
              <Card className="h-[520px]">
                <CardContent className="py-3 space-y-2 text-sm">
                  {!selectedBubble && <p className="text-muted-foreground">Klicke eine Bubble für Details.</p>}
                  {selectedBubble && (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold break-words">{selectedBubble.query}</span>
                        <Badge variant={selectedBubble.priorityLevel === "high" ? "destructive" : selectedBubble.priorityLevel === "medium" ? "secondary" : "default"}>
                          {selectedBubble.priorityLevel ?? "low"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Top Share: {(selectedBubble.topShare * 100).toFixed(1)}%</div>
                        <div>2nd Share: {(selectedBubble.secondShare * 100).toFixed(1)}%</div>
                        <div>URLs: {selectedBubble.urls.length}</div>
                        <div>Spread: {selectedBubble.spread.toFixed(1)}</div>
                        <div>Impr.: {selectedBubble.totalImpressions.toLocaleString("de-DE")}</div>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p className="font-semibold">Empfehlung</p>
                        <p>{recommendation(selectedBubble)}</p>
                      </div>
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold text-muted-foreground">URLs</p>
                        <div className="space-y-1">
                          {selectedBubble.urls.map((u) => (
                            <div key={u.page} className="flex justify-between gap-2">
                              <span className="truncate text-foreground" title={u.page}>{u.page}</span>
                              <span className="text-muted-foreground">
                                {(u.share * 100).toFixed(1)}% · pos {u.position.toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="h-[380px]">
              <DumbbellChart data={dumbbellData} />
            </div>
          </CardContent>
        </Card>
      )}

      {fullscreen && (
        <FullscreenOverlay title="Bubble: Top Share vs Spread" onClose={() => setFullscreen(false)}>
          <div className="h-[75vh] min-h-[480px]">
            <BubbleScatter
              data={filteredBubbleData}
              onSelect={(query) => {
                const found = filteredRows.find((r) => r.query === query) || null;
                setSelectedBubble(found);
              }}
            />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}
