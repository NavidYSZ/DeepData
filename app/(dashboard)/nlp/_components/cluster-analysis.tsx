"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Map as MapIcon,
  Network,
  Play,
  Sparkles,
  Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { SectionCard, PageHeader } from "@/components/dashboard/page-shell";
import { useSite } from "@/components/dashboard/site-context";
import { EntityMap } from "@/components/entity-graph/entity-map";
import { EntityDetailPanel } from "@/components/nlp/entity-detail-panel";
import { SeoInsightsPanel } from "@/components/nlp/seo-insights-panel";
import { PageProfile, type AnalyzedClusterRef } from "@/components/nlp/page-profile";
import { SitemapMap } from "@/components/sitemap-graph/sitemap-map";
import { SitemapFilterBar } from "@/components/sitemap-graph/sitemap-filter-bar";
import { SitemapDetailPanel } from "@/components/nlp/sitemap-detail-panel";
import type { ExtractionOutput, RecommendedPage } from "@/lib/nlp/types";

type Cluster = {
  id: string;
  name: string;
  totalDemand: number;
  keywordCount: number;
  topKeyword: {
    kwRaw: string;
    demandMonthly: number;
    demandSource: string;
  } | null;
  topDomains: string[];
};

type Project = {
  id: string;
  name: string;
  gscSiteUrl: string | null;
  updatedAt: string;
};

type Run = {
  id: string;
  generatedAt: string | null;
  topResults: number;
  minDemand: number;
};

type ClustersListResponse = {
  project: Project | null;
  run: Run | null;
  clusters: Cluster[];
  message?: string;
};

type PipelineStepMetric = {
  step: string;
  model: string;
  durationMs: number;
  firstChunkMs: number | null;
  finishReason: string | null;
  usage: unknown;
};

type ClusterProgress = {
  status:
    | "queued"
    | "serping"
    | "crawling"
    | "extracting"
    | "done"
    | "failed";
  serpStatus?: number;
  serpDurationMs?: number;
  crawlDurationMs?: number;
  usableCount?: number;
  errorReason?: string;
};

type AnalysisResult = {
  extraction: ExtractionOutput;
  clusters: AnalyzedClusterRef[];
};

const TOP_N_URLS = 7;

