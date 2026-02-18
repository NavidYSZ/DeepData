import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

export interface ChartPoint {
  date: string;
  clicks: number;
  impressions: number;
}

export function TrafficChart({ data }: { data: ChartPoint[] }) {
  const config = {
    clicks: { label: "Clicks", color: "hsl(var(--chart-1))" },
    impressions: { label: "Impressions", color: "hsl(var(--chart-2))" }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance über Zeit</CardTitle>
      </CardHeader>
      <CardContent className="h-[320px]">
        <ChartContainer config={config} className="h-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="clicks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="impressions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<ChartTooltipContent />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="clicks"
                stroke="hsl(var(--chart-1))"
                fill="url(#clicks)"
                strokeWidth={2}
                name="Clicks"
              />
              <Area
                type="monotone"
                dataKey="impressions"
                stroke="hsl(var(--chart-2))"
                fill="url(#impressions)"
                strokeWidth={2}
                name="Impressions"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
