export type DateRange = {
  start: string;
  end: string;
};

export type DateRanges = {
  current: DateRange;
  previous: DateRange;
};

export type SiteEntry = { siteUrl: string; permissionLevel?: string };

function toUtcDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, delta: number) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function resolveDateRanges(now = new Date()): DateRanges {
  const todayUtc = toUtcDate(now);
  const end = addDays(todayUtc, -1);
  const start = addDays(end, -27);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -27);
  return {
    current: { start: formatDate(start), end: formatDate(end) },
    previous: { start: formatDate(prevStart), end: formatDate(prevEnd) }
  };
}

export function resolveSite(sites: SiteEntry[], siteHint?: string | null) {
  if (siteHint) {
    const match = sites.find((s) => s.siteUrl === siteHint);
    if (match) return match.siteUrl;
  }
  return sites[0]?.siteUrl ?? null;
}
