"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import ReactFlow, { Background, Controls, Edge, Node, NodeProps } from "reactflow";
import "reactflow/dist/style.css";
import { Play, RefreshCw } from "lucide-react";
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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

function ParentNode({ data, selected }: NodeProps & { selected?: boolean }) {
  return (
    <div
      className={`rounded-lg border bg-card px-3 py-2 shadow-sm w-52 ${selected ? "border-primary ring-2 ring-primary/30" : ""}`}
    >
      <div className="text-sm font-semibold truncate">{data.name}</div>
      <div className="text-xs text-muted-foreground">Demand {Math.round(data.totalDemand)}</div>
      <div className="text-xs text-muted-foreground">Keywords {data.keywordCount}</div>
      {data.topDomains?.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {data.topDomains.slice(0, 3).map((d: string) => (
            <Badge key={d} variant="secondary" className="text-[10px]">
              {d}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubclusterNode({ data }: NodeProps) {
  return (
    <div className="rounded-lg border bg-accent px-3 py-2 shadow-sm w-60">
      <div className="text-sm font-semibold truncate">{data.name}</div>
      <div className="text-xs text-muted-foreground">
        Demand {Math.round(data.totalDemand)} · {data.keywordCount} KW
      </div>
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

export default function KeywordWorkspacePage() {
  const { site } = useSite();
  const { data: workspace } = useSWR<{ projectId: string; siteUrl: string | null }>(
    site ? `/api/keyword-workspace/current?siteUrl=${encodeURIComponent(site)}` : null,
    fetchJson
  );
  const projectId = workspace?.projectId ?? null;

  const [minDemand, setMinDemand] = useState(5);
  const [minDemandInput, setMinDemandInput] = useState("5");
  const [isRunning, setIsRunning] = useState(false);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);

  const { data: serpData, mutate: mutateSerp } = useSWR<SerpResponse>(
    projectId ? `/api/keyword-workspace/projects/${projectId}/serp-cluster?minDemand=${minDemand}` : null,
    fetchJson
  );

  const { data: statusData, mutate: mutateStatus } = useSWR<any>(
    projectId ? `/api/keyword-workspace/projects/${projectId}/serp-cluster/status` : null,
    fetchJson,
    { refreshInterval: isRunning ? 4000 : 0 }
  );

  useEffect(() => {
    if (serpData?.parents?.length && !selectedParent) {
      setSelectedParent(serpData.parents[0].id);
    }
  }, [serpData, selectedParent]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = Number(minDemandInput);
      if (!Number.isNaN(parsed)) setMinDemand(parsed);
    }, 400);
    return () => clearTimeout(timer);
  }, [minDemandInput]);

  useEffect(() => {
    if (statusData?.status === "running" || statusData?.status === "pending") {
      setIsRunning(true);
    } else if (statusData) {
      setIsRunning(false);
    }
  }, [statusData]);

  async function triggerRun() {
    if (!projectId) return;
    setIsRunning(true);
    try {
      const res = await fetch(`/api/keyword-workspace/projects/${projectId}/serp-cluster/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minDemand })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Run failed");
      }
      toast.success("SERP-Clustering gestartet");
      await mutateStatus();
      await mutateSerp();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Start");
    } finally {
      setIsRunning(false);
    }
  }

  const flowData = useMemo(() => {
    const parents = serpData?.parents ?? [];
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    parents.forEach((p, idx) => {
      nodes.push({
        id: `parent-${p.id}`,
        type: "parentNode",
        position: { x: idx * 260, y: 0 },
        data: { ...p },
        selectable: true
      });
      if (selectedParent === p.id) {
        p.subclusters.forEach((s, sIdx) => {
          nodes.push({
            id: `sub-${s.id}`,
            type: "subNode",
            position: { x: sIdx * 240, y: 220 },
            data: { ...s }
          });
          edges.push({
            id: `e-${p.id}-${s.id}`,
            source: `parent-${p.id}`,
            target: `sub-${s.id}`,
            animated: true
          });
        });
      }
    });
    return { nodes, edges };
  }, [serpData, selectedParent]);

  const selectedParentData = useMemo(
    () => serpData?.parents.find((p) => p.id === selectedParent) ?? null,
    [serpData, selectedParent]
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-28"
            value={minDemandInput}
            onChange={(e) => setMinDemandInput(e.target.value)}
            placeholder="Min Impr."
          />
          <span className="text-xs text-muted-foreground">Min Impressions (default 5)</span>
        </div>
        <Button onClick={triggerRun} disabled={isRunning || !projectId} className="gap-2">
          <Play className="h-4 w-4" />
          {isRunning ? "Läuft..." : "SERP clustern"}
        </Button>
        <Button variant="outline" onClick={() => Promise.all([mutateSerp(), mutateStatus()])} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        {statusData?.status && (
          <span className="text-xs text-muted-foreground">
            Status: {statusData.status} {statusData.error ? `· ${statusData.error}` : ""}
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Card className="h-[75vh]">
          <CardHeader>
            <CardTitle>Clustering Graph</CardTitle>
          </CardHeader>
          <CardContent className="h-[65vh]">
            {serpData?.parents?.length ? (
              <ReactFlow
                nodes={flowData.nodes}
                edges={flowData.edges}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => {
                  if (node.id.startsWith("parent-")) setSelectedParent(node.id.replace("parent-", ""));
                }}
                fitView
              >
                <Background gap={16} />
                <Controls />
              </ReactFlow>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
                <p>Noch kein SERP-Clustering gelaufen.</p>
                <Button size="sm" onClick={triggerRun} disabled={isRunning || !projectId}>
                  Jetzt starten
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-[75vh]">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedParentData ? (
              <>
                <div>
                  <div className="text-base font-semibold">{selectedParentData.name}</div>
                  <div className="text-sm text-muted-foreground">
                    Demand {Math.round(selectedParentData.totalDemand)} · Keywords {selectedParentData.keywordCount}
                  </div>
                  {selectedParentData.topDomains?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selectedParentData.topDomains.map((d) => (
                        <Badge key={d} variant="secondary" className="text-[10px]">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <ScrollArea className="h-[55vh] pr-2">
                  <div className="space-y-3">
                    {selectedParentData.subclusters.map((s) => (
                      <div key={s.id} className="rounded border p-2">
                        <div className="font-semibold text-sm">{s.name}</div>
                        <div className="text-xs text-muted-foreground mb-2">
                          Demand {Math.round(s.totalDemand)} · {s.keywordCount} Keywords
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          {s.keywords.map((k) => (
                            <div key={k.id} className="flex justify-between gap-2">
                              <span className="truncate">{k.kwRaw}</span>
                              <span>{Math.round(k.demandMonthly)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Wähle einen Parent-Cluster.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
