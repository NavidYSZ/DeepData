"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  ArrowUpRight,
  LayoutGrid,
  Loader2,
  Play,
  ScatterChart,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSite } from "@/components/dashboard/site-context";
import { cn } from "@/lib/utils";
import type {
  AnchorClass,
  ExecutiveKpis,
  InboundLink,
  LinkRecommendation,
  OpportunityRow
} from "@/lib/internal-links/types";

// ─────────────────────────────────────────────────────────────────────────────
// API types

interface RunSummary {
  id: string;
  siteUrl: string;
  seedUrl: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  urlsCrawled: number;
  linksFound: number;
  error: string | null;
}

interface OpportunityWithDetails extends OpportunityRow {
  recommendations: LinkRecommendation[];
  inboundLinks: InboundLink[];
}

interface OpportunitiesPayload {
  run: RunSummary;
  kpis: ExecutiveKpis;
  opportunities: OpportunityWithDetails[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Style maps

const CATEGORY_STYLES: Record<
  OpportunityRow["category"],
  { bubble: string; pill: string; label: string }
> = {
  quick_win: {
    bubble: "bg-rose-500",
    pill: "border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
    label: "Quick Win"
  },
  investigate: {
    bubble: "bg-amber-500",
    pill: "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    label: "Prüfen"
  },
  stable: {
    bubble: "bg-emerald-500",
    pill: "border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    label: "Stabil"
  },
  low_data: {
    bubble: "bg-violet-500",
    pill: "border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
    label: "Geringe Datenbasis"
  }
};

const PRIORITY_PILL: Record<"high" | "medium" | "low", string> = {
  high: "border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  medium: "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  low: "border-muted bg-muted/40 text-muted-foreground"
};

const ANCHOR_CLASS_LABEL: Record<AnchorClass, string> = {
  exact: "Exakt",
  partial: "Teilweise",
  branded: "Marken-Anker",
  entity: "Entität",
  generic: "Generisch",
  empty: "Leer",
  image_no_alt: "Bild ohne Alt"
};

const ANCHOR_CLASS_TONE: Record<AnchorClass, string> = {
  exact: "border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  partial: "border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  branded: "border-slate-200 bg-slate-500/10 text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200",
  entity: "border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
  generic: "border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  empty: "border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  image_no_alt: "border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
};

const ANCHOR_QUALITY: Record<AnchorClass, number> = {
  exact: 92,
  partial: 60,
  branded: 45,
  entity: 65,
  generic: 18,
  empty: 8,
  image_no_alt: 12
};

const ANCHOR_ACTION: Record<AnchorClass, string> = {
  exact: "behalten",
  partial: "okay",
  branded: "okay",
  entity: "behalten",
  generic: "ersetzen",
  empty: "ersetzen",
  image_no_alt: "Alt-Text setzen"
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err: Error & { status?: number } = new Error("Fetch failed");
    err.status = res.status;
    throw err;
  }
  return res.json();
};

function formatNumber(value: number) {
  return value.toLocaleString("de-DE");
}

function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

function shortLabel(title: string) {
  const word = title.split(/\s|–|—|\|/)[0];
  return word.length > 12 ? word.slice(0, 12) : word;
}

function bubbleSize(impressions: number, maxImpressions: number) {
  if (maxImpressions <= 0) return 56;
  const ratio = Math.log10(1 + impressions) / Math.log10(1 + maxImpressions);
  return Math.round(48 + ratio * 56);
}

function toMatrixCoord(score: number) {
  return 8 + (score / 100) * 84;
}

function deriveSeedFromSite(siteUrl: string | null): string {
  if (!siteUrl) return "";
  if (siteUrl.startsWith("sc-domain:")) return `https://${siteUrl.slice("sc-domain:".length)}/`;
  return siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
}

function recommendationLabel(opp: OpportunityWithDetails): string {
  const top = opp.recommendations[0];
  if (top) return top.action;
  if (opp.category === "stable") return "stabil";
  if (opp.category === "low_data") return "Datenbasis aufbauen";
  return "prüfen";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component

export function InternalLinkAnalysis() {
  const { site } = useSite();

  const { data: runsData, mutate: refetchRuns } = useSWR<{ runs: RunSummary[] }>(
    "/api/internal-links/runs",
    fetcher
  );
  const runs = runsData?.runs ?? [];

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedRunId) return;
    const latest = runs.find((r) => r.status === "completed");
    if (latest) setSelectedRunId(latest.id);
  }, [runs, selectedRunId]);

  const { data: payload, isLoading: opportunitiesLoading } = useSWR<OpportunitiesPayload>(
    selectedRunId ? `/api/internal-links/opportunities?runId=${selectedRunId}` : null,
    fetcher
  );

  const opportunities = payload?.opportunities ?? [];
  const kpis = payload?.kpis;

  const [view, setView] = useState<"executive" | "matrix">("executive");
  const [clusterFilter, setClusterFilter] = useState<string>("all");
  const [minClicks, setMinClicks] = useState("");
  const [minImpressions, setMinImpressions] = useState("");
  const [containsInput, setContainsInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");

  const clusters = useMemo(() => {
    const set = new Set(opportunities.map((o) => o.snapshot.cluster));
    return Array.from(set).sort();
  }, [opportunities]);

  const filtered = useMemo(() => {
    const containsTerms = containsInput
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const excludeTerms = excludeInput
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const minClicksNum = Number.parseInt(minClicks, 10);
    const minImpressionsNum = Number.parseInt(minImpressions, 10);

    return opportunities.filter((row) => {
      if (clusterFilter !== "all" && row.snapshot.cluster !== clusterFilter) return false;
      if (Number.isFinite(minClicksNum) && row.snapshot.clicks < minClicksNum) return false;
      if (Number.isFinite(minImpressionsNum) && row.snapshot.impressions < minImpressionsNum) {
        return false;
      }
      if (containsTerms.length === 0 && excludeTerms.length === 0) return true;
      // Match against URL + title + H1 — anything visually associated with the
      // page in the UI also matches when the user types it into the filter.
      const haystack = `${row.snapshot.url} ${row.snapshot.title} ${row.snapshot.h1 ?? ""}`.toLowerCase();
      if (containsTerms.length > 0 && !containsTerms.some((t) => haystack.includes(t))) {
        return false;
      }
      if (excludeTerms.length > 0 && excludeTerms.some((t) => haystack.includes(t))) {
        return false;
      }
      return true;
    });
  }, [opportunities, clusterFilter, minClicks, minImpressions, containsInput, excludeInput]);

  const hasActiveFilters =
    clusterFilter !== "all" ||
    minClicks !== "" ||
    minImpressions !== "" ||
    containsInput !== "" ||
    excludeInput !== "";

  function resetFilters() {
    setClusterFilter("all");
    setMinClicks("");
    setMinImpressions("");
    setContainsInput("");
    setExcludeInput("");
  }

  const [modalId, setModalId] = useState<string | null>(null);
  const modalRow = filtered.find((r) => r.snapshot.id === modalId) ?? null;

  // Crawl form state
  const [showForm, setShowForm] = useState(false);
  const [seedUrl, setSeedUrl] = useState("");
  const [maxUrls, setMaxUrls] = useState("500");
  const [isCrawling, setIsCrawling] = useState(false);

  useEffect(() => {
    if (!seedUrl) setSeedUrl(deriveSeedFromSite(site));
  }, [site, seedUrl]);

  const noRuns = runs.length === 0;

  async function startCrawl() {
    if (!site) return toast.error("Keine GSC-Property ausgewählt");
    if (!seedUrl) return toast.error("Seed URL fehlt");
    setIsCrawling(true);
    try {
      const res = await fetch("/api/internal-links/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: site, seedUrl, maxUrls: Number.parseInt(maxUrls, 10) || 500 })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Crawl failed (${res.status})`);
      }
      const data = await res.json();
      toast.success(`Crawl abgeschlossen — ${data.run.urlsCrawled} URLs, ${data.run.linksFound} Links`);
      await refetchRuns();
      setSelectedRunId(data.run.id);
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Crawl fehlgeschlagen");
    } finally {
      setIsCrawling(false);
    }
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <Card className="border-sky-200/70 bg-card/90">
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Badge
                variant="outline"
                className="w-fit border-sky-200 bg-sky-500/10 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
              >
                Internal Link Analyse
              </Badge>
              <CardTitle className="text-3xl tracking-tight">
                Quick Wins für deine internen Links
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7">
                Welche Seiten ranken bereits, sind aber intern unterversorgt? Welche
                Anker-Texte verschenken Signal? Klick auf eine Zeile oder Bubble öffnet die
                vollständige Analyse für die jeweilige URL.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ViewSwitch value={view} onChange={setView} />
              {runs.length > 0 ? (
                <Select value={selectedRunId ?? ""} onValueChange={(v) => setSelectedRunId(v)}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Crawl-Run wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {runs.map((run) => (
                      <SelectItem key={run.id} value={run.id}>
                        {formatDateTime(run.startedAt)} · {run.urlsCrawled} URLs
                        {run.status !== "completed" ? ` · ${run.status}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button onClick={() => setShowForm((s) => !s)} variant="outline" size="sm">
                <Play className="h-4 w-4" />
                Neuer Crawl
              </Button>
            </div>
          </CardHeader>
          {showForm ? (
            <CardContent className="border-t pt-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Seed URL</label>
                  <Input
                    value={seedUrl}
                    onChange={(e) => setSeedUrl(e.target.value)}
                    placeholder="https://example.com/"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Max URLs</label>
                  <Input
                    type="number"
                    value={maxUrls}
                    onChange={(e) => setMaxUrls(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={startCrawl} disabled={isCrawling || !site} className="w-full">
                    {isCrawling ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Crawl läuft…
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Crawl starten
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Same-Origin BFS, Concurrency 3, Timeout 8 s pro Seite. GSC-Metriken werden im
                Anschluss aus der ausgewählten Property gejoint.
                {site ? null : (
                  <span className="font-medium text-amber-600">
                    {" "}Keine GSC-Property ausgewählt — bitte erst oben verbinden.
                  </span>
                )}
              </p>
            </CardContent>
          ) : null}
        </Card>

        {noRuns ? (
          <Card className="bg-card/90">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Play className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold">Noch kein Crawl vorhanden</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Starte deinen ersten Crawl. Der Crawler bleibt auf demselben Host, joint
                  anschließend GSC-Metriken und scort jede URL nach Quick-Win-Potenzial.
                </p>
              </div>
              {!showForm ? (
                <Button onClick={() => setShowForm(true)}>
                  <Play className="h-4 w-4" />
                  Ersten Crawl starten
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <>
            <KpiStrip kpis={kpis} loading={opportunitiesLoading && !payload} />

            <FilterBar
              clusters={clusters}
              clusterFilter={clusterFilter}
              setClusterFilter={setClusterFilter}
              minClicks={minClicks}
              setMinClicks={setMinClicks}
              minImpressions={minImpressions}
              setMinImpressions={setMinImpressions}
              containsInput={containsInput}
              setContainsInput={setContainsInput}
              excludeInput={excludeInput}
              setExcludeInput={setExcludeInput}
              filteredCount={filtered.length}
              totalCount={opportunities.length}
              hasActiveFilters={hasActiveFilters}
              onReset={resetFilters}
            />

            {view === "executive" ? (
              <PrioritisedTable rows={filtered} onSelect={(id) => setModalId(id)} />
            ) : (
              <OpportunityMatrixView rows={filtered} onSelect={(id) => setModalId(id)} />
            )}
          </>
        )}

        <UrlInspectorModal row={modalRow} onClose={() => setModalId(null)} />
      </div>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// View switch

function ViewSwitch({
  value,
  onChange
}: {
  value: "executive" | "matrix";
  onChange: (v: "executive" | "matrix") => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-background p-0.5">
      <button
        onClick={() => onChange("executive")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          value === "executive"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Executive
      </button>
      <button
        onClick={() => onChange("matrix")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          value === "matrix"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <ScatterChart className="h-3.5 w-3.5" />
        Matrix
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter bar

function FilterBar({
  clusters,
  clusterFilter,
  setClusterFilter,
  minClicks,
  setMinClicks,
  minImpressions,
  setMinImpressions,
  containsInput,
  setContainsInput,
  excludeInput,
  setExcludeInput,
  filteredCount,
  totalCount,
  hasActiveFilters,
  onReset
}: {
  clusters: string[];
  clusterFilter: string;
  setClusterFilter: (v: string) => void;
  minClicks: string;
  setMinClicks: (v: string) => void;
  minImpressions: string;
  setMinImpressions: (v: string) => void;
  containsInput: string;
  setContainsInput: (v: string) => void;
  excludeInput: string;
  setExcludeInput: (v: string) => void;
  filteredCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  onReset: () => void;
}) {
  return (
    <Card className="bg-card/90">
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FilterField label="Cluster">
            <Select value={clusterFilter} onValueChange={setClusterFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Alle Cluster" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Cluster</SelectItem>
                {clusters.map((cluster) => (
                  <SelectItem key={cluster} value={cluster}>
                    {cluster}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Min. Clicks">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={minClicks}
              onChange={(e) => setMinClicks(e.target.value)}
              placeholder="0"
            />
          </FilterField>
          <FilterField label="Min. Impressions">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={minImpressions}
              onChange={(e) => setMinImpressions(e.target.value)}
              placeholder="0"
            />
          </FilterField>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <FilterField label="URL/Titel enthält" hint="Mehrere Begriffe komma-getrennt — Treffer wenn mindestens einer matcht.">
            <Input
              value={containsInput}
              onChange={(e) => setContainsInput(e.target.value)}
              placeholder="produkte, ratgeber"
            />
          </FilterField>
          <FilterField label="URL/Titel enthält NICHT" hint="Mehrere Begriffe komma-getrennt — Zeile fliegt raus, wenn einer matcht.">
            <Input
              value={excludeInput}
              onChange={(e) => setExcludeInput(e.target.value)}
              placeholder="archiv, alt"
            />
          </FilterField>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{filteredCount}</span> von{" "}
            {totalCount} URLs
          </span>
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={onReset} className="h-7 px-2 text-xs">
              Filter zurücksetzen
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function FilterField({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint ? <p className="text-[10px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI strip (Executive Dashboard)

function KpiStrip({ kpis, loading }: { kpis?: ExecutiveKpis; loading: boolean }) {
  const items: Array<{ label: string; value: string; pill?: { tone: string; text: string }; hint: string }> =
    [
      {
        label: "High Priority URLs",
        value: kpis ? formatNumber(kpis.highPriorityCount) : "–",
        pill: kpis && kpis.highPriorityCount > 0 ? { tone: PRIORITY_PILL.high, text: "Quick Wins" } : undefined,
        hint: "Ranken bereits, aber intern unterstützt — kleinster Hebel, größte Wirkung."
      },
      {
        label: "Quick-Win Klick-Potenzial",
        value: kpis ? `+${formatNumber(kpis.estimatedClicksPotential)}` : "–",
        pill: kpis && kpis.estimatedClicksPotential > 100
          ? { tone: PRIORITY_PILL.medium, text: "hoch" }
          : undefined,
        hint: "Geschätzte zusätzliche monatliche Klicks bei +3 Ranking-Plätzen."
      },
      {
        label: "Schwache Anchor-Texte",
        value: kpis ? `${kpis.weakAnchorPct}%` : "–",
        pill: kpis && kpis.weakAnchorPct > 30 ? { tone: PRIORITY_PILL.medium, text: "prüfen" } : undefined,
        hint: "Generic, leer oder Bild ohne Alt-Text — verschenken Linkkontext."
      },
      {
        label: "Near-Orphan Pages",
        value: kpis ? formatNumber(kpis.nearOrphanCount) : "–",
        pill: kpis && kpis.nearOrphanCount > 0 ? { tone: PRIORITY_PILL.high, text: "kritisch" } : undefined,
        hint: "Indexierbare Seiten mit 0–2 internen Inlinks."
      }
    ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="bg-card/90">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>{item.label}</span>
              {item.pill ? (
                <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", item.pill.tone)}>
                  {item.pill.text}
                </span>
              ) : null}
            </div>
            <div className="text-3xl font-semibold tracking-tight">
              {loading ? <span className="text-muted-foreground">…</span> : item.value}
            </div>
            <p className="text-xs leading-snug text-muted-foreground">{item.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Executive view: prioritised table

function PrioritisedTable({
  rows,
  onSelect
}: {
  rows: OpportunityWithDetails[];
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="bg-card/90">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Priorisierte Link-Chancen</CardTitle>
        <CardDescription>
          Sortiert nach Quick-Win-Score. Klick auf eine Zeile öffnet die URL-Detail-Analyse.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zielseite</TableHead>
                <TableHead className="w-20 text-right">Position</TableHead>
                <TableHead className="w-24 text-right">Impressions</TableHead>
                <TableHead className="w-44">Linkstärke</TableHead>
                <TableHead className="w-44">Anchor Health</TableHead>
                <TableHead className="w-44">Empfehlung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const linkStrength = 100 - row.linkDeficit;
                return (
                  <TableRow
                    key={row.snapshot.id}
                    onClick={() => onSelect(row.snapshot.id)}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="max-w-[360px]">
                      <div className="font-medium">{row.snapshot.h1 ?? row.snapshot.title}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {row.snapshot.url}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {row.snapshot.position > 0 ? row.snapshot.position.toFixed(1) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.snapshot.impressions)}
                    </TableCell>
                    <TableCell>
                      <BarCell value={linkStrength} tone={linkStrength >= 60 ? "good" : linkStrength >= 35 ? "warn" : "bad"} />
                    </TableCell>
                    <TableCell>
                      <BarCell value={row.anchorHealth} tone={row.anchorHealth >= 60 ? "good" : row.anchorHealth >= 40 ? "warn" : "bad"} />
                    </TableCell>
                    <TableCell>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", CATEGORY_STYLES[row.category].pill)}>
                        {recommendationLabel(row)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function BarCell({ value, tone }: { value: number; tone: "good" | "warn" | "bad" }) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-medium tabular-nums">{Math.round(pct)}/100</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Matrix view

function OpportunityMatrixView({
  rows,
  onSelect
}: {
  rows: OpportunityWithDetails[];
  onSelect: (id: string) => void;
}) {
  const maxImpressions = useMemo(
    () => Math.max(1, ...rows.map((o) => o.snapshot.impressions)),
    [rows]
  );

  return (
    <Card className="bg-card/90">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Opportunity Matrix</CardTitle>
        <CardDescription>
          Oben rechts = Quick Wins (hohe Ranking-Nähe + hohes Linkdefizit). Bubble-Größe =
          Impressions. Klick auf eine Bubble öffnet die URL-Detail-Analyse.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative h-[560px] overflow-hidden rounded-2xl border bg-gradient-to-br from-background to-muted/20">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-px bg-border" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-px bg-border" />

          <div className="absolute right-4 top-3 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Quick Wins
          </div>
          <div className="absolute left-4 top-3 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Linkaufbau prüfen
          </div>
          <div className="absolute bottom-9 left-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Low Priority
          </div>
          <div className="absolute bottom-9 right-4 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            Content / Snippet prüfen
          </div>

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Ranking-Nähe →
          </div>
          <div className="absolute left-2 top-1/2 origin-left -translate-y-1/2 -rotate-90 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Internal Link Deficit →
          </div>

          {rows.map((row) => {
            const size = bubbleSize(row.snapshot.impressions, maxImpressions);
            const x = toMatrixCoord(row.rankingProximity);
            const y = toMatrixCoord(row.linkDeficit);
            const style = CATEGORY_STYLES[row.category];

            return (
              <Tooltip key={row.snapshot.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelect(row.snapshot.id)}
                    className={cn(
                      "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-center text-[10px] font-bold leading-tight text-white shadow-lg ring-4 ring-white/85 transition-transform hover:scale-110",
                      style.bubble
                    )}
                    style={{
                      left: `${x}%`,
                      top: `${100 - y}%`,
                      width: `${size}px`,
                      height: `${size}px`
                    }}
                  >
                    <span className="px-1">
                      {shortLabel(row.snapshot.h1 ?? row.snapshot.title)}
                      <span className="block text-[9px] font-medium opacity-90">
                        {formatNumber(row.snapshot.impressions)}
                      </span>
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs space-y-1 text-xs">
                  <div className="font-semibold">{row.snapshot.title}</div>
                  <div className="text-muted-foreground">{row.snapshot.url}</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1">
                    <span>Position</span>
                    <span className="text-right font-medium">
                      {row.snapshot.position > 0 ? row.snapshot.position.toFixed(1) : "—"}
                    </span>
                    <span>Inlinks</span>
                    <span className="text-right font-medium">{row.totalInlinks}</span>
                    <span>Score</span>
                    <span className="text-right font-medium">{row.quickWinScore}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(Object.keys(CATEGORY_STYLES) as OpportunityRow["category"][]).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span className={cn("h-2 w-5 rounded-full", CATEGORY_STYLES[key].bubble)} />
              {CATEGORY_STYLES[key].label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// URL Inspector modal

function UrlInspectorModal({
  row,
  onClose
}: {
  row: OpportunityWithDetails | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        {row ? <UrlInspectorBody row={row} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function UrlInspectorBody({ row }: { row: OpportunityWithDetails }) {
  const style = CATEGORY_STYLES[row.category];

  // Group inbound anchors by (anchorText, anchorClass) so duplicates appear as
  // a single row with a count column.
  const grouped = useMemo(() => {
    const map = new Map<string, { anchor: string; anchorClass: AnchorClass; count: number }>();
    for (const link of row.inboundLinks) {
      const key = `${link.anchorText}__${link.anchorClass}`;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else
        map.set(key, {
          anchor: link.anchorText || "(leer)",
          anchorClass: link.anchorClass,
          count: 1
        });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [row.inboundLinks]);

  return (
    <>
      <DialogHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <DialogTitle className="truncate text-xl">
              {row.snapshot.h1 ?? row.snapshot.title}
            </DialogTitle>
            <DialogDescription className="truncate font-mono text-xs">
              {row.snapshot.url}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="grid h-12 w-12 place-items-center rounded-xl border bg-muted/40 text-sm font-semibold">
              {row.quickWinScore}
            </span>
            <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", style.pill)}>
              {style.label}
            </span>
          </div>
        </div>
      </DialogHeader>

      <ScrollArea className="max-h-[70vh] pr-4">
        <div className="space-y-5">
          {/* Performance + Link Stats */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Ø Position" value={row.snapshot.position > 0 ? row.snapshot.position.toFixed(1) : "—"} />
            <Stat label="Impressions" value={formatNumber(row.snapshot.impressions)} />
            <Stat label="Clicks" value={formatNumber(row.snapshot.clicks)} />
            <Stat label="Total Inlinks" value={row.totalInlinks} />
            <Stat label="Unique Sources" value={row.uniqueSources} />
            <Stat label="Useful Contextual" value={row.contextualLinks} />
          </div>

          {/* Recommendations — plain language "do X / on URL / using anchor" */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              So machst du diese Seite stärker
            </div>
            {row.recommendations.length === 0 ? (
              <p className="rounded-xl border bg-background/70 p-4 text-xs text-muted-foreground">
                Keine offensichtlichen Maßnahmen — die Seite ist im Cluster gut verlinkt.
              </p>
            ) : (
              <div className="space-y-2">
                {row.recommendations.map((rec, idx) => (
                  <RecommendationCard key={rec.id} rec={rec} index={idx + 1} />
                ))}
              </div>
            )}
          </section>

          {/* Anchor distribution */}
          <section className="space-y-2">
            <div className="text-sm font-semibold">Eingehende Anker-Texte</div>
            {grouped.length === 0 ? (
              <p className="rounded-xl border bg-background/70 p-4 text-xs text-muted-foreground">
                Diese Seite hat aktuell keine internen Inlinks im gecrawlten Set.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Anker</TableHead>
                      <TableHead className="w-32">Klasse</TableHead>
                      <TableHead className="w-12 text-right">#</TableHead>
                      <TableHead className="w-48">Qualität</TableHead>
                      <TableHead className="w-32">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped.map((g) => (
                      <TableRow key={`${g.anchor}-${g.anchorClass}`}>
                        <TableCell className="max-w-[280px] truncate font-medium">{g.anchor}</TableCell>
                        <TableCell>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", ANCHOR_CLASS_TONE[g.anchorClass])}>
                            {ANCHOR_CLASS_LABEL[g.anchorClass]}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                        <TableCell>
                          <BarCell
                            value={ANCHOR_QUALITY[g.anchorClass]}
                            tone={ANCHOR_QUALITY[g.anchorClass] >= 60 ? "good" : ANCHOR_QUALITY[g.anchorClass] >= 35 ? "warn" : "bad"}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ANCHOR_ACTION[g.anchorClass]}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-background/70 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function RecommendationCard({ rec, index }: { rec: LinkRecommendation; index: number }) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border bg-background/70 p-4">
      <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
        {index}
      </div>
      <div className="min-w-0 space-y-2">
        <div className="text-sm font-semibold">{rec.action}</div>
        <p className="text-xs leading-relaxed text-muted-foreground">{rec.why}</p>

        {rec.sourceUrl ? (
          <div className="flex items-start gap-1 text-[11px]">
            <span className="shrink-0 font-medium text-muted-foreground">Wo:</span>
            <span className="flex items-center gap-1 break-all font-mono text-foreground">
              <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              {rec.sourceUrl}
            </span>
          </div>
        ) : null}

        {rec.oldAnchor ? (
          <div className="flex items-start gap-1 text-[11px]">
            <span className="shrink-0 font-medium text-muted-foreground">Vorher:</span>
            <span className="rounded-full border bg-muted/40 px-2 py-0.5">
              {`„${rec.oldAnchor || "(leer)"}"`}
            </span>
          </div>
        ) : null}

        {rec.newAnchor ? (
          <div className="flex items-start gap-1 text-[11px]">
            <span className="shrink-0 font-medium text-muted-foreground">
              {rec.oldAnchor ? "Neu:" : "Anker:"}
            </span>
            <span className="rounded-full border border-emerald-300/60 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              {rec.newAnchor}
            </span>
          </div>
        ) : null}
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
          PRIORITY_PILL[rec.priority]
        )}
      >
        {rec.priority === "high" ? "hoch" : rec.priority === "medium" ? "mittel" : "niedrig"}
      </span>
    </div>
  );
}
