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
  "#598cc0",
  "#ba5e7d",
  "#46b959",
  "#c08459",
  "#8c5eba",
  "#59afc0",
  "#b34d55",
  "#5eba5e",
  "#c0a659",
  "#ba5eb3",
  "#4ebc97",
  "#c07259",
  "#a6c059",
  "#596ac0",
  "#5495b6"
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

  const domain = fixed ? [1, 100] : ["auto", "auto"];
  const ticks = fixed ? Array.from({ length: 10 }, (_, i) => i * 10 + 1).concat(100) : undefined;

  if (!sortedData.length) {
    return (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <button
            type="button"
            onClick={onToggleTrend}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition"
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

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <button
          type="button"
          onClick={onToggleTrend}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition"
        >
          {showTrend ? "Trendlinien aus" : "Trendlinien an"}
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border">
            {showTrend ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </span>
        </button>
      </CardHeader>
      <CardContent className="h-[450px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sortedData} margin={{ top: 10, right: 20, left: 0, bottom: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
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
            <Tooltip content={<CustomTooltip queries={queries} />} />
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
            {showTrend && trend.length > 0 && (
              <Line
                type="monotone"
                dataKey="position"
                data={trend}
                name="Trend"
                stroke="#000000"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
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

function CustomTooltip({
  active,
  label,
  payload,
  queries
}: {
  active?: boolean;
  label?: number | string;
  payload?: any[];
  queries: string[];
}) {
  if (!active || !payload?.length || label === undefined || label === null) return null;

  const dateStr = new Date(Number(label)).toISOString().slice(0, 10);

  const rows = payload
    .filter((p) => queries.includes(p?.dataKey))
    .map((p) => ({
      query: p.dataKey as string,
      value: Number(p.value)
    }))
    .filter((p) => !Number.isNaN(p.value))
    .sort((a, b) => a.value - b.value);

  if (!rows.length) return null;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-md">
      <div className="text-xs font-semibold mb-2">{dateStr}</div>
      <div className="space-y-1 text-xs">
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: mapColor(row.query) }}
            />
            <span className="text-foreground">{row.query}</span>
            <span className="text-muted-foreground">{row.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
