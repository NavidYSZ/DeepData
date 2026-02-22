"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import ReactFlow, { Background, Controls, Edge, Node, NodeProps, ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import { Loader2, Play, RefreshCw } from "lucide-react";
import dagre from "dagre";
import { useSite } from "@/components/dashboard/site-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type SerpKeyword = { id: string; kwRaw: string; demandMonthly: number };
type SerpSubcluster = {
  id: string;
  name: string;
  totalDemand: number;
  keywordCount: number;
  keywordIds: string[];
  keywords: SerpKeyword[];
  topDomains?: string[];
  topUrls?: string[];
  overlapScore?: number | null;
};
type SerpParent = {
  id: string;
  name: string;
  totalDemand: number;
  keywordCount: number;
  topDomains: string[];
  subclusters: SerpSubcluster[];
};
type SerpResponse = {
  runId: string | null;
  generatedAt: string | null;
  parents: SerpParent[];
};

const ACTIVE_STATUSES = ["pending", "importing_gsc", "fetching_serps", "clustering", "mapping_parents", "running"];
const SERP_DEBUG = true;

const STATUS_LABELS: Record<string, string> = {
  pending: "Wird vorbereitet...",
  importing_gsc: "GSC-Daten werden importiert (6 Monate)...",
  fetching_serps: "SERP-Daten werden von Google geholt...",
  clustering: "Keywords werden geclustert...",
  mapping_parents: "Themen werden mit KI gruppiert...",
  running: "Clustering läuft..."
};

const PARENT_WIDTH = 280;
const PARENT_HEIGHT = 120;
const DETAIL_WIDTH = 360;
const DETAIL_HEIGHT = 520;
const SUB_WIDTH = 260;
const SUB_HEIGHT = 150;
const GRID_COLS = 4;
const GRID_GAP_X = 40;
const GRID_GAP_Y = 40;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = (await res.json()) as T;
  if (SERP_DEBUG) {
    console.groupCollapsed(`[SERP][fetchJson] ${url}`);
    console.debug(json);
    console.groupEnd();
  }
  return json;
}

