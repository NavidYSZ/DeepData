"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import ReactFlow, { Background, Controls, Edge, Node, NodeProps, ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import * as XLSX from "xlsx";
import { ChevronDown, Columns3, Download, FileSpreadsheet, FileText, LayoutGrid, Loader2, Menu, Play, RefreshCw, Settings2, Upload } from "lucide-react";
import dagre from "dagre";
import { useSite } from "@/components/dashboard/site-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
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
type ExportScope = "all" | "current";
type ExportFormat = "xlsx" | "csv";
type KeywordClusterExportRow = {
  topicalCluster: string;
  cluster: string;
  keyword: string;
  demandMonthly: number;
  demandSource: string;
  clusterTotalDemand: number;
  topicalTotalDemand: number;
  clusterKeywordCount: number;
  topicalKeywordCount: number;
  overlapScore: number | "";
};
type KeywordExportColumn = { key: keyof KeywordClusterExportRow; header: string; width: number };
type OptionalKeywordExportColumnKey = Exclude<keyof KeywordClusterExportRow, "topicalCluster" | "cluster" | "keyword">;

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
const SUB_MIN_W = 260;
const SUB_MAX_W = 380;
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
const FIXED_KEYWORD_EXPORT_COLUMNS: KeywordExportColumn[] = [
  { key: "topicalCluster", header: "Topical Cluster", width: 30 },
  { key: "cluster", header: "Cluster", width: 30 },
  { key: "keyword", header: "Keyword", width: 38 }
];
const OPTIONAL_KEYWORD_EXPORT_COLUMNS: Array<KeywordExportColumn & { key: OptionalKeywordExportColumnKey }> = [
  { key: "demandMonthly", header: "Demand Monthly", width: 16 },
  { key: "demandSource", header: "Demand Source", width: 15 },
  { key: "clusterTotalDemand", header: "Cluster Demand", width: 16 },
  { key: "topicalTotalDemand", header: "Topical Demand", width: 16 },
  { key: "clusterKeywordCount", header: "Cluster Keywords", width: 16 },
  { key: "topicalKeywordCount", header: "Topical Keywords", width: 16 },
  { key: "overlapScore", header: "Overlap Score", width: 14 }
];
const DEFAULT_OPTIONAL_COLUMN_KEYS: OptionalKeywordExportColumnKey[] = OPTIONAL_KEYWORD_EXPORT_COLUMNS.map((column) => column.key);

function slugifyFilenamePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "export";
}

function buildKeywordExportRows(parents: SerpParent[]): KeywordClusterExportRow[] {
  const rows: KeywordClusterExportRow[] = [];
  for (const parent of parents) {
    for (const subcluster of parent.subclusters) {
      for (const keyword of subcluster.keywords) {
        rows.push({
          topicalCluster: parent.name,
          cluster: subcluster.name,
          keyword: keyword.kwRaw,
          demandMonthly: Math.round(keyword.demandMonthly ?? 0),
          demandSource: keyword.demandSource ?? "none",
          clusterTotalDemand: Math.round(subcluster.totalDemand ?? 0),
          topicalTotalDemand: Math.round(parent.totalDemand ?? 0),
          clusterKeywordCount: subcluster.keywordCount ?? 0,
          topicalKeywordCount: parent.keywordCount ?? 0,
          overlapScore: typeof subcluster.overlapScore === "number" ? Number(subcluster.overlapScore.toFixed(3)) : ""
        });
      }
    }
  }
  return rows;
}

function serializeKeywordExportRows(
  rows: KeywordClusterExportRow[],
  columns: KeywordExportColumn[]
): Array<Record<string, string | number>> {
  return rows.map((row) => {
    const record: Record<string, string | number> = {};
    for (const column of columns) {
      const value = row[column.key];
      record[column.header] = value === null || value === undefined ? "" : value;
    }
    return record;
  });
}

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
                <div key={k.id} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    {k.demandSource === "upload" && <ExternalBadge />}
                    <span className="truncate">{k.kwRaw}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{Math.round(k.demandMonthly)}</span>
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
        "rounded-lg border bg-accent px-3 py-2 shadow-sm transition-[opacity,transform] duration-300",
        isVisible ? "opacity-100 translate-x-0 hover:-translate-y-1" : "opacity-0 translate-x-6 pointer-events-none"
      ].join(" ")}
      style={{ width: data.subWidth ?? 256, minWidth: 256, transitionDelay: delayMs }}
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
            <div key={k.id} className="flex min-w-0 items-center justify-between gap-1">
              <span className="flex min-w-0 flex-1 items-center gap-1">
                {k.demandSource === "upload" && <ExternalBadge />}
                <span className="truncate">{k.kwRaw}</span>
              </span>
              <span className="shrink-0 tabular-nums">{Math.round(k.demandMonthly)}</span>
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

