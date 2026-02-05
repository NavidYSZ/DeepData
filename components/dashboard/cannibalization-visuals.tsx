"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  ZAxis,
  ComposedChart,
  Line,
  Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CannibalRow } from "@/lib/cannibalization";

interface BubblePoint {
  query: string;
  x: number; // top share %
  y: number; // spread
  size: number; // impressions
  urls: number;
  topShare: number;
  secondShare: number;
  impressions: number;
  priority: number;
  priorityLevel?: "high" | "medium" | "low";
  label?: string;
}

const bucketColor = (urls: number) => {
  if (urls <= 2) return "#3b82f6";
  if (urls <= 4) return "#f59e0b";
  return "#ef4444";
};

const priorityBadgeColor = (level?: string) => {
  if (level === "high") return "destructive";
  if (level === "medium") return "secondary";
  return "default";
};

export function BubbleScatter({
  data,
  onSelect,
  labelTopN = 10
}: {
  data: BubblePoint[];
  onSelect: (query: string) => void;
  labelTopN?: number;
}) {
  const maxY = Math.max(30, Math.ceil(Math.max(...data.map((d) => d.y || 0), 0)));
  const topN = [...data].sort((a, b) => b.priority - a.priority).slice(0, labelTopN).map((d) => d.query);

  return (
    <Card className="h-full">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Bubble: Top Share vs Spread</CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#3b82f6]" /> 2 URLs</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#f59e0b]" /> 3–4 URLs</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" /> 5+ URLs</span>
        </div>
      </CardHeader>
      <CardContent className="h-[520px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              type="number"
              dataKey="x"
              name="Top Share"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11 }}
              label={{ value: "Top Share (%)", position: "insideBottom", dy: 18 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Spread"
              domain={[0, maxY]}
              tick={{ fontSize: 11 }}
              label={{ value: "Spread (Positions)", angle: -90, position: "insideLeft", dx: -4 }}
            />
            <ZAxis dataKey="size" range={[60, 260]} />

            <ReferenceLine x={60} stroke="#cbd5e1" strokeDasharray="4 4" />
            <ReferenceLine y={20} stroke="#cbd5e1" strokeDasharray="4 4" />
            <ReferenceArea x1={60} x2={100} y1={0} y2={20} fill="#d1fae5" fillOpacity={0.25} />
            <ReferenceArea x1={0} x2={60} y1={20} y2={maxY} fill="#fee2e2" fillOpacity={0.25} />

            <ReTooltip
              content={({ payload }) => {
                const p = payload?.[0]?.payload as BubblePoint | undefined;
                if (!p) return null;
                return (
                  <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md space-y-1">
                    <div className="font-semibold text-foreground">{p.query}</div>
                    <div className="text-muted-foreground">Top Share: {p.topShare.toFixed(1)}%</div>
                    <div className="text-muted-foreground">2nd Share: {p.secondShare.toFixed(1)}%</div>
                    <div className="text-muted-foreground">Spread: {p.y.toFixed(1)}</div>
                    <div className="text-muted-foreground">Impressions: {p.impressions.toLocaleString("de-DE")}</div>
                    <div className="text-muted-foreground">URLs: {p.urls}</div>
                  </div>
                );
              }}
            />

            <Scatter data={data} onClick={(e: any) => onSelect(e?.query)}>
              {data.map((d, idx) => (
                <circle key={idx} cx={0} cy={0} r={0} />
              ))}
            </Scatter>
            <Scatter
              data={data}
              shape={(props: any) => {
                const { cx, cy, payload, size } = props;
                if (cx == null || cy == null) return null;
                const r = Math.sqrt(size || 0) * 0.5;
                return (
                  <g>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={bucketColor(payload.urls)}
                      fillOpacity={0.75}
                      stroke="rgba(0,0,0,0.08)"
                      onClick={() => onSelect(payload.query)}
                    />
                    {payload.label && (
                      <text x={cx} y={cy - r - 4} textAnchor="middle" fontSize={11} fill="#111827">
                        {payload.label}
                      </text>
                    )}
                  </g>
                );
              }}
            />

            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) => value}
              payload={[]}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface DumbbellPoint {
  query: string;
  top: number;
  second: number;
  urls: number;
  impressions: number;
  priority: number;
}

export function DumbbellChart({ data }: { data: DumbbellPoint[] }) {
  const sorted = [...data].sort((a, b) => b.priority - a.priority).slice(0, 20);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top vs 2nd Share</CardTitle>
      </CardHeader>
      <CardContent className="h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={sorted} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
            <YAxis dataKey="query" type="category" width={140} tick={{ fontSize: 11 }} interval={0} />
            <ReTooltip
              content={({ payload }) => {
                const p = payload?.[0]?.payload as DumbbellPoint | undefined;
                if (!p) return null;
                return (
                  <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md space-y-1">
                    <div className="font-semibold">{p.query}</div>
                    <div>Top Share: {p.top.toFixed(1)}%</div>
                    <div>2nd Share: {p.second.toFixed(1)}%</div>
                    <div>Gap: {(p.top - p.second).toFixed(1)}%</div>
                    <div>URLs: {p.urls}</div>
                    <div>Impressions: {p.impressions.toLocaleString("de-DE")}</div>
                  </div>
                );
              }}
            />
            <Line dataKey={(d: any) => [d.second, d.top]} stroke="#94a3b8" strokeWidth={2} dot={false} />
            <Scatter dataKey="second" fill="#ef4444" name="2nd" />
            <Scatter dataKey="top" fill="#22c55e" name="Top" />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
