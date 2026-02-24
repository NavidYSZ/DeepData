"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ZAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FullscreenOverlay } from "@/components/ui/fullscreen-overlay";
import { ChartContainer } from "@/components/ui/chart";
import { ArrowLeft, Maximize2, Settings } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSite } from "@/components/dashboard/site-context";
import { FilterBar, PageHeader, SectionCard } from "@/components/dashboard/page-shell";

type Mode = "query" | "page";
type PositionWindow = "all" | "top10" | "top20" | "top50";
type CtrWindow = "all" | "ctr2" | "ctr5" | "ctr10";

type RawRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type DataPoint = {
  id: string;
  primary: string;
  secondary?: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  r: number;
};

const fetcher = async (url: string, body?: any) => {
  const res = await fetch(url, body);
  if (!res.ok) {
    const err: any = new Error("fetch error");
    err.status = res.status;
    throw err;
  }
  return res.json();
};

function formatPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function p95(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(0.95 * (sorted.length - 1));
  return sorted[idx];
}

function computeRadius(impressions: number, minImp: number, maxImp: number) {
  const rMin = 4;
  const rMax = 26;
  if (maxImp === minImp) return (rMin + rMax) / 2;
  const norm =
    (Math.sqrt(impressions) - Math.sqrt(minImp)) /
    (Math.sqrt(maxImp) - Math.sqrt(minImp));
  return rMin + norm * (rMax - rMin);
}

// Expected CTR by position – industry average benchmark curve
const CTR_BENCHMARKS: Record<number, number> = {
  1: 0.285, 2: 0.157, 3: 0.110, 4: 0.080, 5: 0.072,
  6: 0.051, 7: 0.041, 8: 0.032, 9: 0.028, 10: 0.025,
  11: 0.021, 12: 0.019, 13: 0.016, 14: 0.014, 15: 0.012,
  16: 0.010, 17: 0.009, 18: 0.008, 19: 0.007, 20: 0.006,
};

function expectedCtr(position: number): number {
  if (position <= 1) return CTR_BENCHMARKS[1];
  if (position >= 20) return 0.005;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return CTR_BENCHMARKS[lower] ?? 0.005;
  const lVal = CTR_BENCHMARKS[lower] ?? 0.005;
  const uVal = CTR_BENCHMARKS[upper] ?? 0.005;
  return lVal + (uVal - lVal) * (position - lower);
}

type ActiveSegment = "all" | "quickwins" | "hidden-gems" | "highest-impact";

