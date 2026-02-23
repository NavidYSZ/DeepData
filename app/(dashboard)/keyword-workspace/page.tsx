"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import ReactFlow, { Background, Controls, Edge, Node, NodeProps, ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import { LayoutGrid, Loader2, Menu, Play, RefreshCw, Upload } from "lucide-react";
import dagre from "dagre";
import { useSite } from "@/components/dashboard/site-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { UploadKeywordsDialog } from "@/components/keyword-workspace/upload-dialog";
import { ExternalBadge } from "@/components/keyword-workspace/external-badge";

type SerpKeyword = { id: string; kwRaw: string; demandMonthly: number; demandSource?: string };
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
const FLOW_ANIM_MS = 560;
const FLOW_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const OVERVIEW_STAGGER_MS = 14;
const DOCK_STAGGER_MS = 22;
const FITVIEW_ANIM_MS = 420;
const FLOW_OUT_MS = 420;
const FLOW_OUT_STAGGER_MS = 24;
const FITVIEW_DELAY_MS = 120;
const PARENT_MORPH_MS = 480;

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

/* ── Custom Node: Parent (unified – compact / expanded / docked) ── */
function ParentNode({ data }: NodeProps) {
  /* ── Expanded detail view (selected parent) ── */
  if (data.expanded) {
    const keywords: SerpKeyword[] = data.keywordsFlat ?? [];
    return (
      <div
        className="rounded-lg border bg-card shadow-2xl p-4 w-[360px] max-h-[520px] overflow-hidden flex flex-col transition-[transform,opacity,width,height] duration-[480ms]"
        style={{ transitionTimingFunction: FLOW_EASING }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold leading-tight">{data.name}</div>
            <div className="text-sm text-muted-foreground">
              Demand {Math.round(data.totalDemand)} · Keywords {data.keywordCount}
            </div>
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {data.subclusterCount} Subcluster
        </div>
        <div className="mt-3 space-y-1 flex-1 min-h-0">
          <div className="text-sm font-medium">Keywords</div>
          <ScrollArea className="h-[340px] rounded border">
            <div className="p-3 space-y-1 text-sm text-muted-foreground">
              {keywords.map((k) => (
                <div key={k.id} className="flex justify-between gap-2">
                  <span className="truncate flex items-center gap-1">
                    {k.demandSource === "upload" && <ExternalBadge />}
                    {k.kwRaw}
                  </span>
                  <span>{Math.round(k.demandMonthly)}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  /* ── Normal compact card (overview grid) ── */
  const isDocked = !!data.docked;
  const isClickFeedback = !!data.clickFeedback;
  return (
    <div
      className={[
        "rounded-lg border bg-card p-3 shadow-sm w-[280px] will-change-[transform,opacity] transition-[transform,opacity,width,height] duration-[480ms]",
        isDocked
          ? "opacity-0 scale-[0.8] pointer-events-none"
          : isClickFeedback
            ? "opacity-100 scale-[0.97] cursor-pointer shadow-md"
            : "opacity-100 scale-100 cursor-pointer hover:shadow-md hover:-translate-y-1"
      ].join(" ")}
      onClick={() => {
        if (isDocked) return;
        data.onSelect?.(data.parentId);
      }}
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
  const isVisible = data.reveal !== false;
  const delayMs = typeof data.delayMs === "number" ? `${data.delayMs}ms` : undefined;
  return (
    <div
      className={[
        "rounded-lg border bg-accent px-3 py-2 shadow-sm w-64 transition-[opacity,transform] duration-300",
        isVisible ? "opacity-100 translate-x-0 hover:-translate-y-1" : "opacity-0 translate-x-6 pointer-events-none"
      ].join(" ")}
      style={{ transitionDelay: delayMs }}
    >
      <div className="text-sm font-semibold truncate">{data.name}</div>
      <div className="text-xs text-muted-foreground">
        Demand {Math.round(data.totalDemand)} · {data.keywordCount} KW
      </div>
      {typeof data.overlapScore === "number" ? (
        <div className="text-[11px] text-muted-foreground">Avg Overlap {(data.overlapScore * 100).toFixed(0)}%</div>
      ) : null}
      <ScrollArea className="mt-1 max-h-32">
        <div className="text-xs text-muted-foreground space-y-0.5 pr-1">
          {data.keywords?.map((k: SerpKeyword) => (
            <div key={k.id} className="flex justify-between gap-1">
              <span className="truncate flex items-center gap-1">
                {k.demandSource === "upload" && <ExternalBadge />}
                {k.kwRaw}
              </span>
              <span>{Math.round(k.demandMonthly)}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
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
  dockTarget: { x: number; y: number } | null,
  clickFeedbackParentId: string | null,
  revealSubclusters: boolean
): { nodes: Node[]; edges: Edge[] } {
  if (!parents.length) return { nodes: [], edges: [] };

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const transitionStyle = (delayMs = 0, durationMs = FLOW_ANIM_MS) => ({
    transitionProperty: "transform, opacity",
    transitionDuration: `${durationMs}ms`,
    transitionTimingFunction: FLOW_EASING,
    transitionDelay: `${delayMs}ms`
  });

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
          clickFeedback: clickFeedbackParentId === p.id,
          onSelect
        },
        style: transitionStyle(idx * OVERVIEW_STAGGER_MS),
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
      .sort((a, b) => (b.demandMonthly ?? 0) - (a.demandMonthly ?? 0));

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
        onSelect
      },
      style: { ...transitionStyle(), zIndex: 10 },
      draggable: false
    });

    // Subcluster nodes (right, dagre layout)
    let maxSubX = DETAIL_WIDTH + 120;
    const sortedSubclusters = [...selected.subclusters].sort((a, b) => (b.totalDemand ?? 0) - (a.totalDemand ?? 0));
    if (sortedSubclusters.length) {
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

      sortedSubclusters.forEach((s) => g.setNode(`sub-${s.id}`, { width: SUB_WIDTH, height: SUB_HEIGHT }));
      dagre.layout(g);

      const xOffset = DETAIL_WIDTH + 120;

      sortedSubclusters.forEach((s, idx) => {
        const pos = g.node(`sub-${s.id}`);
        const nx = xOffset + (pos?.x - SUB_WIDTH / 2 || 0);
        if (nx + SUB_WIDTH > maxSubX) maxSubX = nx + SUB_WIDTH;
        const nodeId = `sub-${s.id}`;
        const keywordsSorted = [...(s.keywords ?? [])].sort((a, b) => (b.demandMonthly ?? 0) - (a.demandMonthly ?? 0));
        nodes.push({
          id: nodeId,
          type: "subNode",
          position: {
            x: nx,
            y: pos?.y - SUB_HEIGHT / 2 || 0
          },
          data: { ...s, keywords: keywordsSorted, reveal: revealSubclusters, delayMs: revealSubclusters ? idx * 45 : 0 },
          style: transitionStyle(),
          draggable: false
        });
      });
      if (revealSubclusters) {
        sortedSubclusters.forEach((s) => {
          const nodeId = `sub-${s.id}`;
          edges.push({
            id: `e-${selectedNodeId}-${nodeId}`,
            source: selectedNodeId,
            target: nodeId,
            animated: true,
            style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5, opacity: 0.4 }
          });
        });
      }
    }

    // Dock remaining parent nodes into top-right return button target
    const rest = parents.filter((p) => p.id !== selectedParent);
    const dockX = (dockTarget?.x ?? maxSubX + 120) - PARENT_WIDTH / 2;
    const dockY = (dockTarget?.y ?? 0) - PARENT_HEIGHT / 2;

    rest.forEach((p, idx) => {
      nodes.push({
        id: `parent-${p.id}`,
        type: "parentNode",
        position: {
          x: dockX,
          y: dockY
        },
        data: {
          parentId: p.id,
          name: p.name,
          totalDemand: p.totalDemand,
          keywordCount: p.keywordCount,
          subclusterCount: p.subclusters.length,
          docked: true,
          onSelect
        },
        style: { ...transitionStyle(idx * FLOW_OUT_STAGGER_MS, FLOW_OUT_MS), zIndex: 1 },
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

  const [uploadOpen, setUploadOpen] = useState(false);
  const [minDemand, setMinDemand] = useState(5);
  const [minDemandInput, setMinDemandInput] = useState("5");
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [clickFeedbackParentId, setClickFeedbackParentId] = useState<string | null>(null);
  const [revealSubclusters, setRevealSubclusters] = useState(false);
  const [pollInterval, setPollInterval] = useState(0);
  const wasRunningRef = useRef(false);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [dockTarget, setDockTarget] = useState<{ x: number; y: number } | null>(null);
  const selectTimerRef = useRef<number | null>(null);

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

  const updateDockTarget = useCallback(() => {
    if (!flowRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const buttonSize = 44;
    const offset = 16;
    const flowPoint = flowRef.current.screenToFlowPosition({
      x: rect.right - offset - buttonSize / 2,
      y: rect.top + offset + buttonSize / 2
    });
    setDockTarget((previous) => {
      if (!previous) return flowPoint;
      if (Math.abs(previous.x - flowPoint.x) < 0.5 && Math.abs(previous.y - flowPoint.y) < 0.5) return previous;
      return flowPoint;
    });
  }, []);

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

  const handleSelect = useCallback((id: string) => {
    setClickFeedbackParentId(id);
    if (selectTimerRef.current) window.clearTimeout(selectTimerRef.current);
    selectTimerRef.current = window.setTimeout(() => {
      setSelectedParent(id);
      setClickFeedbackParentId(null);
      selectTimerRef.current = null;
    }, 130);
  }, []);

  const handleBack = useCallback(() => {
    if (selectTimerRef.current) {
      window.clearTimeout(selectTimerRef.current);
      selectTimerRef.current = null;
    }
    setClickFeedbackParentId(null);
    setSelectedParent(null);
  }, []);

  // Reliable click handler at ReactFlow level (backup for node onClick)
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (selectedParent) return;
      if (node.type !== "parentNode") return;
      if (node.data.parentId) {
        handleSelect(node.data.parentId);
      }
    },
    [selectedParent, handleSelect]
  );

  const { nodes: flowNodes, edges: flowEdges } = useMemo(
    () =>
      buildFlowGraph(
        parents,
        selectedParent,
        handleSelect,
        dockTarget,
        clickFeedbackParentId,
        revealSubclusters
      ),
    [parents, selectedParent, handleSelect, dockTarget, clickFeedbackParentId, revealSubclusters]
  );

  useEffect(() => {
    if (!selectedParent) {
      setRevealSubclusters(false);
      return;
    }
    setRevealSubclusters(false);
    const timerId = window.setTimeout(() => setRevealSubclusters(true), 280);
    return () => window.clearTimeout(timerId);
  }, [selectedParent]);

  useEffect(
    () => () => {
      if (selectTimerRef.current) window.clearTimeout(selectTimerRef.current);
    },
    []
  );

  // fitView when nodes change
  const prevNodeKeyRef = useRef<string>("");
  useEffect(() => {
    if (!flowRef.current || !flowNodes.length) return;
    const nodeKey = `${selectedParent ?? "overview"}:${flowNodes.length}`;
    if (prevNodeKeyRef.current === nodeKey) return;
    prevNodeKeyRef.current = nodeKey;

    const visibleNodeIds = selectedParent
      ? flowNodes
          .filter((node) => node.id === `parent-${selectedParent}` || node.type === "subNode")
          .map((node) => ({ id: node.id }))
      : flowNodes.map((node) => ({ id: node.id }));

    const delay = selectedParent ? FITVIEW_DELAY_MS : 0;
    const timer = window.setTimeout(() => {
      requestAnimationFrame(() => {
        flowRef.current?.fitView({ padding: 0.15, duration: FITVIEW_ANIM_MS, nodes: visibleNodeIds });
        window.setTimeout(() => {
          requestAnimationFrame(() => updateDockTarget());
        }, FITVIEW_ANIM_MS + 20);
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [selectedParent, flowNodes, updateDockTarget]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => updateDockTarget());
    return () => cancelAnimationFrame(rafId);
  }, [selectedParent, updateDockTarget]);

  useEffect(() => {
    window.addEventListener("resize", updateDockTarget);
    return () => window.removeEventListener("resize", updateDockTarget);
  }, [updateDockTarget]);

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
    <div ref={canvasRef} className="relative h-full w-full overflow-hidden bg-card">
      {serpData?.generatedAt ? (
        <div className="absolute top-3 left-3 text-[11px] text-muted-foreground z-10">
          Stand {new Date(serpData.generatedAt).toLocaleString()}
        </div>
      ) : null}

      <div className="absolute top-4 right-4 z-20 flex gap-2">
        {selectedParent && !isRunning && parents.length > 0 ? (
          <Button
            type="button"
            size="icon"
            className="h-11 w-11 rounded-full border border-primary/70 bg-primary text-primary-foreground shadow-2xl transition-transform duration-200 hover:scale-105"
            onClick={handleBack}
            aria-label="Zur Parent-Cluster-Übersicht"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          type="button"
          size="icon"
          className="h-11 w-11 rounded-full border border-primary/70 bg-primary text-primary-foreground shadow-2xl transition-transform duration-200 hover:scale-105"
          aria-label="Menü"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

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
            requestAnimationFrame(() => updateDockTarget());
          }}
          onNodeClick={handleNodeClick}
          onMoveEnd={() => updateDockTarget()}
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
            onClick={() => setUploadOpen(true)}
            disabled={isRunning || !projectId}
          >
            <Upload className="h-3 w-3" />
            Import
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

      {projectId && (
        <UploadKeywordsDialog
          projectId={projectId}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onImportComplete={() => {
            mutateSerp();
            mutateStatus();
          }}
        />
      )}
    </div>
  );
}
