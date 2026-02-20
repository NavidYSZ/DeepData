"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSite } from "@/components/dashboard/site-context";
import { PageHeader, SectionCard } from "@/components/dashboard/page-shell";
import { ErrorState } from "@/components/dashboard/states";
import { rangeToIso, getLastNDaysRange } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SitesResponse {
  sites: { siteUrl: string; permissionLevel: string }[];
}

interface DateMetricRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface QueryResponse {
  rows: DateMetricRow[];
}

interface PerformancePoint {
  date: string;
  dateNum: number;
  clicks: number;
  impressions: number;
  ctr: number;
}

type MetricKey = "clicks" | "impressions" | "ctr";
type MetricVisibility = Record<MetricKey, boolean>;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const METRIC_ORDER: MetricKey[] = ["clicks", "impressions", "ctr"];
const PRESETS = [
  { days: 28, label: "28 Tage" },
  { days: 90, label: "3 Monate" },
  { days: 180, label: "6 Monate" }
] as const;

const METRIC_META: Record<
  MetricKey,
  {
    label: string;
    color: string;
    activeClass: string;
    inactiveClass: string;
    valueFormatter: (value: number) => string;
    chartFormatter: (value: number) => string;
  }
> = {
  clicks: {
    label: "Klicks insgesamt",
    color: "#4285F4",
    activeClass: "border-[#4285F4]/40 bg-[#4285F4]/10 text-foreground",
    inactiveClass: "border-border bg-background text-foreground hover:bg-muted/30",
    valueFormatter: (value) => Math.round(value).toLocaleString("de-DE"),
    chartFormatter: (value) => Math.round(value).toLocaleString("de-DE")
  },
  impressions: {
    label: "Impressionen insgesamt",
    color: "#673AB7",
    activeClass: "border-[#673AB7]/40 bg-[#673AB7]/10 text-foreground",
    inactiveClass: "border-border bg-background text-foreground hover:bg-muted/30",
    valueFormatter: (value) => Math.round(value).toLocaleString("de-DE"),
    chartFormatter: (value) => Math.round(value).toLocaleString("de-DE")
  },
  ctr: {
    label: "Durchschnittliche CTR",
    color: "#0F9D58",
    activeClass: "border-[#0F9D58]/40 bg-[#0F9D58]/10 text-foreground",
    inactiveClass: "border-border bg-background text-foreground hover:bg-muted/30",
    valueFormatter: (value) => `${(value * 100).toFixed(1)} %`,
    chartFormatter: (value) => `${(value * 100).toFixed(2)}%`
  }
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error: any = new Error("Fetch error");
    error.status = res.status;
    throw error;
  }
  return res.json();
};

