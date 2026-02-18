"use client";

import * as React from "react";
import { addDays, differenceInCalendarDays, format, isValid, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
const DEFAULT_PRESET_LABELS = {
  days7: "7 Tage",
  days30: "1 Monat",
  days90: "3 Monate"
};

type PresetLabels = {
  days7: string;
  days30: string;
  days90: string;
};

export function DateRangePicker({
  value,
  onChange,
  className,
  fullWidth = true,
  presetLabels = DEFAULT_PRESET_LABELS
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  fullWidth?: boolean;
  presetLabels?: PresetLabels;
}) {
  const presets = [
    { label: presetLabels.days7, days: 7 },
    { label: presetLabels.days30, days: 30 },
    { label: presetLabels.days90, days: 90 }
  ];
  const fromValue = value?.from && isValid(value.from) ? format(value.from, "yyyy-MM-dd") : "";
  const toValue = value?.to && isValid(value.to) ? format(value.to, "yyyy-MM-dd") : "";

  function setPreset(days: number) {
    const to = startOfDay(new Date());
    const from = startOfDay(addDays(to, -days + 1));
    onChange({ from, to });
  }

  function parseDateInput(raw: string) {
    if (!raw) return null;
    const parsed = new Date(`${raw}T00:00:00`);
    return isValid(parsed) ? startOfDay(parsed) : null;
  }

  function handleFromChange(raw: string) {
    const nextFrom = parseDateInput(raw);
    if (!nextFrom) {
      onChange(undefined);
      return;
    }
    const currentTo = value?.to && isValid(value.to) ? startOfDay(value.to) : nextFrom;
    onChange({ from: nextFrom, to: currentTo < nextFrom ? nextFrom : currentTo });
  }

  function handleToChange(raw: string) {
    const nextTo = parseDateInput(raw);
    if (!nextTo) {
      onChange(undefined);
      return;
    }
    const currentFrom = value?.from && isValid(value.from) ? startOfDay(value.from) : nextTo;
    onChange({ from: currentFrom > nextTo ? nextTo : currentFrom, to: nextTo });
  }

  function isPresetActive(days: number) {
    if (!value?.from || !value?.to || !isValid(value.from) || !isValid(value.to)) return false;
    const diff = differenceInCalendarDays(startOfDay(value.to), startOfDay(value.from)) + 1;
    return diff === days;
  }

  return (
    <div className={cn("flex flex-col gap-2 md:flex-row md:items-center", fullWidth && "w-full", className)}>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:flex-1">
        <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Von</span>
          <input
            type="date"
            value={fromValue}
            onChange={(e) => handleFromChange(e.target.value)}
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
        <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Bis</span>
          <input
            type="date"
            value={toValue}
            onChange={(e) => handleToChange(e.target.value)}
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
      </div>
      <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-md border border-input bg-card">
        {presets.map((preset, idx) => {
          const active = isPresetActive(preset.days);
          return (
            <button
              key={preset.days}
              type="button"
              onClick={() => setPreset(preset.days)}
              className={cn(
                "px-3 text-xs font-medium transition-colors",
                idx > 0 && "border-l border-input",
                active ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-accent"
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
