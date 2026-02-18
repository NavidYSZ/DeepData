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
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";
import { formatRange, getLastNDaysRange, rangeToIso } from "@/lib/date-range";
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

  const [range, setRange] = useState<DateRange | undefined>(getLastNDaysRange(28));
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

  const { startDate, endDate } = useMemo(() => rangeToIso(range, 28), [range]);

  useEffect(() => {
    if (!site && sites?.sites?.length) {
      setSite(sites.sites[0].siteUrl);
    }
  }, [site, sites, setSite]);

  useEffect(() => {
    if (!site) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/gsc/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteUrl: site,
            startDate,
            endDate,
            dimensions: ["query", "page"],
            rowLimit: 25000
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
  }, [site, startDate, endDate]);

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

  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const totals = filtered.reduce(
      (acc, r) => {
        acc.clicks += r.clicks;
        acc.impressions += r.impressions;
        acc.ctr += r.ctr;
        acc.position += r.position;
        return acc;
      },
      { clicks: 0, impressions: 0, ctr: 0, position: 0 }
    );
    const n = filtered.length;
    return {
      keywords: filtered.length,
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: (totals.ctr / n) * 100,
      position: totals.position / n
    };
  }, [filtered]);

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
        <FilterBar className="md:grid-cols-5 md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Zeitraum</label>
            <DateRangePicker value={range} onChange={setRange} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Suche</label>
            <Input
              placeholder="Keyword suchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-transparent">.</label>
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                onClick={() => setFilterOpen((o) => !o)}
              >
                Filter
                <span className="text-xs text-muted-foreground">▼</span>
              </Button>
              {filterOpen && (
                <div className="absolute right-0 z-30 mt-2 w-72 rounded-md border border-border bg-card p-3 shadow-lg space-y-3">
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
                </div>
              )}
            </div>
          </div>
        </FilterBar>
      )}

      {error && <ErrorState>{error}</ErrorState>}

      {!notConnected && (
        <StatsRow>
          <Badge variant="secondary">Zeitraum: {formatRange(range, 28)}</Badge>
          <Badge variant="secondary">Keywords: {stats?.keywords ?? 0}</Badge>
          <Badge variant="secondary">Impressions: {(stats?.impressions ?? 0).toLocaleString("de-DE")}</Badge>
          <Badge variant="secondary">Clicks: {(stats?.clicks ?? 0).toLocaleString("de-DE")}</Badge>
          <Badge variant="secondary">Ø Position: {stats ? stats.position.toFixed(1) : "-"}</Badge>
          <Badge variant="secondary">Ø CTR: {stats ? stats.ctr.toFixed(1) : "-"}%</Badge>
          {(selectedPage || selectedKeyword) && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Filter: {selectedKeyword ?? selectedPage}</Badge>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full border border-black/60 px-3"
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

      {!notConnected && (
        loading ? (
          <Skeleton className="h-[500px] w-full" />
        ) : (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-8">
              <DataExplorerTable
                rows={filtered}
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
            </div>
            <div className="col-span-12 lg:col-span-4 space-y-4">
              <SectionCard title="Auswahl" description="Aktiver Drilldown">
                {selectedKeyword || selectedPage ? (
                  <div className="space-y-2 text-sm">
                    <div className="font-semibold">{selectedKeyword ?? selectedPage}</div>
                    <div className="text-muted-foreground">Klicke eine Zeile, um zu wechseln.</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedKeyword(null);
                        setSelectedPage(null);
                      }}
                    >
                      Auswahl zurücksetzen
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Keine Auswahl aktiv.</div>
                )}
              </SectionCard>
            </div>
          </div>
        )
      )}
    </div>
  );
}
