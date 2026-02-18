"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { useSite } from "@/components/dashboard/site-context";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCards, type KpiData } from "@/components/dashboard/kpi-cards";
import { type ResultRow } from "@/components/dashboard/results-table";
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
  rows: ResultRow[];
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

export default function DashboardPage() {
  const { data: sites, error: sitesError } = useSWR<SitesResponse>("/api/gsc/sites", fetcher);
  const { site, setSite } = useSite();
  const [range, setRange] = useState<DateRange | undefined>(getLastNDaysRange(28));
  const [tableRows, setTableRows] = useState<ResultRow[]>([]);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const toasted = useRef(false);

  useEffect(() => {
    if (!site && sites?.sites?.length) {
      setSite(sites.sites[0].siteUrl);
    }
  }, [sites, site, setSite]);

  const kpiData: KpiData | null = useMemo(() => {
    if (!tableRows.length) return null;
    const totals = tableRows.reduce(
      (acc, row) => {
        acc.clicks += row.clicks;
        acc.impressions += row.impressions;
        acc.ctr += row.ctr;
        acc.position += row.position;
        return acc;
      },
      { clicks: 0, impressions: 0, ctr: 0, position: 0 }
    );
    const avgCtr = totals.ctr / tableRows.length;
    const avgPos = totals.position / tableRows.length;
    return {
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: avgCtr,
      position: avgPos
    };
  }, [tableRows]);

  async function handleQuery() {
    if (!site) return;
    setLoadingQuery(true);
    setQueryError(null);
    try {
      const { startDate, endDate } = rangeToIso(range, 28);
      const tableRes = await fetch("/api/gsc/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: site,
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: 250
        })
      });

      if (!tableRes.ok) {
        const text = await tableRes.text();
        throw new Error(text || `Table request failed: ${tableRes.status}`);
      }

      const tableData: QueryResponse = await tableRes.json();

      setTableRows(tableData.rows || []);
    } catch (err: any) {
      console.error(err);
      setQueryError(err.message ?? "Fehler beim Laden");
      setTableRows([]);
    } finally {
      setLoadingQuery(false);
    }
  }

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
        title="Dashboard"
        description="Kompakter Überblick über Performance und Trends."
      />

      {notConnected && (
        <SectionCard>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
        <FilterBar className="md:grid-cols-3 md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Zeitraum</label>
            <DateRangePicker value={range} onChange={setRange} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-transparent">.</label>
            <Button onClick={handleQuery} disabled={loadingQuery || !site}>
              {loadingQuery ? "Laden..." : "Laden"}
            </Button>
          </div>
        </FilterBar>
      )}

      <StatsRow>
        <Badge variant="secondary">
          Status: {notConnected ? "Nicht verbunden" : "Verbunden"}
        </Badge>
        <Badge variant="secondary">Zeitraum: {formatRange(range, 28)}</Badge>
      </StatsRow>

      <KpiCards data={kpiData} />

      {/* Performance overview moved to Rank Tracker */}

      {queryError && (
        <ErrorState>Fehler beim Laden: {queryError}</ErrorState>
      )}
    </div>
  );
}
