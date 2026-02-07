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
  Tooltip,
  ReferenceLine,
  ReferenceArea
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FullscreenOverlay } from "@/components/ui/fullscreen-overlay";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSite } from "@/components/dashboard/site-context";

type Mode = "query" | "page";

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

export default function SeoBubblePage() {
  const { site } = useSite();
  const [mode, setMode] = useState<Mode>("query");
  const [topN, setTopN] = useState(300);
  const [range, setRange] = useState(28);
  const [showZones, setShowZones] = useState(true);
  const [showRefs, setShowRefs] = useState(true);
  const [selected, setSelected] = useState<DataPoint | null>(null);
  const [detailRows, setDetailRows] = useState<RawRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeQuadrant, setActiveQuadrant] = useState<"all" | "q1" | "q2" | "q3" | "q4">("all");
  const [fullscreen, setFullscreen] = useState(false);

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

  const notConnected = (error as any)?.status === 401;

  const displayPoints = useMemo(() => {
    if (activeQuadrant === "all") return points;
    const isQ1 = (p: DataPoint) => p.ctr > ctrLowThreshold && p.position < 10;
    const isQ2 = (p: DataPoint) => p.ctr <= ctrLowThreshold && p.position < 10;
    const isQ3 = (p: DataPoint) => p.ctr > ctrLowThreshold && p.position >= 10;
    const isQ4 = (p: DataPoint) => p.ctr <= ctrLowThreshold && p.position >= 10;
    const match = { q1: isQ1, q2: isQ2, q3: isQ3, q4: isQ4 }[activeQuadrant];
    return points.filter(match);
  }, [points, activeQuadrant, ctrLowThreshold]);

  useEffect(() => {
    if (selected && !displayPoints.find((p) => p.id === selected.id)) {
      setSelected(null);
    }
  }, [displayPoints, selected]);

  const displayCtrValues = displayPoints.map((p) => p.ctr);
  const displayPosValues = displayPoints.map((p) => p.position);

  const displayMaxCtr = useMemo(() => {
    if (!displayCtrValues.length) return maxCtr;
    return Math.min(0.3, Math.max(...displayCtrValues, maxCtr));
  }, [displayCtrValues, maxCtr]);

  const displayYMax = useMemo(() => {
    if (!displayPosValues.length) return yMax;
    const maxVal = Math.max(...displayPosValues, yMax);
    const p95v = p95(displayPosValues) * 1.2;
    return Math.min(100, Math.max(maxVal, p95v));
  }, [displayPosValues, yMax]);

  // Fetch detail rankings for a page when selected in page mode
  useEffect(() => {
    async function loadDetails(pageUrl: string) {
      setDetailLoading(true);
      try {
        const res = await fetcher("/api/gsc/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteUrl: site,
            startDate: body?.startDate,
            endDate: body?.endDate,
            dimensions: ["query", "page"],
            filters: [{ dimension: "page", operator: "equals", expression: pageUrl }],
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

    if (mode === "page" && selected?.primary) {
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
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
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
            {showRefs && (
              <>
                {[3, 10, 20].map((y) => (
                  <ReferenceLine
                    key={y}
                    y={y}
                    stroke="#e5e7eb"
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                  />
                ))}
                {displayMaxCtr >= 0.01 && (
                  <ReferenceLine
                    x={0.01}
                    stroke="#e5e7eb"
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
              onClick={(p: any) => setSelected(p.payload as DataPoint)}
            >
              {/* radius via data.r */}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap gap-3 py-4">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Top N</span>
            <Select
              value={String(topN)}
              onChange={(val) => setTopN(Number(val))}
              options={[
                { value: "100", label: "100" },
                { value: "300", label: "300" },
                { value: "1000", label: "1000" }
              ]}
              className="h-9 w-24"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Zeitraum</span>
            <Select
              value={String(range)}
              onChange={(val) => setRange(Number(val))}
              options={[
                { value: "7", label: "7 Tage" },
                { value: "28", label: "28 Tage" },
                { value: "90", label: "90 Tage" }
              ]}
              className="h-9 w-28"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showZones}
                onChange={(e) => setShowZones(e.target.checked)}
              />
              Zonen
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showRefs}
                onChange={(e) => setShowRefs(e.target.checked)}
              />
              Referenzlinien
            </label>
          </div>
        </CardContent>
      </Card>

      {fullscreen && (
        <FullscreenOverlay title="SEO Bubble: Position vs CTR" onClose={() => setFullscreen(false)}>
          {renderChart("h-[75vh] min-h-[500px]")}
        </FullscreenOverlay>
      )}
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

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle>SEO Bubble: Position vs CTR</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: "all", label: "Alle" },
              { key: "q1", label: "Q1 (CTR hoch, Pos < 10)" },
              { key: "q2", label: "Q2 (CTR niedrig, Pos < 10)" },
              { key: "q3", label: "Q3 (CTR hoch, Pos ≥ 10)" },
              { key: "q4", label: "Q4 (CTR niedrig, Pos ≥ 10)" }
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
        <CardContent className="grid gap-4 lg:grid-cols-4">
          <div className="lg:col-span-3 h-[520px]">
            {renderChart("h-full")}
          </div>
          <div className="lg:col-span-1 space-y-3">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!selected && <p className="text-muted-foreground">Klicke auf eine Bubble.</p>}
                {selected && (
                  <>
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
                    {mode === "page" && (
                      <div className="pt-3">
                        <div className="mb-2 text-xs font-semibold text-muted-foreground">
                          Rankings für diese Seite
                        </div>
                        {detailLoading ? (
                          <Skeleton className="h-24 w-full" />
                        ) : detailRows.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Keine Queries gefunden.</p>
                        ) : (
                          <div className="max-h-60 overflow-y-auto rounded-md border border-border/60">
                            <table className="w-full text-xs table-fixed">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="px-3 py-2 text-left w-1/2">Query</th>
                                  <th className="px-2 py-2 text-right w-1/6">Pos</th>
                                  <th className="px-2 py-2 text-right w-1/6">CTR</th>
                                  <th className="px-2 py-2 text-right w-1/6">Imp.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detailRows.map((r, idx) => (
                                  <tr key={idx} className="border-t border-border/40">
                                    <td className="px-3 py-1.5 truncate" title={r.keys[0]}>
                                      {r.keys[0]}
                                    </td>
                                    <td className="px-2 py-1.5 text-right">{r.position.toFixed(1)}</td>
                                    <td className="px-2 py-1.5 text-right">{formatPct(r.ctr)}</td>
                                    <td className="px-2 py-1.5 text-right">
                                      {r.impressions.toLocaleString("de-DE")}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
