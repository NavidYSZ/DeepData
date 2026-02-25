"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RankCharts,
  type SeriesPoint,
  type TrendPoint,
  type ChartPoint
} from "@/components/dashboard/rank-charts";
import { useSite } from "@/components/dashboard/site-context";
import { FilterBar, PageHeader, SectionCard, StatsRow } from "@/components/dashboard/page-shell";
import { ErrorState } from "@/components/dashboard/states";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FullscreenOverlay } from "@/components/ui/fullscreen-overlay";
import type { DateRange } from "react-day-picker";
import { formatRange, getLastNDaysRange, rangeToIso } from "@/lib/date-range";
import type { QueryRow } from "@/components/dashboard/queries-table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Mode = "query" | "page";

interface MoverRow {
  label: string;
  query: string;
  page: string;
  avgPos1: number;
  avgPos2: number;
  delta: number;
  impressions: number;
}

/* ------------------------------------------------------------------ */
/*  Paginated fetch (same pattern as Kannibalisierung)                 */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 25000;
const MAX_ROWS = 125000;

async function fetchAllRows(body: any, signal?: AbortSignal) {
  let startRow = 0;
  const rows: QueryRow[] = [];
  while (startRow < MAX_ROWS) {
    const res = await fetch("/api/gsc/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, startRow, pageSize: PAGE_SIZE }),
      signal
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed ${res.status}`);
    }
    const json = await res.json();
    const batch: QueryRow[] = json.rows || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    startRow += PAGE_SIZE;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function splitRange(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalMs = end.getTime() - start.getTime();
  const halfMs = Math.floor(totalMs / 2);
  const mid = new Date(start.getTime() + halfMs);
  const midNext = new Date(mid.getTime() + 24 * 60 * 60 * 1000);
  return {
    p1Start: startDate,
    p1End: toIsoDate(mid),
    p2Start: toIsoDate(midNext),
    p2End: endDate
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toSlug(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, "");
  }
}

/* ------------------------------------------------------------------ */
/*  Resizable column header                                            */
/* ------------------------------------------------------------------ */

function ResizableTh({
  width,
  onResize,
  children,
  className
}: {
  width: number;
  onResize: (w: number) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startX.current = e.clientX;
      startW.current = width;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX.current;
        onResize(Math.max(40, startW.current + delta));
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, onResize]
  );

  return (
    <th style={{ width }} className={cn("relative", className)}>
      {children}
      <span
        onMouseDown={onMouseDown}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-border"
      />
    </th>
  );
}

/* ------------------------------------------------------------------ */
/*  MoverList sub-component                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_WIDTHS = [300, 280, 100, 100, 120];

function MoverList({
  items,
  color,
  onClick,
  mode
}: {
  items: MoverRow[];
  color: "green" | "red";
  onClick: (item: MoverRow) => void;
  mode: Mode;
}) {
  const [colWidths, setColWidths] = useState(DEFAULT_WIDTHS);

  const resize = useCallback((idx: number, w: number) => {
    setColWidths((prev) => {
      const next = [...prev];
      next[idx] = w;
      return next;
    });
  }, []);

  if (!items.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Keine Daten
      </p>
    );
  }

  return (
    <div className="max-h-[520px] overflow-x-auto overflow-y-auto">
      <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <tr>
            <ResizableTh
              width={colWidths[0]}
              onResize={(w) => resize(0, w)}
              className="px-2 py-1.5 text-left font-medium"
            >
              {mode === "query" ? "Query" : "Page"}
            </ResizableTh>
            <ResizableTh
              width={colWidths[1]}
              onResize={(w) => resize(1, w)}
              className="px-2 py-1.5 text-left font-medium text-muted-foreground"
            >
              {mode === "query" ? "Page" : "Query"}
            </ResizableTh>
            <ResizableTh
              width={colWidths[2]}
              onResize={(w) => resize(2, w)}
              className="px-1.5 py-1.5 text-right font-medium"
            >
              Pos P1
            </ResizableTh>
            <ResizableTh
              width={colWidths[3]}
              onResize={(w) => resize(3, w)}
              className="px-1.5 py-1.5 text-right font-medium"
            >
              Pos P2
            </ResizableTh>
            <ResizableTh
              width={colWidths[4]}
              onResize={(w) => resize(4, w)}
              className="px-1.5 py-1.5 text-right font-medium"
            >
              Delta
            </ResizableTh>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={idx}
              className="cursor-pointer border-t border-border/40 transition-colors hover:bg-muted/40"
              onClick={() => onClick(item)}
            >
              <td className="truncate px-2 py-1.5" title={item.label}>
                {item.label}
              </td>
              <td
                className="truncate px-2 py-1.5 text-muted-foreground"
                title={mode === "query" ? item.page : item.query}
              >
                {mode === "query" ? toSlug(item.page) : item.query}
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums">
                {item.avgPos1.toFixed(1)}
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums">
                {item.avgPos2.toFixed(1)}
              </td>
              <td
                className={cn(
                  "px-1.5 py-1.5 text-right font-medium tabular-nums",
                  color === "green" ? "text-green-600" : "text-red-600"
                )}
              >
                {-item.delta > 0 ? "+" : ""}
                {(-item.delta).toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function TopMoverPage() {
  const { site } = useSite();
  const [mode, setMode] = useState<Mode>("query");
  const [range, setRange] = useState<DateRange | undefined>(
    getLastNDaysRange(28)
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows1Data, setRows1Data] = useState<QueryRow[]>([]);
  const [rows2Data, setRows2Data] = useState<QueryRow[]>([]);

  // Modal state
  const [selectedMover, setSelectedMover] = useState<MoverRow | null>(null);
  const [modalRange, setModalRange] = useState<DateRange | undefined>(range);
  const [modalSeries, setModalSeries] = useState<SeriesPoint[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [showTrend, setShowTrend] = useState(false);

  const { startDate: modalStartDate, endDate: modalEndDate } = useMemo(
    () => rangeToIso(modalRange, 28),
    [modalRange]
  );

  const toasted = useRef(false);

  const { startDate, endDate } = useMemo(() => rangeToIso(range, 28), [range]);

  const periods = useMemo(
    () => splitRange(startDate, endDate),
    [startDate, endDate]
  );

  /* ---------- main data fetch ---------- */

  useEffect(() => {
    if (!site) return;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [r1, r2] = await Promise.all([
          fetchAllRows(
            {
              siteUrl: site,
              startDate: periods.p1Start,
              endDate: periods.p1End,
              dimensions: ["query", "page"],
              rowLimit: PAGE_SIZE
            },
            controller.signal
          ),
          fetchAllRows(
            {
              siteUrl: site,
              startDate: periods.p2Start,
              endDate: periods.p2End,
              dimensions: ["query", "page"],
              rowLimit: PAGE_SIZE
            },
            controller.signal
          )
        ]);
        setRows1Data(r1);
        setRows2Data(r2);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error(err);
        setError(err.message ?? "Fehler beim Laden");
        setRows1Data([]);
        setRows2Data([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [site, periods.p1Start, periods.p1End, periods.p2Start, periods.p2End]);

  /* ---------- mover calculation ---------- */

  const { winners, losers } = useMemo(() => {
    const makeKey = (q: string, p: string) => `${q}\0${p}`;

    const map1 = new Map<string, { position: number; impressions: number }>();
    rows1Data.forEach((r) => {
      map1.set(makeKey(r.keys[0], r.keys[1]), {
        position: r.position,
        impressions: r.impressions
      });
    });

    const map2 = new Map<string, { position: number; impressions: number }>();
    rows2Data.forEach((r) => {
      map2.set(makeKey(r.keys[0], r.keys[1]), {
        position: r.position,
        impressions: r.impressions
      });
    });

    // Only combos that exist in both periods
    const combos: MoverRow[] = [];
    for (const key of map1.keys()) {
      const p1 = map1.get(key)!;
      const p2 = map2.get(key);
      if (!p2) continue;

      const [query, page] = key.split("\0");
      const delta = p2.position - p1.position;
      combos.push({
        label: "",
        query,
        page,
        avgPos1: p1.position,
        avgPos2: p2.position,
        delta,
        impressions: p1.impressions + p2.impressions
      });
    }

    // Group by mode dimension, picking the most extreme combo per group
    const groupKey = (c: MoverRow) =>
      mode === "query" ? c.query : c.page;

    const winnerMap = new Map<string, MoverRow>();
    const loserMap = new Map<string, MoverRow>();

    combos.forEach((c) => {
      const gk = groupKey(c);
      const labeled: MoverRow = { ...c, label: gk };

      if (c.delta < 0) {
        const existing = winnerMap.get(gk);
        if (!existing || c.delta < existing.delta) {
          winnerMap.set(gk, labeled);
        }
      }
      if (c.delta > 0) {
        const existing = loserMap.get(gk);
        if (!existing || c.delta > existing.delta) {
          loserMap.set(gk, labeled);
        }
      }
    });

    return {
      winners: [...winnerMap.values()]
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 50),
      losers: [...loserMap.values()]
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 50)
    };
  }, [rows1Data, rows2Data, mode]);

  /* ---------- modal detail fetch ---------- */

  async function fetchModalData(mover: MoverRow, sd: string, ed: string) {
    setModalLoading(true);
    try {
      const res = await fetch("/api/gsc/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: site,
          startDate: sd,
          endDate: ed,
          dimensions: ["date", "query", "page"],
          filters: [
            {
              dimension: "query",
              operator: "equals",
              expression: mover.query
            }
          ],
          rowLimit: 5000
        })
      });
      if (!res.ok) throw new Error("Fetch error");
      const data = await res.json();
      const points: SeriesPoint[] = (data.rows || [])
        .filter((r: QueryRow) => r.keys[2] === mover.page)
        .map((r: QueryRow) => ({
          date: r.keys[0],
          dateNum: new Date(r.keys[0]).getTime(),
          query: mover.query,
          position: r.position
        }));
      setModalSeries(points);
    } catch {
      setModalSeries([]);
    } finally {
      setModalLoading(false);
    }
  }

  function loadMoverDetail(mover: MoverRow) {
    setSelectedMover(mover);
    setModalRange(range);
    setShowTrend(false);
    fetchModalData(mover, startDate, endDate);
  }

  // Refetch when modal date range changes
  useEffect(() => {
    if (selectedMover) {
      fetchModalData(selectedMover, modalStartDate, modalEndDate);
    }
  }, [modalStartDate, modalEndDate]);

  /* ---------- modal chart data ---------- */

  const modalChartData: ChartPoint[] = useMemo(() => {
    if (!modalSeries.length || !selectedMover) return [];
    const query = selectedMover.query;
    const sorted = [...modalSeries].sort((a, b) => a.dateNum - b.dateNum);
    return sorted.map((p) => ({
      date: p.date,
      dateNum: p.dateNum,
      [query]: p.position
    }));
  }, [modalSeries, selectedMover]);

  const modalTrendData: TrendPoint[] = useMemo(
    () =>
      [...modalSeries]
        .sort((a, b) => a.dateNum - b.dateNum)
        .map((p) => ({
          dateNum: p.dateNum,
          date: p.date,
          position: p.position
        })),
    [modalSeries]
  );

  /* ---------- error handling ---------- */

  const notConnected = error && error.toLowerCase().includes("401");

  useEffect(() => {
    if (notConnected && !toasted.current) {
      toasted.current = true;
      toast.error("GSC nicht verbunden", {
        description: "Bitte OAuth erneut verbinden."
      });
    }
  }, [notConnected]);

  /* ---------- render ---------- */

  return (
    <div className="space-y-6">
      <PageHeader
        title="Top Mover"
        description="Identifiziere Keywords & Seiten mit den größten Positionsveränderungen."
      />

      {notConnected && (
        <SectionCard>
          <div className="flex flex-col gap-4 py-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                Verbinde Google Search Console
              </h2>
              <p className="text-sm text-muted-foreground">
                Klicke auf verbinden, um den OAuth-Flow zu starten.
              </p>
            </div>
            <Button
              onClick={() => (window.location.href = "/api/auth/google")}
            >
              Mit Google verbinden
            </Button>
          </div>
        </SectionCard>
      )}

      <FilterBar className="md:grid-cols-2 md:items-end">
        <div className="space-y-2">
          <label className="text-sm font-medium">Mode</label>
          <div className="flex gap-1">
            {(["query", "page"] as const).map((m) => (
              <Button
                key={m}
                variant={mode === m ? "secondary" : "outline"}
                size="sm"
                onClick={() => setMode(m)}
              >
                {m === "query" ? "Query" : "Page"}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Zeitraum</label>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </FilterBar>

      <StatsRow>
        <Badge variant="secondary">
          Zeitraum: {formatRange(range, 28)}
        </Badge>
        <Badge variant="secondary">
          P1: {periods.p1Start} – {periods.p1End}
        </Badge>
        <Badge variant="secondary">
          P2: {periods.p2Start} – {periods.p2End}
        </Badge>
        <Badge variant="secondary">Winner: {winners.length}</Badge>
        <Badge variant="secondary">Loser: {losers.length}</Badge>
      </StatsRow>

      {error && !notConnected && <ErrorState>{error}</ErrorState>}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-[520px] w-full" />
          <Skeleton className="h-[520px] w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-green-600">Top Winner</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <MoverList
                items={winners}
                color="green"
                onClick={loadMoverDetail}
                mode={mode}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-red-600">Top Loser</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <MoverList
                items={losers}
                color="red"
                onClick={loadMoverDetail}
                mode={mode}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {selectedMover && (
        <FullscreenOverlay
          title={`${selectedMover.query} — ${selectedMover.page}`}
          onClose={() => setSelectedMover(null)}
        >
          {modalLoading ? (
            <Skeleton className="h-[60vh] w-full" />
          ) : (
            <div className="space-y-4 p-2">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Zeitraum</label>
                  <DateRangePicker value={modalRange} onChange={setModalRange} />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>
                  Query: <strong className="text-foreground">{selectedMover.query}</strong>
                </span>
                <span>
                  Page:{" "}
                  <strong className="break-all text-foreground">
                    {selectedMover.page}
                  </strong>
                </span>
                <span>
                  Pos P1:{" "}
                  <strong className="text-foreground">
                    {selectedMover.avgPos1.toFixed(1)}
                  </strong>
                </span>
                <span>
                  Pos P2:{" "}
                  <strong className="text-foreground">
                    {selectedMover.avgPos2.toFixed(1)}
                  </strong>
                </span>
                <span>
                  Delta:{" "}
                  <strong
                    className={
                      selectedMover.delta < 0
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    {-selectedMover.delta > 0 ? "+" : ""}
                    {(-selectedMover.delta).toFixed(1)}
                  </strong>
                </span>
              </div>
              <div className="h-[55vh] min-h-[400px]">
                <RankCharts
                  chartData={modalChartData}
                  queries={[selectedMover.query]}
                  trend={modalTrendData}
                  showTrend={showTrend}
                  onToggleTrend={() => setShowTrend((s) => !s)}
                  mode="single"
                  axisMode="dynamic"
                />
              </div>
            </div>
          )}
        </FullscreenOverlay>
      )}
    </div>
  );
}
