"use client";

import * as React from "react";
import { TooltipProps } from "recharts";

import { cn } from "@/lib/utils";

type ChartConfig = Record<string, { label?: string; color?: string }>;

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

export function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a ChartContainer");
  }
  return context;
}

export function ChartContainer({
  config,
  className,
  children
}: {
  config: ChartConfig;
  className?: string;
  children: React.ReactNode;
}) {
  const style = React.useMemo(() => {
    const entries = Object.entries(config);
    const vars = entries.reduce<Record<string, string>>((acc, [key, value]) => {
      if (value.color) acc[`--color-${key}`] = value.color;
      return acc;
    }, {});
    return vars as React.CSSProperties;
  }, [config]);

  return (
    <ChartContext.Provider value={{ config }}>
      <div className={cn("h-full w-full", className)} style={style}>
        {children}
      </div>
    </ChartContext.Provider>
  );
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  className
}: TooltipProps<number, string> & { className?: string }) {
  const { config } = useChart();

  if (!active || !payload?.length) return null;

  return (
    <div className={cn("rounded-md border bg-card px-3 py-2 text-xs shadow-md", className)}>
      {label ? <div className="mb-2 font-semibold text-foreground">{label}</div> : null}
      <div className="space-y-1">
        {payload.map((item) => {
          const key = item.dataKey as string;
          const cfg = config[key] ?? {};
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: `var(--color-${key})` }}
              />
              <span className="text-muted-foreground">{cfg.label ?? key}</span>
              <span className="ml-auto text-foreground">
                {typeof item.value === "number" ? item.value.toFixed(2) : item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
