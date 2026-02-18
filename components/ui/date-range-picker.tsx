"use client";

import * as React from "react";
import { addDays, format, isValid, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/use-media-query";

const DEFAULT_PRESET_LABELS = {
  days7: "Letzte 7 Tage",
  days28: "Letzte 28 Tage",
  days90: "Letzte 90 Tage"
};

type PresetLabels = {
  days7: string;
  days28: string;
  days90: string;
};

export function DateRangePicker({
  value,
  onChange,
  className,
  fullWidth = true,
  monthsDesktop = 2,
  monthsMobile = 1,
  presetLabels = DEFAULT_PRESET_LABELS
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  fullWidth?: boolean;
  monthsDesktop?: number;
  monthsMobile?: number;
  presetLabels?: PresetLabels;
}) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const presets = [
    { label: presetLabels.days7, days: 7 },
    { label: presetLabels.days28, days: 28 },
    { label: presetLabels.days90, days: 90 }
  ];
  const label = value?.from
    ? value.to
      ? `${format(value.from, "dd.MM.yyyy")} – ${format(value.to, "dd.MM.yyyy")}`
      : format(value.from, "dd.MM.yyyy")
    : "Zeitraum wählen";

  function setPreset(days: number) {
    const to = startOfDay(new Date());
    const from = startOfDay(addDays(to, -days + 1));
    onChange({ from, to });
  }

  const isValidRange =
    value?.from && value?.to && isValid(value.from) && isValid(value.to);

  return (
    <div className={cn("flex items-center gap-2", fullWidth && "w-full", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal",
              fullWidth && "w-full justify-between",
              !isValidRange && "text-muted-foreground"
            )}
          >
            <span className="flex min-w-0 items-center">
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto min-w-[280px] max-w-[calc(100vw-2rem)] p-0" align="start">
          <div className="flex flex-col gap-3 p-3">
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.days}
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setPreset(preset.days)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <Calendar
              initialFocus
              mode="range"
              numberOfMonths={isMobile ? monthsMobile : monthsDesktop}
              selected={value}
              onSelect={onChange}
              defaultMonth={value?.from}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
