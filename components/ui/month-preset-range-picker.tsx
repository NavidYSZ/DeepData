"use client";

import * as React from "react";
import { format, isValid, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ChevronDown } from "lucide-react";
import { getLastNMonthsRange } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";

type MonthPresetLabels = {
  oneMonth: string;
  threeMonths: string;
  sixMonths: string;
  more: string;
  twelveMonths: string;
  sixteenMonths: string;
  custom: string;
  from: string;
  to: string;
};

const DEFAULT_LABELS: MonthPresetLabels = {
  oneMonth: "1 Monat",
  threeMonths: "3 Monate",
  sixMonths: "6 Monate",
  more: "Mehr",
  twelveMonths: "12 Monate",
  sixteenMonths: "16 Monate",
  custom: "Benutzerdefiniert",
  from: "Von",
  to: "Bis"
};

function sameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function parseDateInput(raw: string) {
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  return isValid(parsed) ? startOfDay(parsed) : null;
}

export function MonthPresetRangePicker({
  value,
  onChange,
  className,
  fullWidth = true,
  customLabels = DEFAULT_LABELS
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  fullWidth?: boolean;
  customLabels?: MonthPresetLabels;
}) {
  const hasCompleteRange = Boolean(value?.from && value?.to && isValid(value.from) && isValid(value.to));
  const fromValue = hasCompleteRange ? format(value?.from as Date, "yyyy-MM-dd") : "";
  const toValue = hasCompleteRange ? format(value?.to as Date, "yyyy-MM-dd") : "";

  const matchedPreset = React.useMemo<1 | 3 | 6 | 12 | 16 | null>(() => {
    if (!hasCompleteRange) return null;
    const selectedFrom = startOfDay(value?.from as Date);
    const selectedTo = startOfDay(value?.to as Date);
    const presets = [1, 3, 6, 12, 16] as const;
    for (const months of presets) {
      const preset = getLastNMonthsRange(months);
      if (!preset.from || !preset.to) continue;
      if (sameDay(selectedFrom, preset.from) && sameDay(selectedTo, preset.to)) {
        return months;
      }
    }
    return null;
  }, [hasCompleteRange, value]);

  const [customMode, setCustomMode] = React.useState(false);

  React.useEffect(() => {
    if (matchedPreset !== null) {
      setCustomMode(false);
    }
  }, [matchedPreset]);

  const customSelected = customMode || (hasCompleteRange && matchedPreset === null);
  const moreActive = customSelected || matchedPreset === 12 || matchedPreset === 16;

  function setPresetMonths(months: 1 | 3 | 6 | 12 | 16) {
    setCustomMode(false);
    onChange(getLastNMonthsRange(months));
  }

  function handleFromChange(raw: string) {
    const nextFrom = parseDateInput(raw);
    if (!nextFrom) return;
    const currentTo = hasCompleteRange ? startOfDay(value?.to as Date) : nextFrom;
    setCustomMode(true);
    onChange({ from: nextFrom, to: currentTo < nextFrom ? nextFrom : currentTo });
  }

  function handleToChange(raw: string) {
    const nextTo = parseDateInput(raw);
    if (!nextTo) return;
    const currentFrom = hasCompleteRange ? startOfDay(value?.from as Date) : nextTo;
    setCustomMode(true);
    onChange({ from: currentFrom > nextTo ? nextTo : currentFrom, to: nextTo });
  }

  const primaryPresets = [
    { months: 1 as const, label: customLabels.oneMonth },
    { months: 3 as const, label: customLabels.threeMonths },
    { months: 6 as const, label: customLabels.sixMonths }
  ];

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", fullWidth && "w-full", className)}>
      <div className="grid w-full grid-cols-2 divide-x divide-y divide-input overflow-hidden rounded-md border border-input bg-card sm:inline-flex sm:w-auto sm:grid-cols-none sm:divide-y-0">
        {primaryPresets.map((preset, idx) => (
          <button
            key={preset.months}
            type="button"
            onClick={() => setPresetMonths(preset.months)}
            className={cn(
              "inline-flex min-h-9 items-center justify-center px-3 py-2 text-xs font-medium transition-colors",
              idx === 2 && "col-span-1",
              matchedPreset === preset.months
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-accent"
            )}
          >
            {preset.label}
          </button>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex min-h-9 items-center justify-center gap-1 px-3 py-2 text-xs font-medium transition-colors",
                moreActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-foreground hover:bg-accent"
              )}
            >
              {customLabels.more}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))] space-y-2 p-2">
            <button
              type="button"
              onClick={() => setPresetMonths(12)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={matchedPreset === 12} onCheckedChange={() => undefined} className="pointer-events-none border-input" />
              <span>{customLabels.twelveMonths}</span>
            </button>
            <button
              type="button"
              onClick={() => setPresetMonths(16)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={matchedPreset === 16} onCheckedChange={() => undefined} className="pointer-events-none border-input" />
              <span>{customLabels.sixteenMonths}</span>
            </button>
            <button
              type="button"
              onClick={() => setCustomMode(true)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={customSelected} onCheckedChange={() => undefined} className="pointer-events-none border-input" />
              <span>{customLabels.custom}</span>
            </button>

            {customSelected && (
              <div className="space-y-2 rounded-sm border border-input/70 p-2">
                <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm">
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">{customLabels.from}</span>
                  <input
                    type="date"
                    value={fromValue}
                    onChange={(e) => handleFromChange(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </label>
                <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm">
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">{customLabels.to}</span>
                  <input
                    type="date"
                    value={toValue}
                    onChange={(e) => handleToChange(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </label>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
