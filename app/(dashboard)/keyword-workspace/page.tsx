"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import ReactFlow, { Background, Controls, Edge, Node, NodeProps, ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import { Loader2, Play, RefreshCw } from "lucide-react";
import dagre from "dagre";
import { AnimatePresence, motion } from "framer-motion";
import { useSite } from "@/components/dashboard/site-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
  running: "Clustering l\u00e4uft..."
};

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

function SubclusterNode({ data }: NodeProps) {
  return (
    <div className="rounded-lg border bg-accent px-3 py-2 shadow-sm w-64 transition-all duration-200 hover:-translate-y-1">
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
  subNode: SubclusterNode
};

const SUB_WIDTH = 260;
const SUB_HEIGHT = 150;

function buildSubclusterFlow(parent: SerpParent | null) {
  if (!parent) return { nodes: [] as Node[], edges: [] as Edge[] };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 80 });

  parent.subclusters.forEach((s) => g.setNode(`sub-${s.id}`, { width: SUB_WIDTH, height: SUB_HEIGHT }));

  dagre.layout(g);

  const nodes: Node[] = parent.subclusters.map((s) => {
    const pos = g.node(`sub-${s.id}`);
    return {
      id: `sub-${s.id}`,
      type: "subNode",
      data: { ...s },
      position: { x: pos?.x - SUB_WIDTH / 2 || 0, y: pos?.y - SUB_HEIGHT / 2 || 0 }
    };
  });

  return { nodes, edges: [] as Edge[] };
}

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
  const [viewMode, setViewMode] = useState<"overview" | "focus">("overview");
  const [pollInterval, setPollInterval] = useState(0);
  const wasRunningRef = useRef(false);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const lastFitKeyRef = useRef<string>("");

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

  // Control polling based on status
  useEffect(() => {
    setPollInterval(isRunning ? 2000 : 0);
  }, [isRunning]);

  // Auto-refresh data when clustering finishes
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
    if (serpData?.parents?.length && !selectedParent) {
      setSelectedParent(serpData.parents[0].id);
    }
  }, [serpData, selectedParent]);

  // Debug dumps
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
  const selectedParentData = parents.find((p) => p.id === selectedParent) ?? null;

  const subFlow = useMemo(() => buildSubclusterFlow(selectedParentData), [selectedParentData]);

  useEffect(() => {
    if (!flowRef.current) return;
    if (!serpData?.runId) return;
    if (!subFlow.nodes.length) return;
    const fitKey = `${serpData.runId}:${selectedParent ?? "none"}:${subFlow.nodes.length}`;
    if (lastFitKeyRef.current === fitKey) return;
    lastFitKeyRef.current = fitKey;
    requestAnimationFrame(() => {
      flowRef.current?.fitView({ padding: 0.2, duration: 300 });
    });
  }, [serpData?.runId, selectedParent, subFlow.nodes.length]);

  const keywordsFlat = useMemo(() => {
    if (!selectedParentData) return [];
    const all = selectedParentData.subclusters.flatMap((s) => s.keywords);
    return all.sort((a, b) => (b.demandMonthly ?? 0) - (a.demandMonthly ?? 0)).slice(0, 50);
  }, [selectedParentData]);

  const restParents = useMemo(() => parents.filter((p) => p.id !== selectedParent), [parents, selectedParent]);

  const overviewCards = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      <AnimatePresence>
        {parents.map((p) => (
          <motion.div
            key={p.id}
            layoutId={`parent-${p.id}`}
            layout
            className="rounded-lg border bg-card p-3 shadow-sm cursor-pointer hover:shadow-md transition"
            whileHover={{ scale: 1.02 }}
            onClick={() => {
              setSelectedParent(p.id);
              setViewMode("focus");
            }}
          >
            <div className="text-sm font-semibold truncate">{p.name}</div>
            <div className="text-xs text-muted-foreground">Demand {Math.round(p.totalDemand)}</div>
            <div className="text-xs text-muted-foreground">Keywords {p.keywordCount}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  const stackBlock = (
    <AnimatePresence>
      {viewMode === "focus" && restParents.length ? (
        <motion.div
          className="absolute top-4 right-4 z-20 cursor-pointer select-none"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          onClick={() => {
            setViewMode("overview");
            setSelectedParent(null);
          }}
        >
          <div className="text-[11px] text-muted-foreground text-right mb-1">Alle Parent-Cluster</div>
          <div className="relative w-44 h-16">
            {restParents.slice(0, 3).map((p, idx) => (
              <motion.div
                key={p.id}
                layoutId={`parent-${p.id}`}
                className="absolute inset-0 rounded-lg border bg-card p-2 shadow-md"
                style={{ top: idx * 6, right: idx * 10, scale: 0.6 }}
                whileHover={{ scale: 0.63 }}
              >
                <div className="text-xs font-semibold truncate">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">KW {p.keywordCount}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const focusPanel = selectedParentData ? (
    <motion.div
      layoutId={`parent-${selectedParentData.id}`}
      className="absolute z-10 rounded-lg border bg-card shadow-2xl p-4 overflow-auto"
      style={{ top: "10vh", left: "3vw", width: "30vw", maxHeight: "70vh" }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold leading-tight">{selectedParentData.name}</div>
          <div className="text-sm text-muted-foreground">
            Demand {Math.round(selectedParentData.totalDemand)} · Keywords {selectedParentData.keywordCount}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setViewMode("overview")}>
          Zurück
        </Button>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        {selectedParentData.subclusters.length} Subcluster
      </div>
      <div className="mt-3 space-y-1">
        <div className="text-sm font-medium">Keywords (Top 50)</div>
        <ScrollArea className="h-[320px] rounded border">
          <div className="p-3 space-y-1 text-sm text-muted-foreground">
            {keywordsFlat.map((k) => (
              <div key={k.id} className="flex justify-between gap-2">
                <span className="truncate">{k.kwRaw}</span>
                <span>{Math.round(k.demandMonthly)}</span>
              </div>
            ))}
            {selectedParentData.keywordCount > keywordsFlat.length ? (
              <div className="text-xs text-muted-foreground mt-2">
                +{selectedParentData.keywordCount - keywordsFlat.length} weitere
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </motion.div>
  ) : null;

  const focusSubclusters = (
    <div className="w-full h-full">
      <ReactFlow
        nodes={subFlow.nodes}
        edges={subFlow.edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        className="h-full"
        panOnDrag
        zoomOnScroll
      >
        <Background gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );

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
      ) : viewMode === "overview" ? (
        <div className="h-full overflow-auto pb-16 p-4">{overviewCards}</div>
      ) : (
        <div className="h-full relative">
          {stackBlock}
          <AnimatePresence>{focusPanel}</AnimatePresence>
          <div className="absolute inset-0 pl-[36vw] pt-6 pr-4 pb-12">
            {subFlow.nodes.length ? (
              focusSubclusters
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Keine Subcluster gefunden.
              </div>
            )}
          </div>
        </div>
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
