// Helpers for treating GSC rows as statistical samples instead of trusting
// each pre-aggregated row at face value. The rest of the dashboard imports
// from here so behaviour stays consistent across views.

export interface WeightableRow {
  position: number;
  impressions: number;
}

// Impression-weighted average position. Returns null when there's no weight
// at all so callers can render "—" instead of inventing a 0.
export function weightedPosition(rows: WeightableRow[]): number | null {
  let weight = 0;
  let sum = 0;
  for (const r of rows) {
    if (!r.impressions) continue;
    sum += r.position * r.impressions;
    weight += r.impressions;
  }
  return weight > 0 ? sum / weight : null;
}

// How many impressions we want before trusting a position figure. Scales
// with the window length: a single day needs less evidence than a quarter
// because the position itself spans more search behaviour.
export function defaultImpressionThreshold(daySpan: number): number {
  if (daySpan <= 1) return 10;
  if (daySpan <= 7) return 30;
  if (daySpan <= 28) return 100;
  if (daySpan <= 90) return 300;
  return 500;
}

// Inclusive day count between two ISO dates (YYYY-MM-DD).
export function daySpan(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

// True when a row carries enough evidence to treat its position as a real
// signal. Used to decide whether to *show* a confidence warning, not to
// hide the row.
export function hasEnoughEvidence(impressions: number, threshold: number): boolean {
  return impressions >= threshold;
}
