"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function ParentNode({ data, selected }: NodeProps & { selected?: boolean }) {
  return (
    <div
      className={`rounded-lg border bg-card px-3 py-2 shadow-sm w-56 transition-all duration-200 ${
        selected ? "border-primary ring-2 ring-primary/30 scale-[1.02]" : ""
      }`}
    >
      <div className="text-sm font-semibold truncate">{data.name}</div>
      <div className="text-xs text-muted-foreground">Demand {Math.round(data.totalDemand)}</div>
      <div className="text-xs text-muted-foreground">Keywords {data.keywordCount}</div>
    </div>
  );
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
  parentNode: ParentNode,
  subNode: SubclusterNode
};

const PARENT_WIDTH = 224;
const PARENT_HEIGHT = 110;
const SUB_WIDTH = 260;
const SUB_HEIGHT = 150;

function layoutFlow(parents: SerpParent[], selectedParent: string | null) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 80, ranksep: 140 });

  parents.forEach((p) => g.setNode(`parent-${p.id}`, { width: PARENT_WIDTH, height: PARENT_HEIGHT }));
  // chain parents lightly so dagre keeps spacing even without edges
  for (let i = 0; i < parents.length - 1; i++) {
    g.setEdge(`parent-${parents[i].id}`, `parent-${parents[i + 1].id}`, { weight: 0.0001 });
  }

  const edges: Edge[] = [];
  const nodes: Node[] = parents.map((p) => ({
    id: `parent-${p.id}`,
    type: "parentNode",
    data: { ...p },
    position: { x: 0, y: 0 },
    selectable: true
  }));

  if (selectedParent) {
    const parent = parents.find((p) => p.id === selectedParent);
    parent?.subclusters.forEach((s) => {
      const subId = `sub-${s.id}`;
      g.setNode(subId, { width: SUB_WIDTH, height: SUB_HEIGHT });
      g.setEdge(`parent-${selectedParent}`, subId);
    });
  }

  dagre.layout(g);

  nodes.forEach((n) => {
    const pos = g.node(n.id);
    n.position = { x: pos.x - (PARENT_WIDTH / 2), y: pos.y - (PARENT_HEIGHT / 2) };
  });

  if (selectedParent) {
    const parent = parents.find((p) => p.id === selectedParent);
    parent?.subclusters.forEach((s) => {
      const subId = `sub-${s.id}`;
      const pos = g.node(subId);
      nodes.push({
        id: subId,
        type: "subNode",
        data: { ...s },
        position: { x: pos.x - (SUB_WIDTH / 2), y: pos.y - (SUB_HEIGHT / 2) }
      });
      edges.push({
        id: `e-${parent.id}-${s.id}`,
        source: `parent-${parent.id}`,
        target: subId,
        animated: true
      });
    });
  }

  return { nodes, edges };
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
  const [pollInterval, setPollInterval] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
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

  const flowData = useMemo(() => {
    const parents = serpData?.parents ?? [];
    return layoutFlow(parents, selectedParent);
  }, [serpData, selectedParent]);

  useEffect(() => {
    if (!flowRef.current) return;
    if (!serpData?.runId) return;
    const fitKey = `${serpData.runId}:${selectedParent ?? "none"}:${flowData.nodes.length}`;
    if (lastFitKeyRef.current === fitKey) return;
    lastFitKeyRef.current = fitKey;
    requestAnimationFrame(() => {
      flowRef.current?.fitView({ padding: 0.2, duration: 300 });
    });
  }, [serpData?.runId, selectedParent, flowData.nodes.length]);

  const selectedParentData = useMemo(
    () => serpData?.parents.find((p) => p.id === selectedParent) ?? null,
    [serpData, selectedParent]
  );

  if (!site) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Keine Property ausgew\u00e4hlt</CardTitle>
        </CardHeader>
        <CardContent>W\u00e4hle oben links eine Property aus, um den Workspace zu laden.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-24"
            value={minDemandInput}
            onChange={(e) => setMinDemandInput(e.target.value)}
            placeholder="Min Impr."
          />
          <span className="text-xs text-muted-foreground">Min Impressions</span>
        </div>
        <Button onClick={triggerRun} disabled={isRunning || !projectId} className="gap-2">
          <Play className="h-4 w-4" />
          {isRunning ? "Läuft..." : "SERP clustern"}
        </Button>
        <Button
          variant="outline"
          onClick={() => Promise.all([mutateSerp(), mutateStatus()])}
          disabled={isRunning}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card className="h-[78vh]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Clustering Graph</CardTitle>
          {serpData?.generatedAt ? (
            <span className="text-xs text-muted-foreground">Stand {new Date(serpData.generatedAt).toLocaleString()}</span>
          ) : null}
        </CardHeader>
        <CardContent className="relative h-[68vh]">
          {isRunning ? (
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">{STATUS_LABELS[statusData?.status] ?? "Clustering läuft..."}</p>
                <p className="text-xs text-muted-foreground">Bitte warte, das kann je nach Keyword-Anzahl einige Minuten dauern.</p>
              </div>
            </div>
          ) : serpData?.parents?.length ? (
            <>
              <ReactFlow
                nodes={flowData.nodes}
                edges={flowData.edges}
                nodeTypes={nodeTypes}
                onInit={(instance) => {
                  flowRef.current = instance;
                }}
                onNodeClick={(_, node) => {
                  if (node.id.startsWith("parent-")) setSelectedParent(node.id.replace("parent-", ""));
                }}
                className="h-full"
              >
                <Background gap={16} />
                <Controls />
              </ReactFlow>
              <Button
                size="icon"
                className="absolute bottom-4 right-4 h-12 w-12 rounded-full shadow-lg"
                onClick={() => setShowSidebar((p) => !p)}
                variant="secondary"
              >
                <span className="sr-only">Details öffnen</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              </Button>
              {showSidebar && (
                <div className="absolute inset-y-4 right-4 w-[340px] max-w-[90vw] rounded-lg border bg-card shadow-2xl backdrop-blur-md overflow-hidden z-10 animate-in slide-in-from-right">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <div>
                      <div className="text-base font-semibold">{selectedParentData?.name ?? "Details"}</div>
                      {selectedParentData ? (
                        <div className="text-xs text-muted-foreground">
                          Demand {Math.round(selectedParentData.totalDemand)} · Keywords {selectedParentData.keywordCount}
                        </div>
                      ) : null}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setShowSidebar(false)}>
                      ✕
                    </Button>
                  </div>
                  <div className="px-4 py-3 text-xs text-muted-foreground">
                    {selectedParentData?.topDomains?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {selectedParentData.topDomains.map((d) => (
                          <Badge key={d} variant="secondary" className="text-[10px]">
                            {d}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {selectedParentData ? (
                      <div className="mt-1">
                        {selectedParentData.subclusters.length} Subcluster · Ø Overlap{" "}
                        {selectedParentData.subclusters.length
                          ? Math.round(
                              (selectedParentData.subclusters.reduce((s, c) => s + (c.overlapScore ?? 0), 0) /
                                selectedParentData.subclusters.length) *
                                100
                            )
                          : 0}
                        %
                      </div>
                    ) : null}
                  </div>
                  <ScrollArea className="h-[55vh] px-4 pb-4">
                    <div className="space-y-3">
                      {selectedParentData ? (
                        selectedParentData.subclusters.map((s) => (
                          <div key={s.id} className="rounded border p-2 bg-muted/40">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-sm">{s.name}</div>
                              <span className="text-[11px] text-muted-foreground">
                                {Math.round(s.totalDemand)} · {s.keywordCount} KW
                              </span>
                            </div>
                            {s.topDomains?.length ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {s.topDomains.slice(0, 3).map((d) => (
                                  <Badge key={d} variant="outline" className="text-[10px]">
                                    {d}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                            <div className="space-y-1 text-xs text-muted-foreground mt-2">
                              {s.keywords.map((k) => (
                                <div key={k.id} className="flex justify-between gap-2">
                                  <span className="truncate">{k.kwRaw}</span>
                                  <span>{Math.round(k.demandMonthly)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Wähle einen Parent-Cluster.</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
              {statusData?.status === "failed" ? (
                <>
                  <p>Letztes Clustering fehlgeschlagen: {statusData.error}</p>
                  <Button size="sm" onClick={triggerRun} disabled={!projectId}>
                    Erneut versuchen
                  </Button>
                </>
              ) : (
                <>
                  <p>Noch kein SERP-Clustering gelaufen.</p>
                  <Button size="sm" onClick={triggerRun} disabled={!projectId}>
                    Jetzt starten
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
