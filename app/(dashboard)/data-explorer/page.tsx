"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSite } from "@/components/dashboard/site-context";
import { DataExplorerTable } from "@/components/dashboard/data-explorer-table";
import { type QueryRow } from "@/components/dashboard/queries-table";
import { FilterBar, PageHeader, SectionCard, StatsRow } from "@/components/dashboard/page-shell";
import { ErrorState } from "@/components/dashboard/states";
import { MonthPresetRangePicker } from "@/components/ui/month-preset-range-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";
import { formatRange, getLastNMonthsRange, rangeToIso } from "@/lib/date-range";
import { daySpan, defaultImpressionThreshold } from "@/lib/gsc/aggregate";
import { useGscAutoSync } from "@/hooks/use-gsc-sync";
import { toast } from "sonner";

interface SitesResponse {
  sites: { siteUrl: string; permissionLevel: string }[];
}

interface QueryResponse {
  rows: QueryRow[];
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error: any = new Error("Fetch error");
    error.status = res.status;
    throw error;
  }
  return res.json();
};

export default function DataExplorerPage() {
  const { site, setSite } = useSite();
  const { data: sites, error: sitesError } = useSWR<SitesResponse>("/api/gsc/sites", fetcher);

  const [range, setRange] = useState<DateRange | undefined>(getLastNMonthsRange(3));
  const [rows, setRows] = useState<QueryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [contains, setContains] = useState("");
  const [notContains, setNotContains] = useState("");
  const [minWords, setMinWords] = useState<number | "">("");
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const toasted = useRef(false);
  const syncState = useGscAutoSync(site);
  const dbReady =
    syncState.status === "fresh" ||
    syncState.status === "synced" ||
    (syncState.status === "syncing" && syncState.backgroundOnly);

  const { startDate, endDate } = useMemo(() => rangeToIso(range, 90), [range]);

  useEffect(() => {
    if (!site && sites?.sites?.length) {
      setSite(sites.sites[0].siteUrl);
    }
  }, [site, sites, setSite]);

  useEffect(() => {
    if (!site || !dbReady) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/gsc/daily", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteUrl: site,
            startDate,
            endDate,
            groupBy: "query_page",
            limit: 25000
          }),
          signal: controller.signal
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed: ${res.status}`);
        }
        const data: QueryResponse = await res.json();
        setRows(data.rows || []);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error(err);
        setError(err.message ?? "Fehler beim Laden");
        setRows([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [site, dbReady, startDate, endDate]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const q = r.keys[0] ?? "";
      const lower = q.toLowerCase();
      const passesSearch = search.trim()
        ? lower.includes(search.trim().toLowerCase())
        : true;
      const passesContains = contains.trim()
        ? lower.includes(contains.trim().toLowerCase())
        : true;
      const passesNotContains = notContains.trim()
        ? !lower.includes(notContains.trim().toLowerCase())
        : true;
      const wordCount = q.trim() ? q.trim().split(/\s+/).length : 0;
      const passesMinWords = minWords === "" ? true : wordCount >= Number(minWords);
      const page = r.keys[1] ?? "";
      const passesPage = selectedPage ? page === selectedPage : true;
      const passesKeyword = selectedKeyword ? q === selectedKeyword : true;
      return passesSearch && passesContains && passesNotContains && passesMinWords && passesPage && passesKeyword;
    });
  }, [rows, search, contains, notContains, minWords, selectedPage, selectedKeyword]);

  const periodSpan = useMemo(() => daySpan(startDate, endDate), [startDate, endDate]);
  const lowConfidenceThreshold = useMemo(
    () => defaultImpressionThreshold(periodSpan),
    [periodSpan]
  );

  const stats = useMemo(() => {
    if (!filtered.length) return null;
    let clicks = 0;
    let impressions = 0;
    let posWeightedSum = 0;
    let lowConfidenceCount = 0;
    for (const r of filtered) {
      clicks += r.clicks;
      impressions += r.impressions;
      posWeightedSum += r.position * r.impressions;
      if (r.impressions < lowConfidenceThreshold) lowConfidenceCount++;
    }
    return {
      keywords: filtered.length,
      lowConfidenceCount,
      clicks,
      impressions,
      // Real CTR: total clicks / total impressions, not the mean of CTRs.
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      // Impression-weighted average position: ranks with more searches behind
      // them count proportionally more. A 1-impression Pos 1 no longer
      // dominates a 10k-impression Pos 12.
      position: impressions > 0 ? posWeightedSum / impressions : 0
    };
  }, [filtered, lowConfidenceThreshold]);

  const notConnected = sitesError?.status === 401;

  useEffect(() => {
    if (notConnected && !toasted.current) {
      toasted.current = true;
      toast.error("GSC nicht verbunden", { description: "Bitte OAuth erneut verbinden." });
    }
  }, [notConnected]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Explorer"
        description="Filtere Keywords und analysiere Query/Page-Kombinationen."
      />

      {notConnected && (
        <SectionCard>
          <div className="flex flex-col gap-4 py-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Verbinde Google Search Console</h2>
              <p className="text-sm text-muted-foreground">
                Klicke auf verbinden, um den OAuth-Flow zu starten.
              </p>
            </div>
            <Button onClick={() => (window.location.href = "/api/auth/google")}>
              Mit Google verbinden
            </Button>
          </div>
        </SectionCard>
      )}

      {!notConnected && (
        <FilterBar className="md:grid-cols-2 lg:grid-cols-12 lg:items-end">
          <div className="space-y-2 md:col-span-2 lg:col-span-5">
            <label className="text-sm font-medium">Zeitraum</label>
            <MonthPresetRangePicker value={range} onChange={setRange} />
          </div>
          <div className="space-y-2 md:col-span-2 lg:col-span-5">
            <label className="text-sm font-medium">Suche</label>
            <Input
              placeholder="Keyword suchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <label className="text-sm font-medium text-transparent">.</label>
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between">
                  Filter
                  <span className="text-xs text-muted-foreground">▼</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(18rem,calc(100vw-2rem))] space-y-3 p-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Keyword enthält</label>
                  <Input
                    placeholder="z.B. kaufen"
                    value={contains}
                    onChange={(e) => setContains(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Keyword enthält nicht</label>
                  <Input
                    placeholder="z.B. gratis"
                    value={notContains}
                    onChange={(e) => setNotContains(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Min. Wortanzahl</label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="z.B. 4"
                    value={minWords === "" ? "" : minWords}
                    onChange={(e) => setMinWords(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
                <div className="flex justify-end gap-2 text-xs">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setContains("");
                      setNotContains("");
                      setMinWords("");
                    }}
                  >
                    Zurücksetzen
                  </Button>
                  <Button type="button" size="sm" onClick={() => setFilterOpen(false)}>
                    Schließen
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </FilterBar>
      )}

      {error && <ErrorState>{error}</ErrorState>}

      {!notConnected && (
        <StatsRow>
          <Badge variant="secondary">Zeitraum: {formatRange(range, 90)}</Badge>
          <Badge variant="secondary">Keywords: {stats?.keywords ?? 0}</Badge>
          <Badge variant="secondary">Impressions: {(stats?.impressions ?? 0).toLocaleString("de-DE")}</Badge>
          <Badge variant="secondary">Clicks: {(stats?.clicks ?? 0).toLocaleString("de-DE")}</Badge>
          <Badge
            variant="secondary"
            title="Impression-gewichteter Durchschnitt: ein Keyword mit 10.000 Impressionen zählt 100× mehr als eines mit 100."
          >
            Ø Position: {stats ? stats.position.toFixed(1) : "-"}
          </Badge>
          <Badge variant="secondary">Ø CTR: {stats ? stats.ctr.toFixed(1) : "-"}%</Badge>
          {syncState.status === "syncing" && !syncState.backgroundOnly && (
            <Badge variant="secondary">Sync: initialer Backfill…</Badge>
          )}
          {syncState.status === "syncing" && syncState.backgroundOnly && (
            <Badge variant="secondary">Sync: Hintergrund-Update</Badge>
          )}
          {stats && stats.lowConfidenceCount > 0 && (
            <Badge
              variant="secondary"
              title={`Keywords mit < ${lowConfidenceThreshold} Impressions in diesem Zeitraum — Position ist statistisch unzuverlässig.`}
            >
              ⚠ Low confidence: {stats.lowConfidenceCount}
            </Badge>
          )}
          {(selectedPage || selectedKeyword) && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Filter: {selectedKeyword ?? selectedPage}</Badge>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full border border-border px-3"
                onClick={() => {
                  setSelectedPage(null);
                  setSelectedKeyword(null);
                }}
              >
                Zurück
              </Button>
            </div>
          )}
        </StatsRow>
      )}

      {!notConnected && syncState.status === "syncing" && !syncState.backgroundOnly ? (
        <SectionCard>
          <p className="text-sm text-muted-foreground">
            Initialer GSC-Backfill läuft (bis zu 12 Monate Tagesdaten). Das passiert nur beim ersten Öffnen.
          </p>
        </SectionCard>
      ) : !notConnected && (
        loading ? (
          <Skeleton className="h-[500px] w-full" />
        ) : (
          <DataExplorerTable
            rows={filtered}
            lowConfidenceThreshold={lowConfidenceThreshold}
            onSelectPage={(page) => {
              setSelectedPage(page);
              setSelectedKeyword(null);
            }}
            onSelectKeyword={(keyword) => {
              setSelectedKeyword(keyword);
              setSelectedPage(null);
            }}
            selectedPage={selectedPage}
            selectedKeyword={selectedKeyword}
          />
        )
      )}
    </div>
  );
}