export function ClusterAnalysis() {
  const { site: siteUrl } = useSite();
  const [listing, setListing] = useState<ClustersListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [clusterProgress, setClusterProgress] = useState<
    Map<string, ClusterProgress>
  >(new Map());
  const [steps, setSteps] = useState<PipelineStepMetric[]>([]);
  const [runningStep, setRunningStep] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setListLoading(true);
      setListError(null);
      try {
        const qs = siteUrl ? `?siteUrl=${encodeURIComponent(siteUrl)}` : "";
        const res = await fetch(`/api/nlp/clusters${qs}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setListError(json?.error ?? `HTTP ${res.status}`);
        } else {
          setListing(json);
          setSelectedIds(new Set());
        }
      } catch (err: any) {
        if (cancelled) return;
        setListError(err?.message ?? "Network error");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [siteUrl]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!listing) return;
    setSelectedIds(new Set(listing.clusters.map((c) => c.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  async function runAnalysis() {
    setConfirmOpen(false);
    setRunning(true);
    setResult(null);
    setRunError(null);
    setSteps([]);
    setRunningStep(null);
    const initialProgress = new Map<string, ClusterProgress>();
    for (const id of selectedIds) {
      initialProgress.set(id, { status: "queued" });
    }
    setClusterProgress(initialProgress);

    try {
      const res = await fetch("/api/nlp/clusters/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subclusterIds: Array.from(selectedIds) })
      });

      if (!res.ok || !res.body) {
        try {
          const json = await res.json();
          setRunError(json?.error ?? `HTTP ${res.status}`);
        } catch {
          setRunError(`HTTP ${res.status}`);
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const segments = buffer.split("\n\n");
        buffer = segments.pop() ?? "";
        for (const seg of segments) {
          if (!seg.trim() || seg.startsWith(":")) continue;
          const lines = seg.split("\n");
          let eventName = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }
          handleEvent(eventName, data);
        }
      }
    } catch (err: any) {
      setRunError(err?.message ?? "Network error");
    } finally {
      setRunning(false);
      setRunningStep(null);
    }
  }

  function handleEvent(name: string, data: any) {
    switch (name) {
      case "cluster-serp-start":
        updateClusterProgress(data.clusterId, { status: "serping" });
        break;
      case "cluster-serp-done":
        updateClusterProgress(data.clusterId, {
          status: data.error || data.urlCount === 0 ? "failed" : "crawling",
          serpStatus: data.status,
          serpDurationMs: data.durationMs,
          errorReason: data.error ?? undefined
        });
        break;
      case "cluster-crawl-done":
        updateClusterProgress(data.clusterId, {
          status: data.usableCount === 0 ? "failed" : "extracting",
          crawlDurationMs: data.durationMs,
          usableCount: data.usableCount,
          errorReason: data.usableCount === 0 ? "No usable sources" : undefined
        });
        break;
      case "cluster-skipped":
        updateClusterProgress(data.clusterId, {
          status: "failed",
          errorReason: data.reason
        });
        break;
      case "step-start": {
        setRunningStep(data.step);
        const m = typeof data.step === "string" && data.step.match(/^clusters\/1-cluster-(.+)$/);
        if (m) updateClusterProgress(m[1], { status: "extracting" });
        break;
      }
      case "step-done": {
        setRunningStep(null);
        setSteps((prev) => [...prev, data.metric]);
        const step = data.metric?.step;
        const m = typeof step === "string" && step.match(/^clusters\/1-cluster-(.+)$/);
        if (m) updateClusterProgress(m[1], { status: "done" });
        break;
      }
      case "step-failed": {
        setRunningStep(null);
        const m = typeof data.step === "string" && data.step.match(/^clusters\/1-cluster-(.+)$/);
        if (m) updateClusterProgress(m[1], { status: "failed", errorReason: data.error });
        break;
      }
      case "result":
        setResult({
          extraction: data.extraction,
          clusters: data.clusters
        });
        break;
      case "error":
        setRunError(formatRunError(data));
        break;
    }
  }

  function updateClusterProgress(id: string, patch: Partial<ClusterProgress>) {
    setClusterProgress((prev) => {
      const next = new Map(prev);
      const existing = next.get(id) ?? { status: "queued" as const };
      next.set(id, { ...existing, ...patch });
      return next;
    });
  }

  const project = listing?.project ?? null;
  const clusters = listing?.clusters ?? [];
  const selectedClusters = clusters.filter((c) => selectedIds.has(c.id));

  return (
    <>
      <PageHeader
        title="Topical Authority Analyse"
        description={
          project
            ? `Wähle Cluster aus dem Projekt "${project.name}" — pro Cluster wird das Keyword mit höchster Demand analysiert (SERP Top-${TOP_N_URLS} → Body-Extraktion → konsolidierter Entity-Graph).`
            : "Topical Authority Analyse über mehrere SerpSubclusters hinweg, konsolidiert zu einer Topic-Map."
        }
      />

      {/* Project info card */}
      {project ? (
        <SectionCard title={`Projekt: ${project.name}`}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {project.gscSiteUrl ? (
              <Badge variant="outline" className="font-mono text-[11px]">
                {project.gscSiteUrl}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200"
              >
                Kein GSC-Site verknüpft
              </Badge>
            )}
            {listing?.run ? (
              <span className="text-xs text-muted-foreground">
                Letzter Cluster-Run:{" "}
                {listing.run.generatedAt
                  ? new Date(listing.run.generatedAt).toLocaleString("de-DE")
                  : "—"}{" "}
                · {clusters.length} Cluster · minDemand {listing.run.minDemand}
              </span>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {listLoading ? (
        <SectionCard title="Cluster werden geladen…">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lade Cluster für die aktuell ausgewählte Site…
          </div>
        </SectionCard>
      ) : listError ? (
        <SectionCard title="Fehler beim Laden">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {listError}
          </div>
        </SectionCard>
      ) : !listing?.project ? (
        <SectionCard title="Kein Projekt gefunden">
          <p className="text-sm text-muted-foreground">
            {listing?.message ??
              "Für die aktuell ausgewählte Site existiert noch kein KeywordProject."}{" "}
            Lege eines im{" "}
            <a className="text-primary underline" href="/keyword-workspace">
              Keyword-Workspace
            </a>{" "}
            an.
          </p>
        </SectionCard>
      ) : !listing.run ? (
        <SectionCard title="Noch kein SERP-Clustering-Run">
          <p className="text-sm text-muted-foreground">
            Im Projekt &ldquo;{project!.name}&rdquo; gibt es noch keinen abgeschlossenen
            SERP-Clustering-Run. Starte einen im{" "}
            <a className="text-primary underline" href="/keyword-workspace">
              Keyword-Workspace
            </a>
            .
          </p>
        </SectionCard>
      ) : (
        <ClusterPickerCard
          clusters={clusters}
          selectedIds={selectedIds}
          onToggle={toggleSelect}
          onSelectAll={selectAll}
          onSelectNone={selectNone}
          disabled={running}
          onAnalyze={() => setConfirmOpen(true)}
        />
      )}

      {/* Live progress while running */}
      {running || clusterProgress.size > 0 ? (
        <RunProgressCard
          clusters={clusters}
          progress={clusterProgress}
          steps={steps}
          runningStep={runningStep}
          running={running}
        />
      ) : null}

      {runError ? (
        <SectionCard title="Fehler beim Run">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {runError}
          </div>
        </SectionCard>
      ) : null}

      {/* Result */}
      {result ? <ResultTabs result={result} /> : null}

      {/* Confirm modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Analyse starten?</DialogTitle>
            <DialogDescription>
              Du startest jetzt die Cross-Cluster-Analyse. Folgendes passiert im
              Hintergrund:
            </DialogDescription>
          </DialogHeader>
          <CostSummary
            clusterCount={selectedClusters.length}
            clusters={selectedClusters}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={runAnalysis}>
              <Play className="mr-2 h-4 w-4" />
              Analyse starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClusterPickerCard({
  clusters,
  selectedIds,
  onToggle,
  onSelectAll,
  onSelectNone,
  disabled,
  onAnalyze
}: {
  clusters: Cluster[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  disabled: boolean;
  onAnalyze: () => void;
}) {
  const selectedCount = selectedIds.size;
  return (
    <SectionCard
      title={`Cluster auswählen (${selectedCount} / ${clusters.length} ausgewählt)`}
      description="Pro ausgewähltem Cluster wird das Keyword mit der höchsten monatlichen Demand analysiert."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onSelectAll}
          disabled={disabled || clusters.length === 0}
        >
          Alle auswählen
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onSelectNone}
          disabled={disabled || selectedCount === 0}
        >
          Auswahl löschen
        </Button>
        <div className="ml-auto">
          <Button
            onClick={onAnalyze}
            disabled={disabled || selectedCount === 0}
            size="sm"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {selectedCount} Cluster analysieren
          </Button>
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {clusters.map((c) => {
          const checked = selectedIds.has(c.id);
          const noKeyword = !c.topKeyword;
          return (
            <label
              key={c.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                checked
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/30"
              } ${noKeyword ? "opacity-60" : ""}`}
            >
              <Checkbox
                checked={checked}
                disabled={disabled || noKeyword}
                onCheckedChange={() => onToggle(c.id)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {c.keywordCount} kw
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {Math.round(c.totalDemand).toLocaleString("de-DE")} demand
                  </Badge>
                </div>
                {c.topKeyword ? (
                  <div className="text-xs text-muted-foreground">
                    Top-Keyword:{" "}
                    <span className="font-mono text-foreground">{c.topKeyword.kwRaw}</span>
                    {" · "}
                    {Math.round(c.topKeyword.demandMonthly).toLocaleString("de-DE")} /Monat
                    {" · "}
                    <span className="text-[10px] uppercase">{c.topKeyword.demandSource}</span>
                  </div>
                ) : (
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    Kein Top-Keyword (Demand fehlt)
                  </div>
                )}
                {c.topDomains.length ? (
                  <div className="line-clamp-1 text-[11px] text-muted-foreground">
                    Top-Domains: {c.topDomains.slice(0, 3).join(", ")}
                  </div>
                ) : null}
              </div>
            </label>
          );
        })}
      </div>
    </SectionCard>
  );
}