/* ── Estimate optimal subcluster node width based on longest keyword ── */
function estimateSubWidth(keywords: SerpKeyword[]): number {
  if (!keywords.length) return SUB_MIN_W;
  const longest = Math.max(
    ...keywords.map((k) => {
      const badgeW = k.demandSource === "upload" ? 20 : 0;
      // ~6.5px per char at text-xs, + badge + gap + demand number + container padding
      return k.kwRaw.length * 6.5 + badgeW + 54;
    })
  );
  return Math.min(Math.max(Math.ceil(longest), SUB_MIN_W), SUB_MAX_W);
}

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

      const subWidths = new Map<string, number>();
      sortedSubclusters.forEach((s) => {
        const w = estimateSubWidth(s.keywords ?? []);
        subWidths.set(s.id, w);
        g.setNode(`sub-${s.id}`, { width: w, height: SUB_HEIGHT });
      });
      dagre.layout(g);

      const xOffset = DETAIL_WIDTH + 120;

      sortedSubclusters.forEach((s, idx) => {
        const subW = subWidths.get(s.id) ?? SUB_MIN_W;
        const pos = g.node(`sub-${s.id}`);
        const nx = xOffset + (pos?.x - subW / 2 || 0);
        if (nx + subW > maxSubX) maxSubX = nx + subW;
        const nodeId = `sub-${s.id}`;
        const keywordsSorted = [...(s.keywords ?? [])].sort((a, b) => (b.demandMonthly ?? 0) - (a.demandMonthly ?? 0));
        nodes.push({
          id: nodeId,
          type: "subNode",
          position: {
            x: nx,
            y: pos?.y - SUB_HEIGHT / 2 || 0
          },
          data: { ...s, keywords: keywordsSorted, subWidth: subW, reveal: revealSubclusters, delayMs: revealSubclusters ? idx * 45 : 0 },
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
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");
  const [selectedOptionalColumns, setSelectedOptionalColumns] = useState<OptionalKeywordExportColumnKey[]>(DEFAULT_OPTIONAL_COLUMN_KEYS);
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
  const currentParent = useMemo(
    () => (selectedParent ? parents.find((parent) => parent.id === selectedParent) ?? null : null),
    [parents, selectedParent]
  );
  const scopedParentsForExport = useMemo(() => {
    if (exportScope === "all" || !currentParent) return parents;
    return [currentParent];
  }, [exportScope, currentParent, parents]);
  const scopedExportRows = useMemo(() => buildKeywordExportRows(scopedParentsForExport), [scopedParentsForExport]);
  const activeExportColumns = useMemo<KeywordExportColumn[]>(
    () => [
      ...FIXED_KEYWORD_EXPORT_COLUMNS,
      ...OPTIONAL_KEYWORD_EXPORT_COLUMNS.filter((column) => selectedOptionalColumns.includes(column.key))
    ],
    [selectedOptionalColumns]
  );
  const selectedOptionalColumnCount = selectedOptionalColumns.length;
  const selectedOptionalColumnLabel =
    selectedOptionalColumnCount === 0
      ? "Keine Zusatzspalten"
      : `${selectedOptionalColumnCount} von ${OPTIONAL_KEYWORD_EXPORT_COLUMNS.length} Zusatzspalten`;
  const exportStats = useMemo(() => {
    const clusterCount = scopedParentsForExport.reduce((sum, parent) => sum + parent.subclusters.length, 0);
    return {
      topicalClusterCount: scopedParentsForExport.length,
      clusterCount,
      keywordCount: scopedExportRows.length
    };
  }, [scopedParentsForExport, scopedExportRows.length]);

  const exportKeywordClusters = useCallback(() => {
    if (!scopedExportRows.length) {
      toast.error("Keine Cluster-Daten zum Export vorhanden.");
      return;
    }
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const scopePart =
      exportScope === "all"
        ? "alle-cluster"
        : slugifyFilenamePart(currentParent?.name ?? "aktuelle-ansicht");
    const baseFilename = `keyword-cluster-export-${scopePart}-${timestamp}`;
    const serializedRows = serializeKeywordExportRows(scopedExportRows, activeExportColumns);
    const worksheet = XLSX.utils.json_to_sheet(serializedRows, { skipHeader: false });
    worksheet["!cols"] = activeExportColumns.map((column) => ({ wch: column.width }));

    if (exportFormat === "xlsx") {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Keyword Cluster");
      XLSX.writeFile(workbook, `${baseFilename}.xlsx`, { compression: true });
    } else {
      const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: ";", RS: "\n" });
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseFilename}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setExportDialogOpen(false);
    toast.success(`Export erstellt: ${scopedExportRows.length.toLocaleString("de-DE")} Keywords.`);
  }, [scopedExportRows, activeExportColumns, exportScope, currentParent, exportFormat]);

  const updateOptionalColumns = useCallback((next: Set<OptionalKeywordExportColumnKey>) => {
    setSelectedOptionalColumns(
      OPTIONAL_KEYWORD_EXPORT_COLUMNS.map((column) => column.key).filter((key) => next.has(key))
    );
  }, []);

  const toggleOptionalColumn = useCallback(
    (key: OptionalKeywordExportColumnKey, checked: boolean | "indeterminate") => {
      const next = new Set(selectedOptionalColumns);
      if (checked === true) next.add(key);
      else next.delete(key);
      updateOptionalColumns(next);
    },
    [selectedOptionalColumns, updateOptionalColumns]
  );

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              className="h-11 w-11 rounded-full border border-primary/70 bg-primary text-primary-foreground shadow-2xl transition-transform duration-200 hover:scale-105"
              aria-label="Menü"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={10}
            className="w-56 rounded-xl border-border/70 bg-card/95 p-1.5 shadow-2xl backdrop-blur-md"
          >
            <DropdownMenuItem
              className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium"
              onClick={() => toast.info("Settings folgt als Nächstes.")}
            >
              <Settings2 className="mr-2 h-4 w-4 text-muted-foreground" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium"
              disabled={isRunning || parents.length === 0}
              onClick={() => setExportDialogOpen(true)}
            >
              <Download className="mr-2 h-4 w-4 text-muted-foreground" />
              Export
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-[680px] rounded-2xl border-border/70 bg-card/95 p-0 backdrop-blur-md">
          <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Download className="h-5 w-5 text-primary" />
              Cluster Export
            </DialogTitle>
            <DialogDescription>
              Exportiere Keyword-Daten aus dem Clustering als strukturierte Tabelle. Die Spalten sind fix und einfach erweiterbar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 pb-6">
            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
              <Label className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Exportumfang</Label>
              <RadioGroup
                value={exportScope}
                onValueChange={(value) => setExportScope(value as ExportScope)}
                className="grid gap-2"
              >
                <label
                  htmlFor="export-scope-all"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-card/70 px-3 py-3"
                >
                  <RadioGroupItem id="export-scope-all" value="all" className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">Alle Keyword Cluster</span>
                    <span className="block text-xs text-muted-foreground">
                      Exportiert alle Topical Cluster, Cluster und Keywords aus dem letzten Run.
                    </span>
                  </span>
                </label>
                <label
                  htmlFor="export-scope-current"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-card/70 px-3 py-3"
                >
                  <RadioGroupItem id="export-scope-current" value="current" className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">Aktuelle Ansicht</span>
                    <span className="block text-xs text-muted-foreground">
                      {currentParent
                        ? `Exportiert nur "${currentParent.name}".`
                        : "Aktuell ist keine Topic geöffnet, daher entspricht dies allen Clustern."}
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
              <Label className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Format</Label>
              <RadioGroup
                value={exportFormat}
                onValueChange={(value) => setExportFormat(value as ExportFormat)}
                className="grid gap-2 sm:grid-cols-2"
              >
                <label
                  htmlFor="export-format-xlsx"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-card/70 px-3 py-3"
                >
                  <RadioGroupItem id="export-format-xlsx" value="xlsx" className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="flex items-center gap-1 text-sm font-medium">
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                      Excel (.xlsx)
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Empfohlen für Umlaute, Filter und stabile Excel-Kompatibilität.
                    </span>
                  </span>
                </label>
                <label
                  htmlFor="export-format-csv"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-card/70 px-3 py-3"
                >
                  <RadioGroupItem id="export-format-csv" value="csv" className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="flex items-center gap-1 text-sm font-medium">
                      <FileText className="h-4 w-4 text-primary" />
                      CSV (UTF-8)
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Mit UTF-8 BOM für saubere Zeichendarstellung in Excel.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
              <Label className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Zusatzspalten</Label>
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" className="h-9 gap-2">
                      <Columns3 className="h-4 w-4" />
                      Spalten auswählen
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel>Optionale Spalten</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() =>
                        setSelectedOptionalColumns(OPTIONAL_KEYWORD_EXPORT_COLUMNS.map((column) => column.key))
                      }
                    >
                      Alle auswählen
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setSelectedOptionalColumns([])}
                    >
                      Alle abwählen
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {OPTIONAL_KEYWORD_EXPORT_COLUMNS.map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.key}
                        checked={selectedOptionalColumns.includes(column.key)}
                        onCheckedChange={(checked) => toggleOptionalColumn(column.key, checked)}
                        onSelect={(event) => event.preventDefault()}
                      >
                        {column.header}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-muted-foreground">{selectedOptionalColumnLabel}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Fixe Spalten: {FIXED_KEYWORD_EXPORT_COLUMNS.map((column) => column.header).join(" · ")}
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Vorschau</p>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                  <p className="text-muted-foreground">Topical Cluster</p>
                  <p className="text-sm font-semibold">{exportStats.topicalClusterCount.toLocaleString("de-DE")}</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                  <p className="text-muted-foreground">Cluster</p>
                  <p className="text-sm font-semibold">{exportStats.clusterCount.toLocaleString("de-DE")}</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                  <p className="text-muted-foreground">Keywords</p>
                  <p className="text-sm font-semibold">{exportStats.keywordCount.toLocaleString("de-DE")}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Spalten: {activeExportColumns.map((column) => column.header).join(" · ")}
              </p>
            </div>

            <DialogFooter className="pt-1">
              <Button type="button" variant="ghost" onClick={() => setExportDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button type="button" onClick={exportKeywordClusters} disabled={exportStats.keywordCount === 0}>
                <Download className="h-4 w-4" />
                Export starten
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

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
