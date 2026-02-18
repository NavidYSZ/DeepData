"use client";

import {
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend
} from "recharts";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo } from "react";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

export interface SeriesPoint {
  date: string;
  dateNum: number;
  query: string;
  position: number;
}

export interface TrendPoint {
  date: string;
  dateNum: number;
  position: number;
}

export interface ChartPoint {
  date: string;
  dateNum: number;
  // dynamic query keys each holding a position value
  [query: string]: string | number | null;
}

const colors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#6b7280",
  "#7c3aed",
  "#f97316",
  "#ef4444",
  "#10b981"
];

function mapColor(query: string) {
  const idx = Math.abs(hashCode(query)) % colors.length;
  return colors[idx];
}

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

function toIsoDate(dateNum: number) {
  return new Date(dateNum).toISOString().slice(0, 10);
}

function buildRegressionLine(points: TrendPoint[], fallbackDomain: ChartPoint[]): TrendPoint[] {
  if (!fallbackDomain.length) return [];

  const sortedTrend = [...points].sort((a, b) => a.dateNum - b.dateNum);
  const xMin = fallbackDomain[0].dateNum;
  const xMax = fallbackDomain[fallbackDomain.length - 1].dateNum;

  if (!sortedTrend.length) return [];

  if (sortedTrend.length === 1) {
    const y = sortedTrend[0].position;
    return [
      { dateNum: xMin, date: toIsoDate(xMin), position: y },
      { dateNum: xMax, date: toIsoDate(xMax), position: y }
    ];
  }

  const n = sortedTrend.length;
  const sumX = sortedTrend.reduce((acc, p) => acc + p.dateNum, 0);
  const sumY = sortedTrend.reduce((acc, p) => acc + p.position, 0);
  const sumXY = sortedTrend.reduce((acc, p) => acc + p.dateNum * p.position, 0);
  const sumXX = sortedTrend.reduce((acc, p) => acc + p.dateNum * p.dateNum, 0);
  const denominator = n * sumXX - sumX * sumX;

  if (denominator === 0) {
    const avg = sumY / n;
    return [
      { dateNum: xMin, date: toIsoDate(xMin), position: avg },
      { dateNum: xMax, date: toIsoDate(xMax), position: avg }
    ];
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return [
    { dateNum: xMin, date: toIsoDate(xMin), position: intercept + slope * xMin },
    { dateNum: xMax, date: toIsoDate(xMax), position: intercept + slope * xMax }
  ];
}

function SeriesChart({
  title,
  data,
  queries,
  trend,
  showTrend,
  onToggleTrend,
  fixed
}: {
  title: string;
  data: ChartPoint[];
  queries: string[];
  trend: TrendPoint[];
  showTrend: boolean;
  onToggleTrend: () => void;
  fixed?: boolean;
}) {
  const sortedData = useMemo(() => [...data], [data]);
  const regressionLine = useMemo(() => buildRegressionLine(trend, sortedData), [trend, sortedData]);

  const domain = fixed ? [1, 100] : ["auto", "auto"];
  const ticks = fixed ? Array.from({ length: 10 }, (_, i) => i * 10 + 1).concat(100) : undefined;

  if (!sortedData.length) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <CardTitle>{title}</CardTitle>
          <button
            type="button"
            onClick={onToggleTrend}
            className="ml-auto inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
          >
            {showTrend ? "Trendlinien aus" : "Trendlinien an"}
            <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border">
              {showTrend ? "👁" : "🙈"}
            </span>
          </button>
        </CardHeader>
        <CardContent className="h-[450px] flex items-center justify-center text-sm text-muted-foreground">
          Keine Daten für die aktuelle Auswahl
        </CardContent>
      </Card>
    );
  }

  const config = useMemo(() => {
    const base: Record<string, { label: string; color: string }> = {
      position: { label: "Regression", color: "hsl(var(--foreground))" }
    };
    const dynamic = Object.fromEntries(
      queries.map((query) => [
        query,
        { label: query, color: mapColor(query) }
      ])
    );
    return { ...base, ...dynamic };
  }, [queries]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <CardTitle>{title}</CardTitle>
        <button
          type="button"
          onClick={onToggleTrend}
          className="ml-auto inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
        >
          {showTrend ? "Trendlinien aus" : "Trendlinien an"}
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border">
            {showTrend ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </span>
        </button>
      </CardHeader>
      <CardContent className="h-[450px]">
        <ChartContainer config={config} className="h-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sortedData} margin={{ top: 10, right: 20, left: 0, bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                dataKey="dateNum"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(ts) => new Date(ts).toISOString().slice(5, 10)}
                tick={{ fontSize: 11, dy: 6 }}
              />
              <YAxis
                domain={domain}
                reversed
                tick={{ fontSize: 11, dx: -4 }}
                ticks={ticks}
                tickCount={fixed ? undefined : 10}
              />
              <Tooltip content={<ChartTooltipContent />} labelFormatter={(value) => new Date(Number(value)).toISOString().slice(0, 10)} />
              <Legend content={(props) => <CustomLegend {...props} />} />
              {queries.map((query) => (
                <Line
                  key={query}
                  type="monotone"
                  dataKey={query}
                  name={query}
                  stroke={mapColor(query)}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  strokeWidth={1.2}
                  isAnimationActive={false}
                />
              ))}
              {showTrend && regressionLine.length > 0 && (
                <Line
                  type="linear"
                  dataKey="position"
                  data={regressionLine}
                  name="Regression"
                  stroke="hsl(var(--foreground))"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function RankCharts({
  chartData,
  queries,
  trend,
  showTrend,
  onToggleTrend
}: {
  chartData: ChartPoint[];
  queries: string[];
  trend: TrendPoint[];
  showTrend: boolean;
  onToggleTrend: () => void;
}) {
  return (
    <div className="space-y-4">
      <SeriesChart
        title="Average Position (fixed axis 1-100)"
        data={chartData}
        queries={queries}
        trend={trend}
        showTrend={showTrend}
        onToggleTrend={onToggleTrend}
        fixed
      />
      <SeriesChart
        title="Average Position (dynamic axis)"
        data={chartData}
        queries={queries}
        trend={trend}
        showTrend={showTrend}
        onToggleTrend={onToggleTrend}
      />
    </div>
  );
}

function CustomLegend({ payload }: any) {
  if (!payload) return null;
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-foreground">
      {payload.map((entry: any, index: number) => (
        <li key={index} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-foreground">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}
