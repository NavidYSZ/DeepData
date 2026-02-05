import { type ComponentType } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, TrendingUp, MousePointerClick, Search } from "lucide-react";

type MetricKey = "clicks" | "impressions" | "ctr" | "position";

export interface KpiData {
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number;
}

const iconMap: Record<MetricKey, ComponentType<{ className?: string }>> = {
  clicks: MousePointerClick,
  impressions: Search,
  ctr: TrendingUp,
  position: TrendingDown
};

const labelMap: Record<MetricKey, string> = {
  clicks: "Clicks",
  impressions: "Impressions",
  ctr: "CTR",
  position: "Position"
};

function formatValue(key: MetricKey, value: number) {
  if (Number.isNaN(value)) return "–";
  if (key === "ctr") return `${(value * 100).toFixed(1)}%`;
  if (key === "position") return value.toFixed(1);
  return Math.round(value).toLocaleString("de-DE");
}

export function KpiCards({ data }: { data: KpiData | null }) {
  const items: MetricKey[] = ["clicks", "impressions", "ctr", "position"];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((key) => {
        const Icon = iconMap[key];
        return (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{labelMap[key]}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {data ? formatValue(key, data[key]) : "–"}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
