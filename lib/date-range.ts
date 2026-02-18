import { addDays, format, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";

export function getLastNDaysRange(days: number): DateRange {
  const to = startOfDay(new Date());
  const from = startOfDay(addDays(to, -days + 1));
  return { from, to };
}

export function toIsoDate(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export function rangeToIso(range: DateRange | undefined, fallbackDays = 28) {
  const safe = range?.from && range?.to ? range : getLastNDaysRange(fallbackDays);
  return {
    startDate: toIsoDate(safe.from as Date),
    endDate: toIsoDate(safe.to as Date)
  };
}

export function formatRange(range: DateRange | undefined, fallbackDays = 28) {
  const safe = range?.from && range?.to ? range : getLastNDaysRange(fallbackDays);
  return `${toIsoDate(safe.from as Date)} – ${toIsoDate(safe.to as Date)}`;
}