/* ── Custom Node: Parent (unified – compact / expanded / stacked) ── */
function ParentNode({ data }: NodeProps) {
  /* ── Expanded detail view (selected parent) ── */
  if (data.expanded) {
    const keywords: SerpKeyword[] = data.keywordsFlat ?? [];
    return (
      <div className="rounded-lg border bg-card shadow-2xl p-4 w-[360px] max-h-[520px] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold leading-tight">{data.name}</div>
            <div className="text-sm text-muted-foreground">
              Demand {Math.round(data.totalDemand)} · Keywords {data.keywordCount}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => data.onBack?.()}>
            Zurück
          </Button>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {data.subclusterCount} Subcluster
        </div>
        <div className="mt-3 space-y-1 flex-1 min-h-0">
          <div className="text-sm font-medium">Keywords (Top 50)</div>
          <ScrollArea className="h-[340px] rounded border">
            <div className="p-3 space-y-1 text-sm text-muted-foreground">
              {keywords.map((k) => (
                <div key={k.id} className="flex justify-between gap-2">
                  <span className="truncate">{k.kwRaw}</span>
                  <span>{Math.round(k.demandMonthly)}</span>
                </div>
              ))}
              {data.totalKeywords > keywords.length ? (
                <div className="text-xs text-muted-foreground mt-2">
                  +{data.totalKeywords - keywords.length} weitere
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  /* ── Stacked view (top-right corner, click → back to overview) ── */
  if (data.stacked) {
    return (
      <div
        className="rounded-lg border bg-card p-3 shadow-sm w-[220px] cursor-pointer opacity-50 hover:opacity-80 transition-opacity duration-200"
        onClick={() => data.onBack?.()}
      >
        <div className="text-sm font-semibold truncate">{data.name}</div>
        <div className="text-xs text-muted-foreground">Demand {Math.round(data.totalDemand)}</div>
        {data.stackLabel ? (
          <div className="text-[11px] text-primary font-medium mt-1">{data.stackLabel}</div>
        ) : null}
      </div>
    );
  }

  /* ── Normal compact card (overview grid) ── */
  return (
    <div
      className="rounded-lg border bg-card p-3 shadow-sm w-[280px] cursor-pointer transition-all duration-300 hover:shadow-md hover:-translate-y-1"
      onClick={() => data.onSelect?.(data.parentId)}
    >
      <div className="text-sm font-semibold truncate">{data.name}</div>
      <div className="text-xs text-muted-foreground">Demand {Math.round(data.totalDemand)}</div>
      <div className="text-xs text-muted-foreground">Keywords {data.keywordCount}</div>
      <div className="text-xs text-muted-foreground mt-1">{data.subclusterCount} Subcluster</div>
    </div>
  );
}

/* ── Custom Node: Subcluster ── */
function SubclusterNode({ data }: NodeProps) {
  return (
    <div className="rounded-lg border bg-accent px-3 py-2 shadow-sm w-64 transition-all duration-300 hover:-translate-y-1">
      <div className="text-sm font-semibold truncate">{data.name}</div>
      <div className="text-xs text-muted-foreground">
        Demand {Math.round(data.totalDemand)} · {data.keywordCount} KW
      </div>
      {typeof data.overlapScore === "number" ? (
        <div className="text-[11px] text-muted-foreground">Avg Overlap {(data.overlapScore * 100).toFixed(0)}%</div>
      ) : null}
      <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
        {data.keywords?.slice(0, 3).map((k: SerpKeyword) => (
          <div key={k.id} className="flex justify-between gap-1">
            <span className="truncate">{k.kwRaw}</span>
            <span>{Math.round(k.demandMonthly)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = {
  parentNode: ParentNode,
  subNode: SubclusterNode
};

/* ── Layout builder ── */
function buildFlowGraph(
  parents: SerpParent[],
  selectedParent: string | null,
  onSelect: (id: string) => void,
  onBack: () => void
): { nodes: Node[]; edges: Edge[] } {
  if (!parents.length) return { nodes: [], edges: [] };

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const TRANSITION_STYLE = { transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)" };

  if (!selectedParent) {
    // ── Overview: grid of parent nodes ──
    parents.forEach((p, idx) => {
      const col = idx % GRID_COLS;
      const row = Math.floor(idx / GRID_COLS);
      nodes.push({
        id: `parent-${p.id}`,
        type: "parentNode",
        position: {
          x: col * (PARENT_WIDTH + GRID_GAP_X),
          y: row * (PARENT_HEIGHT + GRID_GAP_Y)
        },
        data: {
          parentId: p.id,
          name: p.name,
          totalDemand: p.totalDemand,
          keywordCount: p.keywordCount,
          subclusterCount: p.subclusters.length,
          onSelect
        },
        style: TRANSITION_STYLE,
        draggable: false
      });
    });
  } else {
    // ── Focus mode ──
    const selected = parents.find((p) => p.id === selectedParent);
    if (!selected) return { nodes: [], edges: [] };

    // Flat keywords for detail node
    const keywordsFlat = selected.subclusters
      .flatMap((s) => s.keywords)
      .sort((a, b) => (b.demandMonthly ?? 0) - (a.demandMonthly ?? 0))
      .slice(0, 50);

    const selectedNodeId = `parent-${selected.id}`;

    // Selected parent → expanded detail (left side, same node ID for smooth transition)
    nodes.push({
      id: selectedNodeId,
      type: "parentNode",
      position: { x: 0, y: 0 },
      data: {
        parentId: selected.id,
        name: selected.name,
        totalDemand: selected.totalDemand,
        keywordCount: selected.keywordCount,
        subclusterCount: selected.subclusters.length,
        expanded: true,
        keywordsFlat,
        totalKeywords: selected.keywordCount,
        onBack,
        onSelect
      },
      style: { ...TRANSITION_STYLE, zIndex: 10 },
      draggable: false
    });

    // Subcluster nodes (right, dagre layout)
    let maxSubX = DETAIL_WIDTH + 120;
    if (selected.subclusters.length) {
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

      selected.subclusters.forEach((s) => g.setNode(`sub-${s.id}`, { width: SUB_WIDTH, height: SUB_HEIGHT }));
      dagre.layout(g);

      const xOffset = DETAIL_WIDTH + 120;

      selected.subclusters.forEach((s) => {
        const pos = g.node(`sub-${s.id}`);
        const nx = xOffset + (pos?.x - SUB_WIDTH / 2 || 0);
        if (nx + SUB_WIDTH > maxSubX) maxSubX = nx + SUB_WIDTH;
        const nodeId = `sub-${s.id}`;
        nodes.push({
          id: nodeId,
          type: "subNode",
          position: {
            x: nx,
            y: pos?.y - SUB_HEIGHT / 2 || 0
          },
          data: { ...s },
          style: TRANSITION_STYLE,
          draggable: false
        });
        edges.push({
          id: `e-${selectedNodeId}-${nodeId}`,
          source: selectedNodeId,
          target: nodeId,
          animated: true,
          style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5, opacity: 0.4 }
        });
      });
    }

    // Stacked parent nodes (top-right corner)
    const rest = parents.filter((p) => p.id !== selectedParent);
    const stackX = maxSubX + 80;
    const stackY = -10;

    rest.forEach((p, idx) => {
      nodes.push({
        id: `parent-${p.id}`,
        type: "parentNode",
        position: {
          x: stackX + idx * 8,
          y: stackY + idx * 5
        },
        data: {
          parentId: p.id,
          name: p.name,
          totalDemand: p.totalDemand,
          keywordCount: p.keywordCount,
          subclusterCount: p.subclusters.length,
          stacked: true,
          stackLabel: idx === 0 ? `← ${rest.length} weitere Cluster` : undefined,
          onBack,
          onSelect
        },
        style: { ...TRANSITION_STYLE, zIndex: rest.length - idx },
        draggable: false
      });
    });
  }

  return { nodes, edges };
}

/* ── Main Page Component ── */
export default function KeywordWorkspacePage() {
  const { site } = useSite();
  const { data: workspace } = useSWR<{ projectId: string; siteUrl: string | null }>(
    site ? `/api/keyword-workspace/current?siteUrl=${encodeURIComponent(site)}` : null,
    fetchJson
  );
  const projectId = workspace?.projectId ?? null;

  const [minDemand, setMinDemand] = useState(5);
  const [minDemandInput, setMinDemandInput] = useState("5");
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState(0);
  const wasRunningRef = useRef(false);
  const flowRef = useRef<ReactFlowInstance | null>(null);

  const { data: serpData, mutate: mutateSerp } = useSWR<SerpResponse>(
    projectId ? `/api/keyword-workspace/projects/${projectId}/serp-cluster?minDemand=${minDemand}` : null,
    fetchJson
  );

  const { data: statusData, mutate: mutateStatus } = useSWR<any>(
    projectId ? `/api/keyword-workspace/projects/${projectId}/serp-cluster/status` : null,
    fetchJson,
    { refreshInterval: pollInterval }
  );

  const isRunning = !!statusData?.status && ACTIVE_STATUSES.includes(statusData.status);

  useEffect(() => {
    setPollInterval(isRunning ? 2000 : 0);
  }, [isRunning]);

  useEffect(() => {
    if (isRunning) {
      wasRunningRef.current = true;
    } else if (wasRunningRef.current && statusData?.status) {
      wasRunningRef.current = false;
      if (statusData.status === "completed") {
        mutateSerp();
        toast.success("Clustering abgeschlossen!");
      } else if (statusData.status === "failed") {
        toast.error(`Clustering fehlgeschlagen: ${statusData.error ?? "Unbekannter Fehler"}`);
      }
    }
  }, [isRunning, statusData?.status, mutateSerp]);

  useEffect(() => {
    if (!SERP_DEBUG) return;
    console.groupCollapsed("[SERP][status]");
    console.debug({
      status: statusData?.status,
      zyteRequested: statusData?.zyteRequested,
      zyteSucceeded: statusData?.zyteSucceeded,
      zyteCached: statusData?.zyteCached,
      minDemand: statusData?.minDemand,
      urlOverlapThreshold: statusData?.urlOverlapThreshold,
      runId: statusData?.id,
      startedAt: statusData?.startedAt,
      finishedAt: statusData?.finishedAt
    });
    console.groupEnd();
  }, [statusData]);

  useEffect(() => {
    if (!SERP_DEBUG) return;
    console.groupCollapsed("[SERP][data]");
    console.debug({
      runId: serpData?.runId,
      generatedAt: serpData?.generatedAt,
      parents: serpData?.parents?.map((p) => ({
        id: p.id,
        name: p.name,
        totalDemand: p.totalDemand,
        keywordCount: p.keywordCount,
        subclusters: p.subclusters.length
      })),
      selectedParent
    });
    console.groupEnd();
  }, [serpData, selectedParent]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = Number(minDemandInput);
      if (!Number.isNaN(parsed)) setMinDemand(parsed);
    }, 400);
    return () => clearTimeout(timer);
  }, [minDemandInput]);

  async function triggerRun() {
    if (!projectId) return;
    try {
      if (SERP_DEBUG) {
        console.groupCollapsed("[SERP][run-trigger]");
        console.debug({ projectId, minDemand, overlapThreshold: undefined, ts: new Date().toISOString() });
        console.groupEnd();
      }
      const res = await fetch(`/api/keyword-workspace/projects/${projectId}/serp-cluster/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minDemand })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Run failed");
      }
      if (SERP_DEBUG) console.info("[SERP][run-trigger] accepted run start");
      toast.success("SERP-Clustering gestartet");
      await mutateStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Start");
      if (SERP_DEBUG) console.error("[SERP][run-trigger] failed", e);
    }
  }

  const parents = serpData?.parents ?? [];

  const handleSelect = useCallback((id: string) => setSelectedParent(id), []);
  const handleBack = useCallback(() => setSelectedParent(null), []);

  // Reliable click handler at ReactFlow level (backup for node onClick)
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type !== "parentNode") return;
      if (node.data.stacked || node.data.expanded) {
        setSelectedParent(null);
      } else if (node.data.parentId) {
        setSelectedParent(node.data.parentId);
      }
    },
    []
  );

  const { nodes: flowNodes, edges: flowEdges } = useMemo(
    () => buildFlowGraph(parents, selectedParent, handleSelect, handleBack),
    [parents, selectedParent, handleSelect, handleBack]
  );

  // fitView when nodes change
  const prevNodeKeyRef = useRef<string>("");
  useEffect(() => {
    if (!flowRef.current || !flowNodes.length) return;
    const nodeKey = `${selectedParent ?? "overview"}:${flowNodes.length}`;
    if (prevNodeKeyRef.current === nodeKey) return;
    prevNodeKeyRef.current = nodeKey;
    requestAnimationFrame(() => {
      flowRef.current?.fitView({ padding: 0.15, duration: 400 });
    });
  }, [selectedParent, flowNodes.length]);

  if (!site) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Keine Property ausgewählt</CardTitle>
        </CardHeader>
        <CardContent>Wähle oben links eine Property aus, um den Workspace zu laden.</CardContent>
      </Card>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-card">
      {serpData?.generatedAt ? (
        <div className="absolute top-3 left-3 text-[11px] text-muted-foreground z-10">
          Stand {new Date(serpData.generatedAt).toLocaleString()}
        </div>
      ) : null}

      {isRunning ? (
        <div className="h-full flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">{STATUS_LABELS[statusData?.status] ?? "Clustering läuft..."}</p>
            <p className="text-xs text-muted-foreground">Bitte warte, das kann je nach Keyword-Anzahl einige Minuten dauern.</p>
          </div>
        </div>
      ) : parents.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
          <p>Noch kein SERP-Clustering gelaufen.</p>
          <Button size="sm" onClick={triggerRun} disabled={!projectId}>
            Jetzt starten
          </Button>
        </div>
      ) : (
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          onNodeClick={handleNodeClick}
          panOnDrag
          zoomOnScroll
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={false}
          nodesConnectable={false}
          minZoom={0.3}
          maxZoom={1.5}
        >
          <Background gap={16} />
          <Controls />
        </ReactFlow>
      )}

      <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
        <div className="pointer-events-auto bg-card/90 backdrop-blur-sm border rounded-full shadow-lg px-3 py-2 flex items-center gap-2 text-xs">
          <Input
            type="number"
            className="w-24 h-8 text-xs"
            value={minDemandInput}
            onChange={(e) => setMinDemandInput(e.target.value)}
            placeholder="Min Impr."
          />
          <Button size="sm" className="h-8 gap-1" onClick={triggerRun} disabled={isRunning || !projectId}>
            <Play className="h-3 w-3" />
            {isRunning ? "Läuft" : "Clustern"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={() => Promise.all([mutateSerp(), mutateStatus()])}
            disabled={isRunning}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}
