"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowUpRight, Loader2, Play, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSite } from "@/components/dashboard/site-context";
import { cn } from "@/lib/utils";
import type { LinkRecommendation, OpportunityRow } from "@/lib/internal-links/types";

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

interface OpportunitiesPayload {
  run: RunSummary;
  opportunities: Array<OpportunityRow & { recommendations: LinkRecommendation[] }>;
}

const CATEGORY_STYLES: Record<
  OpportunityRow["category"],
  { bubble: string; ring: string; pill: string; label: string }
> = {
  quick_win: {
    bubble: "bg-rose-500",
    ring: "ring-rose-200/80",
    pill: "border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
    label: "Quick Win"
  },
  investigate: {
    bubble: "bg-amber-500",
    ring: "ring-amber-200/80",
    pill: "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    label: "Prüfen"
  },
  stable: {
    bubble: "bg-emerald-500",
    ring: "ring-emerald-200/80",
    pill: "border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    label: "Stabil"
  },
  low_data: {
    bubble: "bg-violet-500",
    ring: "ring-violet-200/80",
    pill: "border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
    label: "Geringe Datenbasis"
  }
};

const PRIORITY_PILL: Record<"high" | "medium" | "low", string> = {
  high: "border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  medium: "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  low: "border-muted bg-muted/40 text-muted-foreground"
};

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

// Pull a usable seed URL out of the GSC site identifier — properties use
// `sc-domain:example.com` or `https://example.com/`.
function deriveSeedFromSite(siteUrl: string | null): string {
  if (!siteUrl) return "";
  if (siteUrl.startsWith("sc-domain:")) {
    return `https://${siteUrl.slice("sc-domain:".length)}/`;
  }
  return siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
}