export default function SeoBubblePage() {
  const { site } = useSite();
  const [mode, setMode] = useState<Mode>("query");
  const [topN, setTopN] = useState(300);
  const [range, setRange] = useState(28);
  const [minImpressions, setMinImpressions] = useState(50);
  const [positionWindow, setPositionWindow] = useState<PositionWindow>("all");
  const [ctrWindow, setCtrWindow] = useState<CtrWindow>("all");
  const [showZones, setShowZones] = useState(true);
  const [showRefs, setShowRefs] = useState(true);
  const [selected, setSelected] = useState<DataPoint | null>(null);
  const [detailRows, setDetailRows] = useState<RawRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeSegment, setActiveSegment] = useState<ActiveSegment>("all");
  const [fullscreen, setFullscreen] = useState(false);

  // Brand keyword filter
  const [brandKeywords, setBrandKeywords] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("seo-bubble-brand-keywords");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [brandFilterActive, setBrandFilterActive] = useState(true);
  const [brandInput, setBrandInput] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const stored = localStorage.getItem("seo-bubble-brand-keywords");
      return stored ? JSON.parse(stored).join(", ") : "";
    } catch { return ""; }
  });

  const body = site
    ? {
        siteUrl: site,
        startDate: new Date(Date.now() - range * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
        dimensions: mode === "query" ? ["query"] : ["page"],
        rowLimit: topN
      }
    : null;

  const { data, error, isLoading } = useSWR(
    site ? ["/api/gsc/query", mode, topN, range, site] : null,
    () =>
      fetcher("/api/gsc/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
  );

  const points: DataPoint[] = useMemo(() => {
    const rows: RawRow[] = data?.rows || [];
    const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
    const truncated = sorted.slice(0, topN);
    const imps = truncated.map((r) => r.impressions);
    const minImp = Math.min(...imps, 1);
    const maxImp = Math.max(...imps, 1);
    return truncated.map((r) => {
      const primary = r.keys[0] || "—";
      const secondary = mode === "query" ? undefined : undefined;
      return {
        id: primary,
        primary,
        secondary,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.ctr,
        position: r.position,
        r: computeRadius(r.impressions, minImp, maxImp)
      };
    });
  }, [data, topN, mode]);

  const ctrValues = points.map((p) => p.ctr);
  const posValues = points.map((p) => p.position);

  const maxCtr = useMemo(() => {
    if (!ctrValues.length) return 0.1;
    const maxVal = Math.max(...ctrValues);
    return Math.min(0.3, maxVal);
  }, [ctrValues]);

  const yMax = useMemo(() => {
    if (!posValues.length) return 100;
    const maxVal = Math.max(...posValues);
    const p95v = p95(posValues) * 1.2;
    return Math.min(100, Math.max(maxVal, p95v));
  }, [posValues]);

  const ctrLowThreshold = maxCtr < 0.02 ? maxCtr * 0.6 : 0.02;
  const positionCap = useMemo(() => {
    if (positionWindow === "top10") return 10;
    if (positionWindow === "top20") return 20;
    if (positionWindow === "top50") return 50;
    return null;
  }, [positionWindow]);
  const ctrCap = useMemo(() => {
    if (ctrWindow === "ctr2") return 0.02;
    if (ctrWindow === "ctr5") return 0.05;
    if (ctrWindow === "ctr10") return 0.1;
    return null;
  }, [ctrWindow]);

  const notConnected = (error as any)?.status === 401;

  // Brand filter helper
  const isBrandKeyword = (text: string) => {
    if (!brandFilterActive || brandKeywords.length === 0) return false;
    const lower = text.toLowerCase();
    return brandKeywords.some((bk) => lower.includes(bk.toLowerCase()));
  };

  const brandFilteredCount = useMemo(() => {
    if (!brandFilterActive || brandKeywords.length === 0) return 0;
    return points.filter((p) => isBrandKeyword(p.primary)).length;
  }, [points, brandKeywords, brandFilterActive]);

  const displayPoints = useMemo(() => {
    let base = points.filter(
      (p) =>
        p.impressions >= minImpressions &&
        (positionCap == null || p.position <= positionCap) &&
        (ctrCap == null || p.ctr <= ctrCap) &&
        !isBrandKeyword(p.primary)
    );
    if (activeSegment === "all") return base;
    if (activeSegment === "quickwins") {
      return base.filter((p) => p.position <= 5 && p.ctr < expectedCtr(p.position));
    }
    if (activeSegment === "hidden-gems") {
      return base.filter((p) => p.position >= 6 && p.position <= 15 && p.ctr > expectedCtr(p.position));
    }
    if (activeSegment === "highest-impact") {
      const withImpact = base.map((p) => {
        const betterPos = Math.max(1, p.position - 3);
        const potentialCtr = expectedCtr(betterPos);
        const delta = Math.max(0, potentialCtr - p.ctr);
        return { ...p, impact: p.impressions * delta };
      });
      withImpact.sort((a, b) => b.impact - a.impact);
      return withImpact.slice(0, 50);
    }
    return base;
  }, [points, activeSegment, minImpressions, positionCap, ctrCap, brandKeywords, brandFilterActive]);

  // Segment counts for badges
  const segmentCounts = useMemo(() => {
    const base = points.filter(
      (p) =>
        p.impressions >= minImpressions &&
        (positionCap == null || p.position <= positionCap) &&
        (ctrCap == null || p.ctr <= ctrCap) &&
        !isBrandKeyword(p.primary)
    );
    const quickwins = base.filter((p) => p.position <= 5 && p.ctr < expectedCtr(p.position)).length;
    const hiddenGems = base.filter((p) => p.position >= 6 && p.position <= 15 && p.ctr > expectedCtr(p.position)).length;
    const highestImpact = Math.min(50, base.length);
    return { all: base.length, quickwins, "hidden-gems": hiddenGems, "highest-impact": highestImpact };
  }, [points, minImpressions, positionCap, ctrCap, brandKeywords, brandFilterActive]);

  useEffect(() => {
    if (selected && !displayPoints.find((p) => p.id === selected.id)) {
      setSelected(null);
    }
  }, [displayPoints, selected]);

  const displayCtrValues = displayPoints.map((p) => p.ctr);
  const displayPosValues = displayPoints.map((p) => p.position);

  const displayMaxCtr = useMemo(() => {
    if (ctrCap != null) return ctrCap;
    if (!displayCtrValues.length) return maxCtr;
    if (activeSegment !== "all") {
      // Tight fit: only visible points + 10% padding
      return Math.min(0.3, Math.max(...displayCtrValues) * 1.1);
    }
    return Math.min(0.3, Math.max(...displayCtrValues, maxCtr));
  }, [displayCtrValues, maxCtr, ctrCap, activeSegment]);

  const displayYMax = useMemo(() => {
    if (positionCap != null) return positionCap;
    if (!displayPosValues.length) return yMax;
    if (activeSegment !== "all") {
      // Tight fit: only visible points + 10% padding
      return Math.min(100, Math.ceil(Math.max(...displayPosValues) * 1.1));
    }
    const maxVal = Math.max(...displayPosValues, yMax);
    const p95v = p95(displayPosValues) * 1.2;
    return Math.min(100, Math.max(maxVal, p95v));
  }, [displayPosValues, yMax, positionCap, activeSegment]);

  // Fetch detail rankings when a bubble is selected (URLs for query, queries for page)
  useEffect(() => {
    async function loadDetails(value: string) {
      setDetailLoading(true);
      try {
        const filterDim = mode === "query" ? "query" : "page";
        const res = await fetcher("/api/gsc/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteUrl: site,
            startDate: body?.startDate,
            endDate: body?.endDate,
            dimensions: ["query", "page"],
            filters: [{ dimension: filterDim, operator: "equals", expression: value }],
            rowLimit: 500
          })
        });
        setDetailRows(res.rows || []);
      } catch (e) {
        setDetailRows([]);
      } finally {
        setDetailLoading(false);
      }
    }

    if (selected?.primary) {
      loadDetails(selected.primary);
    } else {
      setDetailRows([]);
    }
  }, [mode, selected, site, body?.startDate, body?.endDate]);

  const renderChart = (heightClass: string) => (
    <div className={heightClass}>
      {isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <ChartContainer config={{}} className="h-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }} onClick={() => setSelected(null)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              dataKey="ctr"
              name="CTR"
              domain={[0, displayMaxCtr || 0.1]}
              tickFormatter={formatPct}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="position"
              name="Position"
              domain={[1, displayYMax || 100]}
              reversed
              tick={{ fontSize: 11 }}
              ticks={[1, 3, 10, 20, 50, 100].filter((t) => t <= (displayYMax || 100))}
            />
            <ZAxis dataKey="impressions" range={[60, 800]} type="number" name="Impressions" />
            {showRefs && (
              <>
                {[3, 10, 20].map((y) => (
                  <ReferenceLine
                    key={y}
                    y={y}
                    stroke="hsl(var(--border))"
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                  />
                ))}
                {displayMaxCtr >= 0.01 && (
                  <ReferenceLine
                    x={0.01}
                    stroke="hsl(var(--border))"
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                  />
                )}
              </>
            )}
            {showZones && (
              <>
                <ReferenceArea
                  x1={0}
                  x2={ctrLowThreshold}
                  y1={1}
                  y2={10}
                  fill="#e0f2fe"
                  fillOpacity={0.25}
                  stroke="none"
                />
                <ReferenceArea
                  x1={ctrLowThreshold}
                  x2={displayMaxCtr || 0.3}
                  y1={4}
                  y2={12}
                  fill="#e2e8f0"
                  fillOpacity={0.2}
                  stroke="none"
                />
              </>
            )}
            <Tooltip
              formatter={(value: any, name) => {
                if (name === "ctr") return [formatPct(value as number), "CTR"];
                if (name === "position") return [(value as number).toFixed(1), "Position"];
                if (name === "impressions") return [(value as number).toLocaleString("de-DE"), "Impressions"];
                if (name === "clicks") return [(value as number).toLocaleString("de-DE"), "Clicks"];
                return value;
              }}
              labelFormatter={() => ""}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as DataPoint | undefined;
                if (!p) return null;
                return (
                  <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-md">
                    <div className="font-semibold">{p.primary}</div>
                    {p.secondary && <div className="text-xs text-muted-foreground">{p.secondary}</div>}
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div>Position: {p.position.toFixed(1)}</div>
                      <div>CTR: {formatPct(p.ctr)}</div>
                      <div>Impressions: {p.impressions.toLocaleString("de-DE")}</div>
                      <div>Clicks: {p.clicks.toLocaleString("de-DE")}</div>
                    </div>
                  </div>
                );
              }}
            />
            <Scatter
              name="Keywords"
              data={displayPoints}
              fill="#6366f1"
              shape="circle"
              fillOpacity={0.7}
              stroke="#312e81"
              onClick={(p: any, _idx: any, e: any) => { e?.stopPropagation?.(); setSelected(p.payload as DataPoint); }}
            >
              {/* radius is handled by ZAxis (impressions) */}
            </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Position vs CTR"
        description="CTR vs. Position als Bubble-Chart mit Quick Wins, Hidden Gems & Impact-Analyse."
      />

      <FilterBar className="md:grid-cols-2 xl:grid-cols-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Mode</span>
            <div className="flex gap-1">
              {["query", "page"].map((m) => (
                <Button
                  key={m}
                  variant={mode === m ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setMode(m as Mode)}
                >
                  {m === "query" ? "Query" : "Page"}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Top N</span>
            <Select value={String(topN)} onValueChange={(val) => setTopN(Number(val))}>
              <SelectTrigger className="h-9 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="300">300</SelectItem>
                <SelectItem value="1000">1000</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Zeitraum</span>
            <Select value={String(range)} onValueChange={(val) => setRange(Number(val))}>
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Tage</SelectItem>
                <SelectItem value="28">28 Tage</SelectItem>
                <SelectItem value="90">90 Tage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Min. Impr.</span>
            <Input
              type="number"
              min={0}
              className="h-9 w-24"
              value={minImpressions}
              onChange={(e) => setMinImpressions(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Pos-Zoom</span>
            <Select value={positionWindow} onValueChange={(val) => setPositionWindow(val as PositionWindow)}>
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="top10">Top 10</SelectItem>
                <SelectItem value="top20">Top 20</SelectItem>
                <SelectItem value="top50">Top 50</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">CTR-Zoom</span>
            <Select value={ctrWindow} onValueChange={(val) => setCtrWindow(val as CtrWindow)}>
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="ctr2">bis 2%</SelectItem>
                <SelectItem value="ctr5">bis 5%</SelectItem>
                <SelectItem value="ctr10">bis 10%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="seo-bubble-zones"
                checked={showZones}
                onCheckedChange={(val) => setShowZones(Boolean(val))}
              />
              <label htmlFor="seo-bubble-zones" className="text-sm font-medium leading-none">
                Zonen
              </label>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="seo-bubble-refs"
                checked={showRefs}
                onCheckedChange={(val) => setShowRefs(Boolean(val))}
              />
              <label htmlFor="seo-bubble-refs" className="text-sm font-medium leading-none">
                Referenzlinien
              </label>
            </div>
          </div>
      </FilterBar>

      {fullscreen && (
        <FullscreenOverlay title="Position vs CTR" onClose={() => setFullscreen(false)}>
          {renderChart("h-[75vh] min-h-[500px]")}
        </FullscreenOverlay>
      )}
      {notConnected && (
        <SectionCard>
          <div className="flex flex-col gap-4 py-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Verbinde Google Search Console</h2>
              <p className="text-sm text-muted-foreground">
                Klicke auf verbinden, um den OAuth-Flow zu starten.
              </p>
            </div>
            <Button onClick={() => (window.location.href = "/api/auth/google")}>
              Mit Google verbinden
            </Button>
          </div>
        </SectionCard>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle>Position vs CTR</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: "all" as const, label: "Alle" },
              { key: "quickwins" as const, label: "Quick Wins" },
              { key: "hidden-gems" as const, label: "Hidden Gems" },
              { key: "highest-impact" as const, label: "Highest Impact" }
            ] as const).map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant={activeSegment === s.key ? "secondary" : "outline"}
                onClick={() => setActiveSegment(s.key)}
              >
                {s.label}
                <Badge variant="outline" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {segmentCounts[s.key]}
                </Badge>
              </Button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Einstellungen">
                  <Settings className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Brand-Keywords</Label>
                    <Input
                      placeholder="z.B. visable, wlw, europages"
                      value={brandInput}
                      onChange={(e) => {
                        setBrandInput(e.target.value);
                        const keywords = e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean);
                        setBrandKeywords(keywords);
                        localStorage.setItem("seo-bubble-brand-keywords", JSON.stringify(keywords));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Kommasepariert. Keywords die einen dieser Begriffe enthalten werden gefiltert.
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="brand-filter-toggle" className="text-sm">Brand-Keywords ausblenden</Label>
                    <Switch
                      id="brand-filter-toggle"
                      checked={brandFilterActive}
                      onCheckedChange={setBrandFilterActive}
                    />
                  </div>
                  {brandFilterActive && brandKeywords.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {brandFilteredCount} Brand-Keywords ausgeblendet
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setFullscreen(true)} aria-label="Vollbild">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-4">
          <div className="h-[520px] min-w-0 lg:col-span-3">
            {renderChart("h-full")}
          </div>
          <div className="min-w-0 space-y-3 lg:col-span-1">
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  {selected && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSelected(null)}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  {selected ? "Details" : "Ergebnisse"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden text-sm">
                {!selected && (
                  <div className="h-[440px] overflow-y-auto">
                    {displayPoints.length === 0 ? (
                      <p className="text-muted-foreground">Keine Ergebnisse.</p>
                    ) : (
                      <div className="rounded-md border border-border/60">
                        <table className="w-full text-xs table-fixed">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="px-2 py-1.5 text-left w-[45%]">{mode === "query" ? "Query" : "Page"}</th>
                              <th className="px-1.5 py-1.5 text-right w-[18%]">Pos</th>
                              <th className="px-1.5 py-1.5 text-right w-[18%]">CTR</th>
                              <th className="px-1.5 py-1.5 text-right w-[19%]">Imp.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...displayPoints]
                              .sort((a, b) => b.impressions - a.impressions)
                              .map((p) => (
                                <tr
                                  key={p.id}
                                  className="border-t border-border/40 cursor-pointer hover:bg-muted/40 transition-colors"
                                  onClick={() => setSelected(p)}
                                >
                                  <td className="px-2 py-1.5 truncate" title={p.primary}>
                                    {p.primary}
                                  </td>
                                  <td className="px-1.5 py-1.5 text-right">{p.position.toFixed(1)}</td>
                                  <td className="px-1.5 py-1.5 text-right">{formatPct(p.ctr)}</td>
                                  <td className="px-1.5 py-1.5 text-right">
                                    {p.impressions.toLocaleString("de-DE")}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
                {selected && (
                  <div className="space-y-3">
                    <div className="font-semibold break-words">{selected.primary}</div>
                    {selected.secondary && (
                      <div className="text-xs text-muted-foreground break-words">
                        {selected.secondary}
                      </div>
                    )}
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div>Position: {selected.position.toFixed(1)}</div>
                      <div>CTR: {formatPct(selected.ctr)}</div>
                      <div>Impressions: {selected.impressions.toLocaleString("de-DE")}</div>
                      <div>Clicks: {selected.clicks.toLocaleString("de-DE")}</div>
                    </div>
                    <div className="flex gap-2">
                      {mode === "page" && selected.primary.startsWith("http") && (
                        <Button variant="outline" size="sm" onClick={() => window.open(selected.primary, "_blank")}>
                          Seite öffnen
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const txt = `${selected.primary}\n${selected.secondary ?? ""}\nPosition: ${selected.position.toFixed(
                            1
                          )}\nCTR: ${formatPct(selected.ctr)}\nImpressions: ${selected.impressions.toLocaleString(
                            "de-DE"
                          )}\nClicks: ${selected.clicks.toLocaleString("de-DE")}`;
                          navigator.clipboard.writeText(txt);
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <div className="pt-2">
                      <div className="mb-2 text-xs font-semibold text-muted-foreground">
                        {mode === "query" ? "URLs für diesen Query" : "Rankings für diese Seite"}
                      </div>
                      {detailLoading ? (
                        <Skeleton className="h-24 w-full" />
                      ) : detailRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {mode === "query" ? "Keine URLs gefunden." : "Keine Queries gefunden."}
                        </p>
                      ) : (
                        <div className="max-h-52 overflow-y-auto rounded-md border border-border/60">
                          <table className="w-full text-xs table-fixed">
                            <thead className="bg-muted/50 sticky top-0">
                              <tr>
                                <th className="px-2 py-1.5 text-left w-[45%]">
                                  {mode === "query" ? "URL" : "Query"}
                                </th>
                                <th className="px-1.5 py-1.5 text-right w-[18%]">Pos</th>
                                <th className="px-1.5 py-1.5 text-right w-[18%]">CTR</th>
                                <th className="px-1.5 py-1.5 text-right w-[19%]">Imp.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detailRows.map((r, idx) => {
                                // In query mode: keys[0]=query, keys[1]=page; show page
                                // In page mode: keys[0]=query, keys[1]=page; show query
                                const displayCol = mode === "query" ? (r.keys[1] || r.keys[0]) : r.keys[0];
                                return (
                                  <tr key={idx} className="border-t border-border/40">
                                    <td className="px-2 py-1.5 truncate" title={displayCol}>
                                      {displayCol}
                                    </td>
                                    <td className="px-1.5 py-1.5 text-right">{r.position.toFixed(1)}</td>
                                    <td className="px-1.5 py-1.5 text-right">{formatPct(r.ctr)}</td>
                                    <td className="px-1.5 py-1.5 text-right">
                                      {r.impressions.toLocaleString("de-DE")}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
