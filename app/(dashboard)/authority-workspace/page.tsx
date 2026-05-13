"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeProps
} from "reactflow";
import "reactflow/dist/style.css";
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Loader2,
  Network as NetworkIcon,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Tag,
  XCircle
} from "lucide-react";
import { useSite } from "@/components/dashboard/site-context";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { EntityMap } from "@/components/entity-graph/entity-map";
import { EntityDetailPanel } from "@/components/nlp/entity-detail-panel";
import {
  KEYWORD_PILLAR_CATEGORY,
  type AuthorityKeywordResult
} from "@/lib/authority-workspace/merge-graph";
import type { EntityGraphInput } from "@/lib/entity-graph/types";

type WorkspaceMeta = { projectId: string; siteUrl: string | null };

type SerpKeyword = {
  id: string;
  kwRaw: string;
  demandMonthly: number;
  demandSource?: string;
};
type SerpSubcluster = {
  id: string;
  name: string;
  totalDemand: number;
  keywordCount: number;
  keywords: SerpKeyword[];
  topDomains?: string[];
  topUrls?: string[];
};
type SerpRunListItem = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
};
type SerpResponse = {
  runId: string | null;
  generatedAt: string | null;
  subclusters: SerpSubcluster[];
};

type View = "select" | "analyzing" | "map";

type AnalyzeItem = {
  keyword: string;
  clusterId: string;
  clusterName: string;
};

type KwState =
  | { phase: "idle" }
  | { phase: "running"; startedAt: number }
  | { phase: "serp-done"; sourceCount: number; serpMs: number; startedAt: number }
  | { phase: "done"; durationMs: number; entityCount: number; relationCount: number }
  | { phase: "failed"; error: string; durationMs: number };

const TOP_CLUSTER_COUNT = 10;
const NODE_WIDTH = 280;
const NODE_HEIGHT = 168;
const NODE_GAP_X = 40;
const NODE_GAP_Y = 40;
const NODE_COLS = 5;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

function formatNumber(n: number): string {
  return n.toLocaleString("de-DE");
}

