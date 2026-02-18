"use client";

import * as React from "react";
import { addDays, format, isValid, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 28 days", days: 28 },
  { label: "Last 90 days", days: 90 }
];

export function DateRangePicker({
  value,
  onChange,
  className
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
}) {
  const label = value?.from
    ? value.to
      ? `${format(value.from, "PPP")} – ${format(value.to, "PPP")}`
      : format(value.from, "PPP")
    : "Date range";

  function setPreset(days: number) {
    const to = startOfDay(new Date());
    const from = startOfDay(addDays(to, -days + 1));
    onChange({ from, to });
  }

  const isValidRange =
    value?.from && value?.to && isValid(value.from) && isValid(value.to);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("justify-start text-left font-normal", !isValidRange && "text-muted-foreground")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col gap-3 p-3">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
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
              numberOfMonths={2}
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