export function InternalLinkAnalysis() {
  const { site } = useSite();

  const { data: runsData, mutate: refetchRuns } = useSWR<{ runs: RunSummary[] }>(
    "/api/internal-links/runs",
    fetcher
  );
  const runs = runsData?.runs ?? [];

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Auto-select the most recent completed run on first load.
  useEffect(() => {
    if (selectedRunId) return;
    const latestCompleted = runs.find((r) => r.status === "completed");
    if (latestCompleted) setSelectedRunId(latestCompleted.id);
  }, [runs, selectedRunId]);

  const { data: payload, isLoading: opportunitiesLoading } = useSWR<OpportunitiesPayload>(
    selectedRunId ? `/api/internal-links/opportunities?runId=${selectedRunId}` : null,
    fetcher
  );

  const allOpportunities = payload?.opportunities ?? [];
  const [clusterFilter, setClusterFilter] = useState<string>("all");

  const clusters = useMemo(() => {
    const set = new Set(allOpportunities.map((o) => o.snapshot.cluster));
    return Array.from(set).sort();
  }, [allOpportunities]);

  const opportunities = useMemo(
    () =>
      clusterFilter === "all"
        ? allOpportunities
        : allOpportunities.filter((row) => row.snapshot.cluster === clusterFilter),
    [allOpportunities, clusterFilter]
  );

  const [selectedId, setSelectedId] = useState<string>("");
  useEffect(() => {
    if (!selectedId && opportunities.length > 0) {
      setSelectedId(opportunities[0].snapshot.id);
    }
  }, [opportunities, selectedId]);
  const selected = opportunities.find((row) => row.snapshot.id === selectedId) ?? opportunities[0];

  const maxImpressions = useMemo(
    () => Math.max(1, ...opportunities.map((o) => o.snapshot.impressions)),
    [opportunities]
  );

  const counts = useMemo(() => {
    const c: Record<OpportunityRow["category"], number> = {
      quick_win: 0,
      investigate: 0,
      stable: 0,
      low_data: 0
    };
    for (const row of opportunities) c[row.category] += 1;
    return c;
  }, [opportunities]);

  // Crawl form state.
  const [showForm, setShowForm] = useState(false);
  const [seedUrl, setSeedUrl] = useState("");
  const [maxUrls, setMaxUrls] = useState("500");
  const [isCrawling, setIsCrawling] = useState(false);

  useEffect(() => {
    if (!seedUrl) setSeedUrl(deriveSeedFromSite(site));
  }, [site, seedUrl]);

  const noRuns = runs.length === 0;

  async function startCrawl() {
    if (!site) {
      toast.error("Keine GSC-Property ausgewählt");
      return;
    }
    if (!seedUrl) {
      toast.error("Seed URL fehlt");
      return;
    }
    setIsCrawling(true);
    try {
      const res = await fetch("/api/internal-links/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: site,
          seedUrl,
          maxUrls: Number.parseInt(maxUrls, 10) || 500
        })
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
                Opportunity Matrix
              </Badge>
              <CardTitle className="text-3xl tracking-tight">Internal Link Analyse</CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7">
                Ranking-Nähe gegen internes Link-Defizit. Quick Wins liegen oben rechts: Seiten,
                die schon nahe an Top-Positionen ranken und trotzdem intern schwach gestützt werden.
                Bubble-Größe = Impressions aus GSC.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {runs.length > 0 ? (
                <Select
                  value={selectedRunId ?? ""}
                  onValueChange={(v) => setSelectedRunId(v)}
                >
                  <SelectTrigger className="w-[260px]">
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
                Same-Origin BFS, Concurrency 3, Timeout 8 s pro Seite. GSC-Metriken (Position,
                Impressions, Clicks) werden im Anschluss aus der ausgewählten Property gejoint.
                {site ? null : (
                  <span className="font-medium text-amber-600">
                    {" "}Keine GSC-Property ausgewählt — bitte erst oben verbinden.
                  </span>
                )}
              </p>
            </CardContent>
          ) : null}
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <SummaryStat
              label="Quick Wins"
              value={counts.quick_win}
              tone="rose"
              hint="Hohe Ranking-Nähe und Linkdefizit"
            />
            <SummaryStat
              label="Prüfen"
              value={counts.investigate}
              tone="amber"
              hint="Mittleres Potenzial"
            />
            <SummaryStat
              label="Stabil"
              value={counts.stable}
              tone="emerald"
              hint="Bereits gut intern verlinkt"
            />
            <SummaryStat
              label="Geringe Datenbasis"
              value={counts.low_data}
              tone="violet"
              hint="Unter 200 Impressions im Lookback"
            />
          </CardContent>
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
                  Starte deinen ersten Crawl mit der Seed-URL oben. Der Crawler bleibt auf dem
                  selben Host, joint anschließend GSC-Metriken und scort jede URL nach Quick-Win-
                  Potenzial.
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
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)]">
            <Card className="bg-card/90">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl">Opportunity Matrix</CardTitle>
                    <CardDescription>
                      Klick auf eine Bubble öffnet die Detail-Analyse rechts.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {clusters.length > 1 ? (
                      <Select value={clusterFilter} onValueChange={setClusterFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Cluster" />
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
                    ) : null}
                    <Badge variant="outline" className="shrink-0">
                      {opportunities.length} URLs
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative h-[520px] overflow-hidden rounded-2xl border bg-gradient-to-br from-background to-muted/20">
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

                  {opportunitiesLoading && opportunities.length === 0 ? (
                    <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Daten werden geladen
                      </span>
                    </div>
                  ) : null}

                  {opportunities.map((row) => {
                    const size = bubbleSize(row.snapshot.impressions, maxImpressions);
                    const x = toMatrixCoord(row.rankingProximity);
                    const y = toMatrixCoord(row.linkDeficit);
                    const style = CATEGORY_STYLES[row.category];
                    const isSelected = row.snapshot.id === selected?.snapshot.id;

                    return (
                      <Tooltip key={row.snapshot.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setSelectedId(row.snapshot.id)}
                            className={cn(
                              "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-center text-[10px] font-bold leading-tight text-white shadow-lg ring-4 transition-transform",
                              style.bubble,
                              style.ring,
                              isSelected ? "scale-110 ring-foreground/30" : "hover:scale-105"
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
                              {row.snapshot.position.toFixed(1)}
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

            <Card className="bg-card/90">
              {selected ? (
                <DetailPanel row={selected} recommendations={selected.recommendations} />
              ) : (
                <CardContent className="p-8 text-sm text-muted-foreground">
                  Keine URL ausgewählt.
                </CardContent>
              )}
            </Card>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function SummaryStat({
  label,
  value,
  tone,
  hint
}: {
  label: string;
  value: number;
  tone: "rose" | "amber" | "emerald" | "violet";
  hint: string;
}) {
  const toneClass = {
    rose: "border-rose-200/70 bg-rose-500/5 dark:border-rose-900/60 dark:bg-rose-950/30",
    amber: "border-amber-200/70 bg-amber-500/5 dark:border-amber-900/60 dark:bg-amber-950/30",
    emerald: "border-emerald-200/70 bg-emerald-500/5 dark:border-emerald-900/60 dark:bg-emerald-950/30",
    violet: "border-violet-200/70 bg-violet-500/5 dark:border-violet-900/60 dark:bg-violet-950/30"
  }[tone];

  return (
    <div className={cn("rounded-2xl border bg-background/70 p-4", toneClass)}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="grid h-32 w-32 place-items-center rounded-full"
      style={{
        background: `conic-gradient(hsl(var(--primary)) 0 ${pct}%, hsl(var(--muted)) ${pct}% 100%)`
      }}
    >
      <div className="grid h-24 w-24 place-items-center rounded-full bg-background shadow-inner ring-1 ring-border">
        <div className="text-center">
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Quick-Win
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-background/70 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function DetailPanel({
  row,
  recommendations
}: {
  row: OpportunityRow;
  recommendations: LinkRecommendation[];
}) {
  const style = CATEGORY_STYLES[row.category];
  const generic =
    row.anchorBreakdown.generic + row.anchorBreakdown.empty + row.anchorBreakdown.image_no_alt;

  return (
    <>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">{row.snapshot.title}</CardTitle>
            <CardDescription className="truncate font-mono text-xs">
              {row.snapshot.url}
            </CardDescription>
          </div>
          <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold", style.pill)}>
            {style.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-center pt-2">
          <ScoreRing value={row.quickWinScore} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Ø Position" value={row.snapshot.position.toFixed(1)} />
          <StatBox label="Impressions" value={formatNumber(row.snapshot.impressions)} />
          <StatBox label="Clicks" value={formatNumber(row.snapshot.clicks)} />
          <StatBox label="Inlinks" value={row.totalInlinks} />
          <StatBox label="Unique Sources" value={row.uniqueSources} />
          <StatBox label="Contextual" value={row.contextualLinks} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StatBox label="Ranking-Nähe" value={`${row.rankingProximity}/100`} />
          <StatBox label="Link Deficit" value={`${row.linkDeficit}/100`} />
          <StatBox label="Anchor Health" value={`${row.anchorHealth}/100`} />
          <StatBox
            label="Peer Deficit"
            value={`${row.peerDeficitPct > 0 ? "−" : ""}${Math.abs(row.peerDeficitPct)}%`}
          />
          <StatBox label="Generic Anchors" value={`${Math.round(generic)}%`} />
          <StatBox label="Cluster" value={row.snapshot.cluster} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Empfohlene Maßnahmen
          </div>
          {recommendations.length === 0 ? (
            <p className="rounded-xl border bg-background/70 p-4 text-xs text-muted-foreground">
              Keine offensichtlichen Maßnahmen — die Seite ist im Cluster gut verlinkt.
            </p>
          ) : (
            recommendations.map((rec, idx) => (
              <div
                key={rec.id}
                className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border bg-background/70 p-3"
              >
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                  {idx + 1}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Target className="h-3.5 w-3.5 text-primary" />
                    {rec.title}
                  </div>
                  <p className="text-xs text-muted-foreground">{rec.description}</p>
                  {rec.sourceUrl ? (
                    <p className="flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground">
                      <ArrowUpRight className="h-3 w-3 shrink-0" />
                      {rec.sourceUrl}
                    </p>
                  ) : null}
                  {rec.newAnchorSuggestions && rec.newAnchorSuggestions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {rec.newAnchorSuggestions.map((anchor) => (
                        <span
                          key={anchor}
                          className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px]"
                        >
                          {anchor}
                        </span>
                      ))}
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
            ))
          )}
        </div>
      </CardContent>
    </>
  );
}