function formatDateShort(dateNum: number) {
  const d = new Date(dateNum);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildPerformanceSeries(rows: DateMetricRow[], startDate: string, endDate: string): PerformancePoint[] {
  const byDate = new Map<string, DateMetricRow>();
  rows.forEach((row) => {
    const key = row.keys?.[0];
    if (!key) return;
    byDate.set(key, row);
  });

  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  const result: PerformancePoint[] = [];

  for (let ts = start; ts <= end; ts += ONE_DAY_MS) {
    const date = new Date(ts).toISOString().slice(0, 10);
    const row = byDate.get(date);
    const clicks = row?.clicks ?? 0;
    const impressions = row?.impressions ?? 0;
    result.push({
      date,
      dateNum: ts,
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0
    });
  }

  return result;
}

export default function DashboardPage() {
  const { data: sites, error: sitesError } = useSWR<SitesResponse>("/api/gsc/sites", fetcher);
  const { site, setSite } = useSite();
  const [timePreset, setTimePreset] = useState<28 | 90 | 180>(90);
  const [metricVisibility, setMetricVisibility] = useState<MetricVisibility>({
    clicks: true,
    impressions: true,
    ctr: false
  });
  const [series, setSeries] = useState<PerformancePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const toasted = useRef(false);

  const { startDate, endDate } = useMemo(
    () => rangeToIso(getLastNDaysRange(timePreset), timePreset),
    [timePreset]
  );

  useEffect(() => {
    if (!site && sites?.sites?.length) {
      setSite(sites.sites[0].siteUrl);
    }
  }, [sites, site, setSite]);

  const notConnected = sitesError?.status === 401;

  useEffect(() => {
    if (!site || notConnected) {
      setSeries([]);
      return;
    }

    let cancelled = false;

    async function loadPerformance() {
      setLoading(true);
      setQueryError(null);

      try {
        const res = await fetch("/api/gsc/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteUrl: site,
            startDate,
            endDate,
            dimensions: ["date"],
            rowLimit: 1000
          })
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Performance request failed: ${res.status}`);
        }

        const data: QueryResponse = await res.json();
        if (cancelled) return;
        setSeries(buildPerformanceSeries(data.rows ?? [], startDate, endDate));
      } catch (err: any) {
        if (cancelled) return;
        setQueryError(err.message ?? "Fehler beim Laden");
        setSeries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPerformance();

    return () => {
      cancelled = true;
    };
  }, [site, startDate, endDate, notConnected]);

  useEffect(() => {
    if (notConnected && !toasted.current) {
      toasted.current = true;
      toast.error("GSC nicht verbunden", { description: "Bitte OAuth erneut verbinden." });
    }
  }, [notConnected]);

  const totals = useMemo(() => {
    const clicks = series.reduce((sum, point) => sum + point.clicks, 0);
    const impressions = series.reduce((sum, point) => sum + point.impressions, 0);
    const ctr = impressions > 0 ? clicks / impressions : 0;
    return { clicks, impressions, ctr };
  }, [series]);

  const activeMetrics = useMemo(
    () => METRIC_ORDER.filter((metric) => metricVisibility[metric]),
    [metricVisibility]
  );

  function toggleMetric(metric: MetricKey) {
    setMetricVisibility((prev) => {
      const activeCount = METRIC_ORDER.filter((key) => prev[key]).length;
      if (prev[metric] && activeCount === 1) return prev;
      return { ...prev, [metric]: !prev[metric] };
    });
  }

  if (notConnected) {
    return (
      <SectionCard>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
    );
  }

  if (!site) {
    return (
      <SectionCard>
        <p className="text-sm text-muted-foreground">Property wird geladen...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leistung"
        description="Google Search Console Performance"
      />

      <SectionCard contentClassName="py-3">
        <div className="inline-flex overflow-hidden rounded-md border border-input">
          {PRESETS.map((preset, idx) => (
            <button
              key={preset.days}
              type="button"
              onClick={() => setTimePreset(preset.days)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                idx > 0 && "border-l border-input",
                timePreset === preset.days
                  ? "bg-primary text-primary-foreground"
                  : "bg-card hover:bg-accent"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </SectionCard>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 md:grid-cols-3">
            {METRIC_ORDER.map((metric) => {
              const meta = METRIC_META[metric];
              const active = metricVisibility[metric];
              const value = totals[metric];
              return (
                <button
                  key={metric}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleMetric(metric)}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    active ? meta.activeClass : meta.inactiveClass
                  )}
                >
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span
                      className={cn(
                        "inline-flex h-4 w-4 items-center justify-center rounded border",
                        active
                          ? "border-current/40 text-current"
                          : "border-muted-foreground/40 text-transparent"
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span className={cn(active ? "text-foreground" : "text-muted-foreground")}>{meta.label}</span>
                  </div>
                  <div className="mt-2 text-3xl font-semibold leading-none tracking-tight">
                    {meta.valueFormatter(value)}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="h-[360px] rounded-lg border bg-background px-3 pb-3 pt-2 md:px-4 md:pb-4">
            {loading ? (
              <Skeleton className="h-full w-full rounded-md" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 20, right: 24, left: 8, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    dataKey="dateNum"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={formatDateShort}
                    tick={{ fontSize: 11 }}
                  />
                  {activeMetrics.map((metric, index) => (
                    <YAxis
                      key={metric}
                      yAxisId={metric}
                      orientation={index === 0 ? "left" : "right"}
                      hide={index > 1}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) =>
                        metric === "ctr"
                          ? `${(Number(value) * 100).toFixed(1)}%`
                          : Math.round(Number(value)).toLocaleString("de-DE")
                      }
                    />
                  ))}
                  <Tooltip
                    labelFormatter={(value) => new Date(Number(value)).toISOString().slice(0, 10)}
                    formatter={(value: number, name: string) => {
                      const metric = (Object.keys(METRIC_META) as MetricKey[]).find(
                        (key) => METRIC_META[key].label === name
                      );
                      if (!metric) return [value, name];
                      return [METRIC_META[metric].chartFormatter(Number(value)), name];
                    }}
                  />
                  {activeMetrics.map((metric) => (
                    <Line
                      key={metric}
                      type="monotone"
                      dataKey={metric}
                      yAxisId={metric}
                      stroke={METRIC_META[metric].color}
                      strokeWidth={2}
                      dot={false}
                      name={METRIC_META[metric].label}
                      isAnimationActive
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {queryError && <ErrorState>Fehler beim Laden: {queryError}</ErrorState>}
    </div>
  );
}