/* ── Cluster card node ── */
function ClusterCard({ data }: NodeProps) {
  const {
    name,
    totalDemand,
    keywordCount,
    topKeyword,
    rank,
    selected
  }: {
    name: string;
    totalDemand: number;
    keywordCount: number;
    topKeyword: string | null;
    rank: number;
    selected: boolean;
  } = data;

  return (
    <div
      className={cn(
        "group flex w-[280px] cursor-pointer flex-col gap-2 rounded-xl border-2 bg-card p-3 shadow-sm transition-all duration-200",
        selected
          ? "border-primary ring-2 ring-primary/40 shadow-lg"
          : "border-border hover:border-primary/60 hover:-translate-y-0.5 hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
            {rank}
          </span>
          <div className="text-sm font-semibold leading-tight line-clamp-2">{name}</div>
        </div>
        {selected ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <div className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/30 transition-colors group-hover:border-primary/60" />
        )}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          <span className="font-medium text-foreground">{formatNumber(totalDemand)}</span> Demand
        </span>
        <span className="tabular-nums">
          <span className="font-medium text-foreground">{keywordCount}</span> Keywords
        </span>
      </div>

      {topKeyword ? (
        <div className="rounded-md border bg-muted/40 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
            Top-Keyword
          </div>
          <div className="truncate text-xs font-medium" title={topKeyword}>
            {topKeyword}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const nodeTypes = { clusterCard: ClusterCard };

function buildSelectionGraph(
  topClusters: SerpSubcluster[],
  selectedIds: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = topClusters.map((c, idx) => {
    const col = idx % NODE_COLS;
    const row = Math.floor(idx / NODE_COLS);
    const topKeyword = c.keywords
      .slice()
      .sort((a, b) => b.demandMonthly - a.demandMonthly)[0]?.kwRaw ?? null;
    return {
      id: c.id,
      type: "clusterCard",
      position: {
        x: col * (NODE_WIDTH + NODE_GAP_X),
        y: row * (NODE_HEIGHT + NODE_GAP_Y)
      },
      data: {
        name: c.name,
        totalDemand: c.totalDemand,
        keywordCount: c.keywordCount,
        topKeyword,
        rank: idx + 1,
        selected: selectedIds.has(c.id)
      },
      draggable: false
    };
  });
  return { nodes, edges: [] };
}

export default function AuthorityWorkspacePage() {
  const { site } = useSite();
  const { data: workspace } = useSWR<WorkspaceMeta>(
    site ? `/api/keyword-workspace/current?siteUrl=${encodeURIComponent(site)}` : null,
    fetchJson
  );
  const projectId = workspace?.projectId ?? null;

  const { data: runList } = useSWR<SerpRunListItem[]>(
    projectId ? `/api/keyword-workspace/projects/${projectId}/serp-cluster/runs` : null,
    fetchJson
  );
  const latestRunId = useMemo(() => {
    const completed = runList?.find((r) => r.status === "completed");
    return (completed ?? runList?.[0])?.id ?? null;
  }, [runList]);

  const serpUrl = useMemo(() => {
    if (!projectId) return null;
    const params = new URLSearchParams();
    if (latestRunId) params.set("runId", latestRunId);
    const qs = params.toString();
    return `/api/keyword-workspace/projects/${projectId}/serp-cluster${qs ? `?${qs}` : ""}`;
  }, [projectId, latestRunId]);
  const { data: serpData, mutate: mutateSerp } = useSWR<SerpResponse>(serpUrl, fetchJson);

  const subclusters = serpData?.subclusters ?? [];
  const topClusters = useMemo(
    () =>
      [...subclusters]
        .sort((a, b) => (b.totalDemand ?? 0) - (a.totalDemand ?? 0))
        .slice(0, TOP_CLUSTER_COUNT),
    [subclusters]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("select");
  const [kwStates, setKwStates] = useState<Record<string, KwState>>({});
  const [graph, setGraph] = useState<EntityGraphInput | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [perKeywordSummary, setPerKeywordSummary] = useState<
    Array<{ keyword: string; clusterId: string; clusterName: string; entityCount: number; relationCount: number }>
  >([]);
  const [overallStartedAt, setOverallStartedAt] = useState<number | null>(null);
  const [overallDurationMs, setOverallDurationMs] = useState<number | null>(null);
  const [analyzeItems, setAnalyzeItems] = useState<AnalyzeItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(topClusters.map((c) => c.id)));
  }, [topClusters]);
  const handleClearAll = useCallback(() => setSelectedIds(new Set()), []);

  const { nodes: flowNodes, edges: flowEdges } = useMemo(
    () => buildSelectionGraph(topClusters, selectedIds),
    [topClusters, selectedIds]
  );

  const handleStart = useCallback(async () => {
    const items: AnalyzeItem[] = [];
    for (const c of topClusters) {
      if (!selectedIds.has(c.id)) continue;
      const top = c.keywords
        .slice()
        .sort((a, b) => b.demandMonthly - a.demandMonthly)[0];
      if (!top) continue;
      items.push({ keyword: top.kwRaw, clusterId: c.id, clusterName: c.name });
    }
    if (items.length === 0) return;

    setAnalyzeItems(items);
    setKwStates(
      Object.fromEntries(items.map((it) => [it.clusterId, { phase: "idle" } as KwState]))
    );
    setGraph(null);
    setAnalyzeError(null);
    setPerKeywordSummary([]);
    setOverallStartedAt(Date.now());
    setOverallDurationMs(null);
    setView("analyzing");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/authority-workspace/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
        signal: controller.signal
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          if (!ev.trim() || ev.startsWith(":")) continue;
          let eventName = "message";
          let dataStr = "";
          for (const line of ev.split("\n")) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataStr += line.slice(6);
          }
          if (!dataStr) continue;
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (eventName === "kw-start") {
            const cid = String(payload.clusterId);
            setKwStates((prev) => ({
              ...prev,
              [cid]: { phase: "running", startedAt: Date.now() }
            }));
          } else if (eventName === "kw-serp-done") {
            const cid = String(payload.clusterId);
            setKwStates((prev) => {
              const cur = prev[cid];
              const startedAt =
                cur?.phase === "running" ? cur.startedAt : Date.now();
              return {
                ...prev,
                [cid]: {
                  phase: "serp-done",
                  startedAt,
                  sourceCount: Number(payload.sourceCount ?? 0),
                  serpMs: Number(payload.durationMs ?? 0)
                }
              };
            });
          } else if (eventName === "kw-done") {
            const cid = String(payload.clusterId);
            setKwStates((prev) => ({
              ...prev,
              [cid]: {
                phase: "done",
                durationMs: Number(payload.durationMs ?? 0),
                entityCount: Number(payload.entityCount ?? 0),
                relationCount: Number(payload.relationCount ?? 0)
              }
            }));
          } else if (eventName === "kw-failed") {
            const cid = String(payload.clusterId);
            setKwStates((prev) => ({
              ...prev,
              [cid]: {
                phase: "failed",
                error: String(payload.error ?? "failed"),
                durationMs: Number(payload.durationMs ?? 0)
              }
            }));
          } else if (eventName === "result") {
            setGraph(payload.graph as EntityGraphInput);
            setOverallDurationMs(Number(payload.totalDurationMs ?? 0));
            setPerKeywordSummary(
              Array.isArray(payload.perKeyword)
                ? (payload.perKeyword as Array<{
                    keyword: string;
                    clusterId: string;
                    clusterName: string;
                    entityCount: number;
                    relationCount: number;
                  }>)
                : []
            );
            setView("map");
          } else if (eventName === "error") {
            setAnalyzeError(String(payload.error ?? "Unknown error"));
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setAnalyzeError((err as Error)?.message ?? "Request failed");
    } finally {
      abortRef.current = null;
    }
  }, [selectedIds, topClusters]);

  const handleResetToSelection = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setView("select");
    setKwStates({});
    setGraph(null);
    setAnalyzeError(null);
    setPerKeywordSummary([]);
    setOverallStartedAt(null);
    setOverallDurationMs(null);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const hasClusters = topClusters.length > 0;
  const selectionCount = selectedIds.size;

  return (
    <div className="relative h-full w-full overflow-hidden bg-card">
      {!projectId ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Crown className="h-10 w-10 text-muted-foreground/40" />
          <p>Wähle oben eine Property aus, um deinen Authority-Workspace zu öffnen.</p>
        </div>
      ) : !hasClusters ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <Crown className="h-10 w-10 text-muted-foreground/40" />
          <p>Noch keine Cluster vorhanden. Starte zuerst ein Clustering im Menüpunkt &quot;Clustering&quot;.</p>
          <Button asChild size="sm">
            <a href="/keyword-workspace">Zum Clustering</a>
          </Button>
        </div>
      ) : view === "select" ? (
        <SelectionScene
          flowNodes={flowNodes}
          flowEdges={flowEdges}
          selectionCount={selectionCount}
          totalCount={topClusters.length}
          onToggle={handleToggle}
          onSelectAll={handleSelectAll}
          onClearAll={handleClearAll}
          onStart={handleStart}
          onRefresh={() => mutateSerp()}
        />
      ) : view === "analyzing" ? (
        <AnalyzingScene
          items={analyzeItems}
          kwStates={kwStates}
          startedAt={overallStartedAt}
          error={analyzeError}
          onCancel={handleResetToSelection}
        />
      ) : (
        <MapScene
          graph={graph}
          perKeyword={perKeywordSummary}
          overallDurationMs={overallDurationMs}
          onBackToSelection={handleResetToSelection}
        />
      )}
    </div>
  );
}

