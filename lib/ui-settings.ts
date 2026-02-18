export const CHART_LINE_WIDTH_KEY = "settings:chartLineWidth";
export const CHART_LINE_WIDTH_EVENT = "settings:chart-line-width";
export const DEFAULT_CHART_LINE_WIDTH = 1.2;

const MIN_CHART_LINE_WIDTH = 0.5;
const MAX_CHART_LINE_WIDTH = 8;

export function clampChartLineWidth(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_CHART_LINE_WIDTH;
  return Math.min(MAX_CHART_LINE_WIDTH, Math.max(MIN_CHART_LINE_WIDTH, value));
}

export function readChartLineWidth() {
  if (typeof window === "undefined") return DEFAULT_CHART_LINE_WIDTH;
  const raw = window.localStorage.getItem(CHART_LINE_WIDTH_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_CHART_LINE_WIDTH;
  return clampChartLineWidth(parsed);
}

export function writeChartLineWidth(value: number) {
  const next = clampChartLineWidth(value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CHART_LINE_WIDTH_KEY, String(next));
    window.dispatchEvent(new Event(CHART_LINE_WIDTH_EVENT));
  }
  return next;
}