function CostSummary({
  clusterCount,
  clusters
}: {
  clusterCount: number;
  clusters: Cluster[];
}) {
  const serpCalls = clusterCount;
  const phase1Calls = clusterCount * TOP_N_URLS;
  const synthesisCalls = 1;
  return (
    <div className="space-y-3 py-2">
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <ul className="space-y-1">
          <li>
            • <span className="font-medium">{serpCalls}</span> SERP-Fetch(s) via Zyte (Top
            {" "}
            {TOP_N_URLS})
          </li>
          <li>
            • <span className="font-medium">{clusterCount * TOP_N_URLS}</span>{" "}
            Page-Crawls (parallel pro Cluster)
          </li>
          <li>
            • <span className="font-medium">{phase1Calls}</span> LLM-Calls Phase 1
            (gpt-5.4-mini, no reasoning)
          </li>
          <li>
            • <span className="font-medium">{synthesisCalls}</span> LLM-Call Phase 3
            (gpt-5.4, mit reasoning) für Synthesis + Sitemap
          </li>
        </ul>
      </div>
      <div className="rounded-md border bg-background p-3 text-xs">
        <div className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">
          Ausgewählte Cluster
        </div>
        <ul className="space-y-0.5">
          {clusters.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="text-foreground">{c.name}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-mono text-xs">
                {c.topKeyword?.kwRaw ?? "(kein Keyword)"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RunProgressCard({
  clusters,
  progress,
  steps,
  runningStep,
  running
}: {
  clusters: Cluster[];
  progress: Map<string, ClusterProgress>;
  steps: PipelineStepMetric[];
  runningStep: string | null;
  running: boolean;
}) {
  const totalDuration = steps.reduce((s, st) => s + st.durationMs, 0);
  return (
    <SectionCard
      title="Analyse läuft"
      description={`${steps.length} Steps fertig · ${(totalDuration / 1000).toFixed(1)}s LLM-Zeit kumuliert`}
    >
      <div className="space-y-2">
        {Array.from(progress.entries()).map(([id, prog]) => {
          const cluster = clusters.find((c) => c.id === id);
          if (!cluster) return null;
          return (
            <ClusterProgressRow
              key={id}
              name={cluster.name}
              keyword={cluster.topKeyword?.kwRaw ?? "?"}
              progress={prog}
            />
          );
        })}
      </div>

      {/* Cross-cluster + synthesis pipeline status */}
      {steps.some(
        (s) =>
          s.step.startsWith("clusters/2-") || s.step.startsWith("clusters/3-")
      ) || runningStep?.startsWith("clusters/2-") || runningStep?.startsWith("clusters/3-") ? (
        <div className="mt-4 border-t pt-3">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Cross-Cluster Phase
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {steps
              .filter(
                (s) =>
                  s.step.startsWith("clusters/2-") || s.step.startsWith("clusters/3-")
              )
              .map((s, i, arr) => (
                <div key={s.step} className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50/60 px-2 py-1 text-xs text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="font-mono">{s.step}</span>
                    <span className="text-muted-foreground">
                      {(s.durationMs / 1000).toFixed(1)}s
                    </span>
                  </span>
                  {i < arr.length - 1 || runningStep?.startsWith("clusters/") ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : null}
                </div>
              ))}
            {runningStep &&
            (runningStep.startsWith("clusters/2-") ||
              runningStep.startsWith("clusters/3-")) ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="font-mono">{runningStep}</span>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {!running ? (
        <div className="mt-3 text-xs text-muted-foreground">Run abgeschlossen.</div>
      ) : null}
    </SectionCard>
  );
}

function ClusterProgressRow({
  name,
  keyword,
  progress
}: {
  name: string;
  keyword: string;
  progress: ClusterProgress;
}) {
  const statusLabel: Record<ClusterProgress["status"], string> = {
    queued: "Wartet",
    serping: "SERP-Fetch…",
    crawling: "Crawl…",
    extracting: "Extract…",
    done: "Fertig",
    failed: "Fehler"
  };
  const tone =
    progress.status === "done"
      ? "border-emerald-300 bg-emerald-50/60 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
      : progress.status === "failed"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-primary/40 bg-primary/10 text-primary";
  const icon =
    progress.status === "done" ? (
      <CheckCircle2 className="h-3.5 w-3.5" />
    ) : progress.status === "failed" ? (
      <AlertCircle className="h-3.5 w-3.5" />
    ) : (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    );
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${tone}`}>
        {icon}
        {statusLabel[progress.status]}
      </span>
      <span className="font-medium">{name}</span>
      <span className="text-muted-foreground">→</span>
      <span className="font-mono text-xs">{keyword}</span>
      {progress.errorReason ? (
        <span className="ml-2 truncate text-xs text-destructive">
          {progress.errorReason}
        </span>
      ) : (
        <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
          {typeof progress.serpDurationMs === "number" ? (
            <span>SERP {(progress.serpDurationMs / 1000).toFixed(1)}s</span>
          ) : null}
          {typeof progress.crawlDurationMs === "number" ? (
            <span>Crawl {(progress.crawlDurationMs / 1000).toFixed(1)}s</span>
          ) : null}
          {typeof progress.usableCount === "number" ? (
            <span>{progress.usableCount} usable</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ResultTabs({ result }: { result: AnalysisResult }) {
  const sitemap = result.extraction.recommended_sitemap;
  const pages = sitemap?.pages ?? [];
  return (
    <Tabs defaultValue="profile" className="space-y-4">
      <TabsList>
        <TabsTrigger value="profile" className="gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Page Profile
        </TabsTrigger>
        <TabsTrigger value="entities" className="gap-1.5">
          <Network className="h-3.5 w-3.5" />
          Entity Map
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {result.extraction.entities.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="sitemap" className="gap-1.5">
          <MapIcon className="h-3.5 w-3.5" />
          Sitemap Map
          {pages.length ? (
            <Badge variant="secondary" className="ml-1 text-[10px]">
              {pages.length}
            </Badge>
          ) : null}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <SectionCard title="Page Profile">
          <PageProfile data={result.extraction} analyzedClusters={result.clusters} />
        </SectionCard>
      </TabsContent>

      <TabsContent value="entities">
        <SectionCard
          title="Entity Map"
          description={`${result.extraction.entities.length} Entities · ${result.extraction.relations.length} Relationen · konsolidiert über ${result.clusters.length} Cluster`}
          contentClassName="!p-0"
        >
          <EntityMap
            data={result.extraction}
            allowedLayouts={["tidy", "radial"]}
            renderSidebar={({ selectedEntity, onSelectEntity, categoryColors }) => ({
              collapsedLabel: selectedEntity?.canonical_name ?? "Insights",
              headerTitle: selectedEntity?.canonical_name ?? "SEO Insights",
              headerIcon: selectedEntity ? (
                <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
              ),
              body: selectedEntity ? (
                <EntityDetailPanel
                  entity={selectedEntity}
                  color={categoryColors[selectedEntity.category] ?? "#64748b"}
                  relations={result.extraction.relations}
                  onSelectEntity={onSelectEntity}
                />
              ) : (
                <SeoInsightsPanel data={result.extraction} />
              ),
              showCloseButton: selectedEntity !== null
            })}
          />
        </SectionCard>
      </TabsContent>

      <TabsContent value="sitemap">
        {sitemap && pages.length > 0 ? (
          <SectionCard
            title="Empfohlene Sitemap"
            description="Top-Down-Baum für die übergeordnete Topical Authority. Status farbcodiert. Klick auf eine Page für Details."
            contentClassName="!p-3"
          >
            <SitemapMap
              sitemap={sitemap}
              defaultMode="tidy"
              renderFilterBar={(args) => (
                <SitemapFilterBar
                  sitemap={sitemap}
                  allowedModes={["tidy", "radial"]}
                  {...args}
                />
              )}
              renderSidebar={({ selectedPage, onSelectPage }) => ({
                collapsedLabel: selectedPage?.h1 ?? "Sitemap",
                headerTitle: selectedPage?.h1 ?? "Sitemap-Übersicht",
                headerIcon: selectedPage ? (
                  <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <MapIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                ),
                body: selectedPage ? (
                  <SitemapDetailPanel
                    page={selectedPage}
                    allPages={pages}
                    entities={result.extraction.entities}
                    onSelectPage={onSelectPage}
                  />
                ) : (
                  <SitemapOverview pages={pages} />
                ),
                showCloseButton: selectedPage !== null
              })}
            />
          </SectionCard>
        ) : (
          <SectionCard title="Sitemap">
            <div className="text-sm text-muted-foreground">
              Keine Sitemap im Ergebnis.
            </div>
          </SectionCard>
        )}
      </TabsContent>
    </Tabs>
  );
}

function SitemapOverview({ pages }: { pages: RecommendedPage[] }) {
  const total = pages.length;
  const covered = pages.filter((p) => p.status === "covered_on_page").length;
  const gap = pages.filter((p) => p.status === "content_gap").length;
  const likely = pages.filter((p) => p.status === "likely_exists_elsewhere").length;
  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Empfohlene Site-Struktur über alle ausgewählten Cluster.
      </p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-md border bg-background/60 p-2">
          <div className="text-lg font-bold">{total}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Pages gesamt
          </div>
        </div>
        <div className="rounded-md border border-emerald-300 bg-emerald-50/60 p-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
            {covered}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            covered
          </div>
        </div>
        <div className="rounded-md border border-amber-300 bg-amber-50/60 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
            {gap}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            content gaps
          </div>
        </div>
        <div className="rounded-md border bg-zinc-50/60 p-2 dark:bg-zinc-800/40">
          <div className="text-lg font-bold text-zinc-600 dark:text-zinc-300">
            {likely}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            likely exists
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRunError(json: any): string {
  const parts: string[] = [json?.error ?? "Cluster-Analyse fehlgeschlagen"];
  if (json?.hint) parts.push(json.hint);
  if (json?.failedStep) parts.push(`failedStep: ${json.failedStep}`);
  if (json?.statusCode) parts.push(`HTTP ${json.statusCode}`);
  if (json?.model) parts.push(`model: ${json.model}`);
  if (json?._routeVersion) parts.push(`route: ${json._routeVersion}`);
  if (json?.responseBody) {
    const rb =
      typeof json.responseBody === "string"
        ? json.responseBody
        : JSON.stringify(json.responseBody);
    parts.push(`response: ${rb.slice(0, 300)}`);
  }
  return parts.join(" · ");
}