/* ── Scene 1: Selection ── */
function SelectionScene({
  flowNodes,
  flowEdges,
  selectionCount,
  totalCount,
  onToggle,
  onSelectAll,
  onClearAll,
  onStart,
  onRefresh
}: {
  flowNodes: Node[];
  flowEdges: Edge[];
  selectionCount: number;
  totalCount: number;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onStart: () => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-lg border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-500" />
            <span className="font-semibold">Authority Workspace</span>
          </div>
          <p className="mt-1 max-w-md text-[11px] leading-snug text-muted-foreground">
            Wähle deine stärksten {totalCount} Cluster aus. Pro Auswahl wird das Top-Keyword
            via NLP-Pipeline analysiert und zu einer Entity-Map kombiniert.
          </p>
        </div>
        <div className="pointer-events-auto inline-flex items-center gap-1 rounded-lg border bg-card/95 px-1.5 py-1 shadow-sm backdrop-blur-md">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onSelectAll}
          >
            Alle
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onClearAll}
          >
            Keine
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onRefresh}
            title="Cluster neu laden"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_evt, node) => onToggle(node.id)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.4}
        maxZoom={1.5}
      >
        <Background gap={20} size={1} />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
        <div className="pointer-events-auto inline-flex items-center gap-3 rounded-full border bg-card/95 px-4 py-2 shadow-lg backdrop-blur-md">
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{selectionCount}</span> /{" "}
            {totalCount} ausgewählt
          </span>
          <Button
            size="sm"
            disabled={selectionCount === 0}
            onClick={onStart}
            className="h-8 gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Authority analysieren
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </>
  );
}

/* ── Scene 2: Analyzing (progress) ── */
function AnalyzingScene({
  items,
  kwStates,
  startedAt,
  error,
  onCancel
}: {
  items: AnalyzeItem[];
  kwStates: Record<string, KwState>;
  startedAt: number | null;
  error: string | null;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSec = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const completed = items.filter((it) => kwStates[it.clusterId]?.phase === "done").length;
  const failed = items.filter((it) => kwStates[it.clusterId]?.phase === "failed").length;

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div className="flex h-full max-h-[800px] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
            <div>
              <div className="text-base font-semibold">Authority-Analyse läuft</div>
              <div className="text-xs text-muted-foreground">
                {completed + failed} / {items.length} fertig · {elapsedSec}s
              </div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <ul className="divide-y">
            {items.map((it) => {
              const state = kwStates[it.clusterId] ?? { phase: "idle" as const };
              return (
                <li key={it.clusterId} className="flex items-center gap-3 px-5 py-3">
                  <KwStatusIcon phase={state.phase} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{it.keyword}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                        aus &quot;{it.clusterName}&quot;
                      </span>
                    </div>
                    <KwStateLine state={state} />
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        {error ? (
          <div className="border-t bg-destructive/5 px-5 py-3 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="border-t px-5 py-3 text-[11px] text-muted-foreground">
          Pro Keyword: SERP-Top-5 Crawl + 5× parallele Entity-Extraktion + Synthesis. Erwartete
          Dauer: 1-3 Min/Keyword bei {items.length} Keywords parallel.
        </div>
      </div>
    </div>
  );
}

function KwStatusIcon({ phase }: { phase: KwState["phase"] }) {
  if (phase === "done")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  if (phase === "failed") return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  if (phase === "running" || phase === "serp-done")
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
  return <div className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/30" />;
}

function KwStateLine({ state }: { state: KwState }) {
  if (state.phase === "idle")
    return <div className="text-[11px] text-muted-foreground">Wartet auf Start…</div>;
  if (state.phase === "running")
    return <div className="text-[11px] text-muted-foreground">SERP-Top-5 wird geholt…</div>;
  if (state.phase === "serp-done")
    return (
      <div className="text-[11px] text-muted-foreground">
        {state.sourceCount} Quellen geholt · LLM-Extraktion läuft…
      </div>
    );
  if (state.phase === "done")
    return (
      <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
        {state.entityCount} Entities · {state.relationCount} Relations · {(
          state.durationMs / 1000
        ).toFixed(1)}s
      </div>
    );
  return (
    <div className="text-[11px] text-destructive truncate" title={state.error}>
      {state.error}
    </div>
  );
}

/* ── Scene 3: Entity Map ── */
function MapScene({
  graph,
  perKeyword,
  overallDurationMs,
  onBackToSelection
}: {
  graph: EntityGraphInput | null;
  perKeyword: Array<{
    keyword: string;
    clusterId: string;
    clusterName: string;
    entityCount: number;
    relationCount: number;
  }>;
  overallDurationMs: number | null;
  onBackToSelection: () => void;
}) {
  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Kein Graph vorhanden.
      </div>
    );
  }

  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 z-20">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur-md">
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={onBackToSelection}>
            <RotateCcw className="h-3.5 w-3.5" /> Neue Auswahl
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {perKeyword.length} Keywords ·{" "}
            {overallDurationMs ? `${(overallDurationMs / 1000).toFixed(0)}s` : "—"}
          </span>
        </div>
      </div>

      <EntityMap
        data={graph}
        fullscreen
        heightClass="h-full"
        defaultLayout="radial"
        allowedLayouts={["tidy", "radial"]}
        orphansLabel={(n) => `${n} Beziehung${n === 1 ? "" : "en"} ohne passende Entity übersprungen`}
        renderSidebar={({ selectedEntity, onSelectEntity, categoryColors }) => {
          if (!selectedEntity) {
            return {
              collapsedLabel: "Authority",
              headerTitle: "Authority-Insights",
              headerIcon: <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />,
              body: (
                <AuthorityInsights
                  perKeyword={perKeyword}
                  graph={graph}
                  overallDurationMs={overallDurationMs}
                />
              ),
              showCloseButton: false
            };
          }
          if (selectedEntity.category === KEYWORD_PILLAR_CATEGORY) {
            const summary = perKeyword.find(
              (p) => `Keyword: ${p.keyword}` === selectedEntity.canonical_name
            );
            return {
              collapsedLabel: selectedEntity.name,
              headerTitle: selectedEntity.name,
              headerIcon: <Crown className="h-4 w-4 shrink-0 text-amber-500" />,
              body: (
                <KeywordPillarPanel
                  entity={selectedEntity}
                  summary={summary}
                  graph={graph}
                  onSelectEntity={onSelectEntity}
                />
              ),
              showCloseButton: true
            };
          }
          return {
            collapsedLabel: selectedEntity.canonical_name,
            headerTitle: selectedEntity.canonical_name,
            headerIcon: <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />,
            body: (
              <EntityDetailPanel
                entity={selectedEntity}
                color={categoryColors[selectedEntity.category] ?? "#64748b"}
                relations={graph.relations}
                onSelectEntity={onSelectEntity}
              />
            ),
            showCloseButton: true
          };
        }}
      />
    </>
  );
}

function AuthorityInsights({
  perKeyword,
  graph,
  overallDurationMs
}: {
  perKeyword: Array<{
    keyword: string;
    clusterId: string;
    clusterName: string;
    entityCount: number;
    relationCount: number;
  }>;
  graph: EntityGraphInput;
  overallDurationMs: number | null;
}) {
  const sharedEntities = useMemo(() => {
    const occurrences = new Map<string, number>();
    for (const r of graph.relations) {
      if (r.predicate !== "covers_entity") continue;
      occurrences.set(r.object, (occurrences.get(r.object) ?? 0) + 1);
    }
    const shared = Array.from(occurrences.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    return shared.map(([canonical, count]) => {
      const entity = graph.entities.find((e) => e.canonical_name === canonical);
      return { canonical, count, name: entity?.name ?? canonical, category: entity?.category };
    });
  }, [graph]);

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Authority Map
        </div>
        <div className="text-base font-semibold leading-snug">Topical Authority</div>
        <p className="text-xs text-muted-foreground">
          {perKeyword.length} Keywords analysiert · {graph.entities.length} Entities ·{" "}
          {graph.relations.length} Relations
          {overallDurationMs ? ` · ${(overallDurationMs / 1000).toFixed(0)}s` : ""}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Crown className="h-3.5 w-3.5" />
          Analysierte Keywords
        </div>
        <ul className="space-y-1">
          {perKeyword.map((p) => (
            <li
              key={p.clusterId}
              className="flex items-center justify-between gap-2 rounded-md border bg-background/50 px-2 py-1 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">{p.keyword}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {p.entityCount} E
              </span>
            </li>
          ))}
        </ul>
      </div>

      {sharedEntities.length ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            <NetworkIcon className="h-3.5 w-3.5" />
            Shared Entities (Authority-Brücken)
          </div>
          <p className="text-[11px] text-muted-foreground">
            Entities, die in mehreren Top-Keywords vorkommen — das sind die Themen, die deine
            Topical Authority halten.
          </p>
          <ul className="space-y-1">
            {sharedEntities.map((e) => (
              <li
                key={e.canonical}
                className="flex items-center justify-between gap-2 rounded-md border bg-background/50 px-2 py-1 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {e.count}× geteilt
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-300">
          Noch keine geteilten Entities zwischen den Keywords gefunden. Wähle thematisch
          ähnlichere Cluster, um Authority-Brücken zu sehen.
        </div>
      )}
    </div>
  );
}

function KeywordPillarPanel({
  entity,
  summary,
  graph,
  onSelectEntity
}: {
  entity: { name: string; canonical_name: string; mentions: number };
  summary?: {
    keyword: string;
    clusterId: string;
    clusterName: string;
    entityCount: number;
    relationCount: number;
  };
  graph: EntityGraphInput;
  onSelectEntity: (canonicalName: string) => void;
}) {
  const ownEntities = useMemo(() => {
    const list: Array<{ canonical: string; name: string; category: string }> = [];
    for (const r of graph.relations) {
      if (r.predicate !== "covers_entity") continue;
      if (r.subject !== entity.canonical_name) continue;
      const target = graph.entities.find((e) => e.canonical_name === r.object);
      if (!target) continue;
      list.push({ canonical: target.canonical_name, name: target.name, category: target.category });
    }
    return list;
  }, [graph, entity.canonical_name]);

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            <Crown className="h-3 w-3" />
            Top-Keyword
          </span>
          {summary ? (
            <span className="rounded-md border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide">
              aus &quot;{summary.clusterName}&quot;
            </span>
          ) : null}
        </div>
        <div className="text-xl font-semibold leading-tight">{entity.name}</div>
        {summary ? (
          <div className="text-xs text-muted-foreground">
            {summary.entityCount} Entities · {summary.relationCount} Relations extrahiert
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Extrahierte Entities ({ownEntities.length})
        </div>
        <ul className="space-y-1">
          {ownEntities.map((e) => (
            <li key={e.canonical}>
              <button
                type="button"
                onClick={() => onSelectEntity(e.canonical)}
                className="flex w-full items-center justify-between gap-2 rounded-md border bg-background/50 px-2 py-1 text-left text-xs hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{e.category}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
