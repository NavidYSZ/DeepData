"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import ReactFlow, { Background, Controls, Edge, Node, NodeProps, ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import * as XLSX from "xlsx";
import { ChevronDown, Columns3, Download, FileSpreadsheet, FileText, LayoutGrid, Loader2, Menu, Network, Play, RefreshCw, Search, Settings2, Upload, X } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  UploadKeywordsDialog,
  type UploadImportCompletePayload
} from "@/components/keyword-workspace/upload-dialog";
import { ExternalBadge } from "@/components/keyword-workspace/external-badge";
import { WorkspaceEntityMapView } from "@/components/keyword-workspace/entity-map-view";

type SerpKeyword = { id: string; kwRaw: string; demandMonthly: number; demandSource?: string; difficultyScore?: number | null };
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
  parentId?: string | null;
  parentName?: string | null;
  parentTotalDemand?: number | null;
  parentKeywordCount?: number | null;
};
type SerpParent = {
  id: string;
  name: string;
  totalDemand: number;
  keywordCount: number;
  topDomains: string[];
  subclusters: SerpSubcluster[];
};
type SerpKeywordCoverage = {
  found: number;
  resolved: number;
  used: number;
  missing: number;
  complete: boolean;
};
type SerpResponse = {
  runId: string | null;
  generatedAt: string | null;
  parentClustersAvailable?: boolean;
  topResults?: number;
  overlapThreshold?: number;
  clusterAlgorithm?: "louvain" | "agglomerative_single_link";
  minDemand?: number;
  missingSnapshotCount?: number;
  fetchedMissingCount?: number;
  zyteRequested?: number;
  zyteCached?: number;
  keywordCoverage?: SerpKeywordCoverage;
  subclusters: SerpSubcluster[];
  parents: SerpParent[];
};
type SerpRunListItem = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  minDemand: number;
  urlOverlapThreshold: number;
  topResults: number;
  clusterAlgorithm: "louvain" | "agglomerative_single_link";
  snapshotReuseMode: string | null;
  missingSnapshotCount: number;
  fetchedMissingCount: number;
  zyteRequested: number;
  zyteCached: number;
  eligibleKeywordCount?: number;
  resolvedKeywordCount?: number;
  usedKeywordCount?: number;
  waveCount?: number;
  error?: string | null;
};
type SerpStatusResponse = {
  id?: string;
  status: string;
  startedAt?: string;
  finishedAt?: string | null;
  minDemand?: number;
  urlOverlapThreshold?: number;
  topResults?: number;
  clusterAlgorithm?: "louvain" | "agglomerative_single_link";
  snapshotReuseMode?: string | null;
  missingSnapshotCount?: number;
  fetchedMissingCount?: number;
  zyteRequested?: number;
  zyteSucceeded?: number;
  zyteCached?: number;
  eligibleKeywordCount?: number;
  resolvedKeywordCount?: number;
  usedKeywordCount?: number;
  waveCount?: number;
  keywordCoverage?: SerpKeywordCoverage;
  error?: string | null;
};
type ExportScope = "all" | "current";
type ExportFormat = "xlsx" | "csv";
type KeywordClusterExportRow = {
  topicalCluster: string;
  cluster: string;
  keyword: string;
  demandMonthly: number;
  demandSource: string;
  difficultyScore: number | "";
  clusterTotalDemand: number;
  topicalTotalDemand: number;
  clusterKeywordCount: number;
  topicalKeywordCount: number;
  overlapScore: number | "";
};
type KeywordExportColumn = { key: keyof KeywordClusterExportRow; header: string; width: number };
type OptionalKeywordExportColumnKey = Exclude<keyof KeywordClusterExportRow, "topicalCluster" | "cluster" | "keyword">;
type KeywordScopeMode = "project" | "upload_source";

const ACTIVE_STATUSES = ["pending", "importing_gsc", "fetching_serps", "clustering", "running"];
const SERP_DEBUG = true;

const STATUS_LABELS: Record<string, string> = {
  pending: "Wird vorbereitet...",
  importing_gsc: "GSC-Daten werden importiert (6 Monate)...",
  fetching_serps: "SERP-Daten werden von Google geholt...",
  clustering: "Keywords werden geclustert...",
  running: "Clustering läuft..."
};

const PARENT_WIDTH = 280;
const PARENT_HEIGHT = 120;
const DETAIL_WIDTH = 360;
const DETAIL_HEIGHT = 520;
const GRID_COLS = 6;
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
  { key: "difficultyScore", header: "Difficulty Score", width: 14 },
  { key: "clusterTotalDemand", header: "Cluster Demand", width: 16 },
  { key: "topicalTotalDemand", header: "Topical Demand", width: 16 },
  { key: "clusterKeywordCount", header: "Cluster Keywords", width: 16 },
  { key: "topicalKeywordCount", header: "Topical Keywords", width: 16 },
  { key: "overlapScore", header: "Overlap Score", width: 14 }
];
const DEFAULT_OPTIONAL_COLUMN_KEYS: OptionalKeywordExportColumnKey[] = OPTIONAL_KEYWORD_EXPORT_COLUMNS.map((column) => column.key);
const RUN_SCOPE_STORAGE_PREFIX = "keyword-workspace:run-scope:";

function slugifyFilenamePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "export";
}

function buildKeywordExportRows(subclusters: SerpSubcluster[]): KeywordClusterExportRow[] {
  const rows: KeywordClusterExportRow[] = [];
  for (const subcluster of subclusters) {
    for (const keyword of subcluster.keywords) {
      rows.push({
        topicalCluster: subcluster.parentName ?? "",
        cluster: subcluster.name,
        keyword: keyword.kwRaw,
        demandMonthly: Math.round(keyword.demandMonthly ?? 0),
        demandSource: keyword.demandSource ?? "none",
        difficultyScore:
          typeof keyword.difficultyScore === "number"
            ? Number(keyword.difficultyScore.toFixed(2))
            : "",
        clusterTotalDemand: Math.round(subcluster.totalDemand ?? 0),
        topicalTotalDemand: Math.round(subcluster.parentTotalDemand ?? subcluster.totalDemand ?? 0),
        clusterKeywordCount: subcluster.keywordCount ?? 0,
        topicalKeywordCount: subcluster.parentKeywordCount ?? subcluster.keywordCount ?? 0,
        overlapScore: typeof subcluster.overlapScore === "number" ? Number(subcluster.overlapScore.toFixed(3)) : ""
      });
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

function formatRunLabel(run: SerpRunListItem) {
  const finished = run.finishedAt ? new Date(run.finishedAt) : new Date(run.startedAt);
  const dateLabel = finished.toLocaleString();
  const algoShort = run.clusterAlgorithm === "agglomerative_single_link" ? "agg" : "louvain";
  return `${dateLabel} · ${run.topResults} | ${run.urlOverlapThreshold.toFixed(2)} | ${algoShort} · min${run.minDemand}`;
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
function formatAllintitle(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function AllintitleBadge({ value }: { value: number | null | "loading" | undefined }) {
  if (value === "loading") {
    return (
      <span className="inline-flex w-14 shrink-0 justify-end text-[11px] tabular-nums text-muted-foreground/60">
        …
      </span>
    );
  }
  if (value === null || value === undefined) {
    return (
      <span className="inline-flex w-14 shrink-0 justify-end text-[11px] tabular-nums text-muted-foreground/40">
        —
      </span>
    );
  }
  const tone =
    value < 100
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : value < 1_000
        ? "bg-lime-500/15 text-lime-700 dark:text-lime-300"
        : value < 10_000
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  return (
    <span
      className={`inline-flex w-14 shrink-0 justify-center rounded-md px-1.5 py-0.5 text-[11px] tabular-nums font-medium ${tone}`}
      title={`Allintitle: ${value.toLocaleString("de-DE")} Treffer`}
    >
      {formatAllintitle(value)}
    </span>
  );
}

function ParentNode({ data }: NodeProps) {
  /* ── Expanded detail view (selected parent) ── */
  if (data.expanded) {
    const keywords: SerpKeyword[] = data.keywordsFlat ?? [];
    const allintitleByKw: Record<string, number | null | "loading"> =
      data.allintitleByKw ?? {};
    return (
      <div
        className="rounded-lg border bg-card shadow-2xl p-4 w-[420px] max-h-[520px] overflow-hidden flex flex-col transition-[transform,opacity,width,height] duration-[480ms]"
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
        <div className="mt-3 space-y-1 flex-1 min-h-0">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>Keywords</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Demand · AIT
            </span>
          </div>
          <ScrollArea className="h-[340px] rounded border">
            <div className="p-3 space-y-1 text-sm text-muted-foreground">
              {keywords.map((k) => {
                const ait = allintitleByKw[k.kwRaw.trim().toLowerCase()];
                return (
                  <div key={k.id} className="flex min-w-0 items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-1 items-center gap-1">
                      {k.demandSource === "upload" && <ExternalBadge />}
                      <span className="truncate">{k.kwRaw}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-foreground/80">
                      {Math.round(k.demandMonthly)}
                    </span>
                    <AllintitleBadge value={ait} />
                  </div>
                );
              })}
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
    </div>
  );
}

const nodeTypes = {
  parentNode: ParentNode
};

/* ── Layout builder ── */
function buildFlowGraph(
  subclusters: SerpSubcluster[],
  selectedId: string | null,
  onSelect: (id: string) => void,
  dockTarget: { x: number; y: number } | null,
  clickFeedbackId: string | null,
  allintitleByKw: Record<string, number | null | "loading">
): { nodes: Node[]; edges: Edge[] } {
  if (!subclusters.length) return { nodes: [], edges: [] };

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const transitionStyle = (delayMs = 0, durationMs = FLOW_ANIM_MS) => ({
    transitionProperty: "transform, opacity",
    transitionDuration: `${durationMs}ms`,
    transitionTimingFunction: FLOW_EASING,
    transitionDelay: `${delayMs}ms`
  });

  if (!selectedId) {
    subclusters.forEach((s, idx) => {
      const col = idx % GRID_COLS;
      const row = Math.floor(idx / GRID_COLS);
      nodes.push({
        id: `parent-${s.id}`,
        type: "parentNode",
        position: {
          x: col * (PARENT_WIDTH + GRID_GAP_X),
          y: row * (PARENT_HEIGHT + GRID_GAP_Y)
        },
        data: {
          parentId: s.id,
          name: s.name,
          totalDemand: s.totalDemand,
          keywordCount: s.keywordCount,
          clickFeedback: clickFeedbackId === s.id,
          onSelect
        },
        style: transitionStyle(idx * OVERVIEW_STAGGER_MS),
        draggable: false
      });
    });
    return { nodes, edges };
  }

  const selected = subclusters.find((s) => s.id === selectedId);
  if (!selected) return { nodes: [], edges: [] };

  const keywordsFlat = [...selected.keywords].sort(
    (a, b) => (b.demandMonthly ?? 0) - (a.demandMonthly ?? 0)
  );

  nodes.push({
    id: `parent-${selected.id}`,
    type: "parentNode",
    position: { x: 0, y: 0 },
    data: {
      parentId: selected.id,
      name: selected.name,
      totalDemand: selected.totalDemand,
      keywordCount: selected.keywordCount,
      expanded: true,
      keywordsFlat,
      totalKeywords: selected.keywordCount,
      allintitleByKw,
      onSelect
    },
    style: { ...transitionStyle(), zIndex: 10 },
    draggable: false
  });

  const rest = subclusters.filter((s) => s.id !== selectedId);
  const dockX = (dockTarget?.x ?? DETAIL_WIDTH + 200) - PARENT_WIDTH / 2;
  const dockY = (dockTarget?.y ?? 0) - PARENT_HEIGHT / 2;

  rest.forEach((s, idx) => {
    nodes.push({
      id: `parent-${s.id}`,
      type: "parentNode",
      position: { x: dockX, y: dockY },
      data: {
        parentId: s.id,
        name: s.name,
        totalDemand: s.totalDemand,
        keywordCount: s.keywordCount,
        docked: true,
        onSelect
      },
      style: { ...transitionStyle(idx * FLOW_OUT_STAGGER_MS, FLOW_OUT_MS), zIndex: 1 },
      draggable: false
    });
  });

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
  const [createMinDemandInput, setCreateMinDemandInput] = useState("5");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [topResults, setTopResults] = useState<7 | 10>(10);
  const [overlapThreshold, setOverlapThreshold] = useState(0.3);
  const [clusterAlgorithm, setClusterAlgorithm] = useState<"louvain" | "agglomerative_single_link">("louvain");
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [clickFeedbackClusterId, setClickFeedbackClusterId] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState(0);
  const wasRunningRef = useRef(false);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [dockTarget, setDockTarget] = useState<{ x: number; y: number } | null>(null);
  const selectTimerRef = useRef<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [keywordScopeMode, setKeywordScopeMode] = useState<KeywordScopeMode>("project");
  const [uploadScopeSourceId, setUploadScopeSourceId] = useState<string | null>(null);
  const [uploadScopeSourceName, setUploadScopeSourceName] = useState<string | null>(null);
  const [allintitleByKw, setAllintitleByKw] = useState<Record<string, number | null | "loading">>({});

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view: "cluster" | "entity-map" =
    searchParams.get("view") === "entity-map" ? "entity-map" : "cluster";
  const handleViewChange = useCallback(
    (next: "cluster" | "entity-map") => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "cluster") params.delete("view");
      else params.set("view", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, router, pathname]
  );

  const createMinDemand = useMemo(() => {
    const parsed = Number(createMinDemandInput);
    return Number.isFinite(parsed) ? parsed : 5;
  }, [createMinDemandInput]);

  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;

    const raw = window.localStorage.getItem(`${RUN_SCOPE_STORAGE_PREFIX}${projectId}`);
    if (!raw) {
      setKeywordScopeMode("project");
      setUploadScopeSourceId(null);
      setUploadScopeSourceName(null);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        mode?: KeywordScopeMode;
        sourceId?: string | null;
        sourceName?: string | null;
      };
      setKeywordScopeMode(parsed.mode === "upload_source" ? "upload_source" : "project");
      setUploadScopeSourceId(parsed.sourceId ?? null);
      setUploadScopeSourceName(parsed.sourceName ?? null);
    } catch {
      setKeywordScopeMode("project");
      setUploadScopeSourceId(null);
      setUploadScopeSourceName(null);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;
    window.localStorage.setItem(
      `${RUN_SCOPE_STORAGE_PREFIX}${projectId}`,
      JSON.stringify({
        mode: keywordScopeMode,
        sourceId: uploadScopeSourceId,
        sourceName: uploadScopeSourceName
      })
    );
  }, [keywordScopeMode, projectId, uploadScopeSourceId, uploadScopeSourceName]);

  const { data: runList, mutate: mutateRunList } = useSWR<SerpRunListItem[]>(
    projectId ? `/api/keyword-workspace/projects/${projectId}/serp-cluster/runs` : null,
    fetchJson
  );

  const selectedRunMeta = useMemo(
    () => (runList ?? []).find((run) => run.id === selectedRunId) ?? null,
    [runList, selectedRunId]
  );

  const serpUrl = useMemo(() => {
    if (!projectId) return null;
    const params = new URLSearchParams();
    if (selectedRunId) params.set("runId", selectedRunId);
    if (selectedRunMeta?.minDemand !== undefined) params.set("minDemand", String(selectedRunMeta.minDemand));
    const qs = params.toString();
    return `/api/keyword-workspace/projects/${projectId}/serp-cluster${qs ? `?${qs}` : ""}`;
  }, [projectId, selectedRunId, selectedRunMeta]);

  const statusUrl = useMemo(() => {
    if (!projectId) return null;
    const params = new URLSearchParams();
    if (selectedRunId) params.set("runId", selectedRunId);
    const qs = params.toString();
    return `/api/keyword-workspace/projects/${projectId}/serp-cluster/status${qs ? `?${qs}` : ""}`;
  }, [projectId, selectedRunId]);

  const { data: serpData, mutate: mutateSerp } = useSWR<SerpResponse>(serpUrl, fetchJson);

  const { data: statusData, mutate: mutateStatus } = useSWR<SerpStatusResponse>(statusUrl, fetchJson, {
    refreshInterval: pollInterval
  });

  const handleRunChange = useCallback(
    (runId: string) => {
      setSelectedRunId(runId);
      setSelectedClusterId(null);
      mutateSerp();
      mutateStatus();
    },
    [mutateSerp, mutateStatus]
  );

  const isRunning = !!statusData?.status && ACTIVE_STATUSES.includes(statusData.status);

  useEffect(() => {
    if (!selectedRunId) {
      if (serpData?.runId) {
        setSelectedRunId(serpData.runId);
      } else if (runList?.length) {
        const latestCompleted = runList.find((r) => r.status === "completed");
        setSelectedRunId((latestCompleted ?? runList[0]).id);
      }
    }
  }, [selectedRunId, serpData?.runId, runList]);

  useEffect(() => {
    if (!selectedRunMeta) return;
    setTopResults(selectedRunMeta.topResults === 7 ? 7 : 10);
    setOverlapThreshold(selectedRunMeta.urlOverlapThreshold ?? 0.3);
    setClusterAlgorithm(selectedRunMeta.clusterAlgorithm ?? "louvain");
    setCreateMinDemandInput(String(selectedRunMeta.minDemand ?? 5));
  }, [selectedRunMeta]);

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
        mutateRunList();
        toast.success("Clustering abgeschlossen!");
      } else if (statusData.status === "failed") {
        toast.error(`Clustering fehlgeschlagen: ${statusData.error ?? "Unbekannter Fehler"}`);
      }
    }
  }, [isRunning, statusData?.status, statusData?.error, mutateSerp, mutateRunList]);

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
      topResults: statusData?.topResults,
      clusterAlgorithm: statusData?.clusterAlgorithm,
      missingSnapshotCount: statusData?.missingSnapshotCount,
      fetchedMissingCount: statusData?.fetchedMissingCount,
      eligibleKeywordCount: statusData?.eligibleKeywordCount,
      resolvedKeywordCount: statusData?.resolvedKeywordCount,
      usedKeywordCount: statusData?.usedKeywordCount,
      waveCount: statusData?.waveCount,
      keywordCoverage: statusData?.keywordCoverage,
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
      topResults: serpData?.topResults,
      overlapThreshold: serpData?.overlapThreshold,
      clusterAlgorithm: serpData?.clusterAlgorithm,
      minDemand: serpData?.minDemand,
      fetchedMissingCount: serpData?.fetchedMissingCount,
      keywordCoverage: serpData?.keywordCoverage,
      subclusterCount: serpData?.subclusters?.length ?? 0,
      selectedClusterId
    });
    console.groupEnd();
  }, [serpData, selectedClusterId]);

  async function triggerRun() {
    if (!projectId) return;
    if (keywordScopeMode === "upload_source" && !uploadScopeSourceId) {
      toast.error("Für den Upload-Modus fehlt die ausgewählte Import-Datei.");
      return;
    }
    try {
      if (SERP_DEBUG) {
        console.groupCollapsed("[SERP][run-trigger]");
        console.debug({
          projectId,
          minDemand: createMinDemand,
          overlapThreshold,
          topResults,
          clusterAlgorithm,
          keywordScopeMode,
          uploadScopeSourceId,
          ts: new Date().toISOString()
        });
        console.groupEnd();
      }
      const res = await fetch(`/api/keyword-workspace/projects/${projectId}/serp-cluster/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minDemand: createMinDemand,
          overlapThreshold,
          topResults,
          clusterAlgorithm,
          keywordScopeMode,
          uploadSourceId: keywordScopeMode === "upload_source" ? uploadScopeSourceId : undefined
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Run failed");
      }
      if (SERP_DEBUG) console.info("[SERP][run-trigger] accepted run start");
      toast.success("SERP-Clustering gestartet");
      setSelectedRunId((await res.json())?.runId ?? null);
      setPollInterval(2000);
      await Promise.all([mutateStatus(), mutateRunList()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Start");
      if (SERP_DEBUG) console.error("[SERP][run-trigger] failed", e);
    }
  }

  const subclusters = serpData?.subclusters ?? [];
  const hasClusterData = subclusters.length > 0;
  const subclustersSorted = useMemo(
    () =>
      [...subclusters].sort((a, b) => {
        if ((b.totalDemand ?? 0) === (a.totalDemand ?? 0)) {
          return a.name.localeCompare(b.name, "de");
        }
        return (b.totalDemand ?? 0) - (a.totalDemand ?? 0);
      }),
    [subclusters]
  );
  const selectedSubcluster = useMemo(
    () => (selectedClusterId ? subclustersSorted.find((s) => s.id === selectedClusterId) ?? null : null),
    [subclustersSorted, selectedClusterId]
  );
  const keywordScopeLabel =
    keywordScopeMode === "upload_source"
      ? uploadScopeSourceName
        ? `Nur Upload: ${uploadScopeSourceName}`
        : "Nur Upload"
      : "GSC + Uploads";
  const scopedSubclustersForExport = useMemo(() => {
    if (exportScope === "all" || !selectedSubcluster) return subclustersSorted;
    return [selectedSubcluster];
  }, [exportScope, selectedSubcluster, subclustersSorted]);
  const scopedExportRows = useMemo(
    () => buildKeywordExportRows(scopedSubclustersForExport),
    [scopedSubclustersForExport]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return subclustersSorted
      .map((subcluster) => {
        const matchingKeywords = subcluster.keywords.filter((keyword) =>
          keyword.kwRaw.toLowerCase().includes(q)
        );
        const matchesClusterName = subcluster.name.toLowerCase().includes(q);
        const matchesParentName = (subcluster.parentName ?? "").toLowerCase().includes(q);
        const matchesTopDomain = (subcluster.topDomains ?? []).some((domain) =>
          domain.toLowerCase().includes(q)
        );
        return {
          subcluster,
          matchingKeywords,
          matchesClusterName,
          matchesParentName,
          matchesTopDomain
        };
      })
      .filter(
        (result) =>
          result.matchingKeywords.length > 0 ||
          result.matchesClusterName ||
          result.matchesParentName ||
          result.matchesTopDomain
      );
  }, [searchQuery, subclustersSorted]);

  const filteredSubclusters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return subclustersSorted;
    return subclustersSorted.filter((subcluster) => {
      if (subcluster.name.toLowerCase().includes(q)) return true;
      if ((subcluster.parentName ?? "").toLowerCase().includes(q)) return true;
      if ((subcluster.topDomains ?? []).some((domain) => domain.toLowerCase().includes(q))) return true;
      return subcluster.keywords.some((keyword) => keyword.kwRaw.toLowerCase().includes(q));
    });
  }, [searchQuery, subclustersSorted]);

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
  const activeCoverage = isRunning
    ? (statusData?.keywordCoverage ?? serpData?.keywordCoverage)
    : (serpData?.keywordCoverage ?? statusData?.keywordCoverage);
  const coverageFound = activeCoverage?.found ?? 0;
  const coverageResolved = activeCoverage?.resolved ?? 0;
  const coverageUsed = activeCoverage?.used ?? 0;
  const coverageMissing = activeCoverage?.missing ?? Math.max(coverageFound - coverageResolved, 0);
  const incompleteCoverageError =
    statusData?.status === "failed" && typeof statusData?.error === "string"
      ? statusData.error.includes("INCOMPLETE_SERP_COVERAGE")
      : false;
  const showTopLeftMeta = Boolean(serpData?.generatedAt || (statusData?.status && statusData.status !== "none"));
  const exportStats = useMemo(() => {
    const topicalClusterCount = new Set(
      scopedSubclustersForExport.map((subcluster) => subcluster.parentName ?? subcluster.name)
    ).size;
    return {
      topicalClusterCount,
      clusterCount: scopedSubclustersForExport.length,
      keywordCount: scopedExportRows.length
    };
  }, [scopedSubclustersForExport, scopedExportRows.length]);

  const exportKeywordClusters = useCallback(() => {
    if (!scopedExportRows.length) {
      toast.error("Keine Cluster-Daten zum Export vorhanden.");
      return;
    }
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const scopePart =
      exportScope === "all"
        ? "alle-cluster"
        : slugifyFilenamePart(selectedSubcluster?.name ?? "aktuelle-ansicht");
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
  }, [scopedExportRows, activeExportColumns, exportScope, selectedSubcluster, exportFormat]);

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

  const fetchAllintitleForCluster = useCallback(
    async (keywords: string[]) => {
      const unique = Array.from(
        new Set(keywords.map((k) => k.trim()).filter((k) => k.length > 0))
      );
      if (unique.length === 0) return;

      const needsFetch = unique.filter((kw) => {
        const key = kw.toLowerCase();
        const current = allintitleByKw[key];
        return current === undefined;
      });
      if (needsFetch.length === 0) return;

      setAllintitleByKw((prev) => {
        const next = { ...prev };
        for (const kw of needsFetch) next[kw.toLowerCase()] = "loading";
        return next;
      });

      try {
        const res = await fetch("/api/keyword-workspace/allintitle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords: needsFetch })
        });
        if (!res.ok) {
          setAllintitleByKw((prev) => {
            const next = { ...prev };
            for (const kw of needsFetch) next[kw.toLowerCase()] = null;
            return next;
          });
          return;
        }
        const json = (await res.json()) as {
          results: Array<{ keyword: string; allintitle: number | null }>;
        };
        setAllintitleByKw((prev) => {
          const next = { ...prev };
          for (const r of json.results) {
            next[r.keyword.toLowerCase()] = r.allintitle;
          }
          return next;
        });
      } catch {
        setAllintitleByKw((prev) => {
          const next = { ...prev };
          for (const kw of needsFetch) next[kw.toLowerCase()] = null;
          return next;
        });
      }
    },
    [allintitleByKw]
  );

  const handleSelect = useCallback(
    (id: string) => {
      setClickFeedbackClusterId(id);
      if (selectTimerRef.current) window.clearTimeout(selectTimerRef.current);
      selectTimerRef.current = window.setTimeout(() => {
        setSelectedClusterId(id);
        setClickFeedbackClusterId(null);
        selectTimerRef.current = null;
      }, 130);

      const cluster = subclustersSorted.find((s) => s.id === id);
      if (cluster) {
        void fetchAllintitleForCluster(cluster.keywords.map((k) => k.kwRaw));
      }
    },
    [subclustersSorted, fetchAllintitleForCluster]
  );

  const handleBack = useCallback(() => {
    if (selectTimerRef.current) {
      window.clearTimeout(selectTimerRef.current);
      selectTimerRef.current = null;
    }
    setClickFeedbackClusterId(null);
    setSelectedClusterId(null);
  }, []);

  // Reliable click handler at ReactFlow level (backup for node onClick)
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (selectedClusterId) return;
      if (node.type !== "parentNode") return;
      if (node.data.parentId) {
        handleSelect(node.data.parentId);
      }
    },
    [selectedClusterId, handleSelect]
  );

  const { nodes: flowNodes, edges: flowEdges } = useMemo(
    () =>
      buildFlowGraph(
        subclustersSorted,
        selectedClusterId,
        handleSelect,
        dockTarget,
        clickFeedbackClusterId,
        allintitleByKw
      ),
    [
      subclustersSorted,
      selectedClusterId,
      handleSelect,
      dockTarget,
      clickFeedbackClusterId,
      allintitleByKw
    ]
  );

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
    const nodeKey = `${selectedClusterId ?? "overview"}:${flowNodes.length}`;
    if (prevNodeKeyRef.current === nodeKey) return;
    prevNodeKeyRef.current = nodeKey;

    const visibleNodeIds = selectedClusterId
      ? flowNodes
          .filter((node) => node.id === `parent-${selectedClusterId}`)
          .map((node) => ({ id: node.id }))
      : flowNodes.map((node) => ({ id: node.id }));

    const delay = selectedClusterId ? FITVIEW_DELAY_MS : 0;
    const timer = window.setTimeout(() => {
      requestAnimationFrame(() => {
        flowRef.current?.fitView({ padding: 0.15, duration: FITVIEW_ANIM_MS, nodes: visibleNodeIds });
        window.setTimeout(() => {
          requestAnimationFrame(() => updateDockTarget());
        }, FITVIEW_ANIM_MS + 20);
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [selectedClusterId, flowNodes, updateDockTarget]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => updateDockTarget());
    return () => cancelAnimationFrame(rafId);
  }, [selectedClusterId, updateDockTarget]);

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
    <div
      ref={canvasRef}
      className={`relative h-full w-full bg-card ${view === "cluster" ? "overflow-hidden" : "overflow-y-auto"}`}
    >
      <div className="absolute top-3 left-1/2 z-30 -translate-x-1/2">
        <div className="inline-flex items-center gap-1 rounded-full border bg-card/95 p-1 shadow-lg backdrop-blur-md">
          <ViewTab
            active={view === "cluster"}
            onClick={() => handleViewChange("cluster")}
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            label="Cluster"
          />
          <ViewTab
            active={view === "entity-map"}
            onClick={() => handleViewChange("entity-map")}
            icon={<Network className="h-3.5 w-3.5" />}
            label="Entity Map"
          />
        </div>
      </div>

      {view === "cluster" && showTopLeftMeta ? (
        <div className="absolute top-3 left-3 text-[11px] text-muted-foreground z-10">
          <div>
            Stand{" "}
            {new Date(
              serpData?.generatedAt ??
                statusData?.finishedAt ??
                statusData?.startedAt ??
                new Date().toISOString()
            ).toLocaleString()}
          </div>
          <div className="mt-0.5">
            Run {(serpData?.runId ?? statusData?.id)?.slice(0, 8) ?? "n/a"} · {(serpData?.topResults ?? statusData?.topResults ?? 10)} |{" "}
            {(serpData?.overlapThreshold ?? statusData?.urlOverlapThreshold ?? 0.3).toFixed(2)} |{" "}
            {(serpData?.clusterAlgorithm ?? statusData?.clusterAlgorithm ?? "louvain")} · min{" "}
            {(serpData?.minDemand ?? statusData?.minDemand ?? 5)}
          </div>
          <div className="mt-0.5">
            Keywords verwendet/gefunden: {coverageUsed}/{coverageFound}
          </div>
          {isRunning ? (
            <div className="mt-0.5">
              SERP-Progress: {coverageResolved}/{coverageFound}
            </div>
          ) : null}
          {(serpData?.fetchedMissingCount ?? statusData?.fetchedMissingCount) ? (
            <div className="text-green-600 dark:text-green-400">
              Fehlende SERPs nachgeladen: {serpData?.fetchedMissingCount ?? statusData?.fetchedMissingCount}
            </div>
          ) : null}
          {incompleteCoverageError ? (
            <div className="text-red-600 dark:text-red-400">
              Unvollständige SERP-Coverage: {coverageMissing} Keyword(s) ohne verwertbare Hosts.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Search bar ── */}
      {view === "cluster" && !isRunning && hasClusterData && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center w-full max-w-lg px-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Keyword suchen…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-10 rounded-full border-border/70 bg-card/95 shadow-lg backdrop-blur-md text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchQuery.trim() && (
            <div className="mt-2 w-full max-h-[60vh] overflow-y-auto rounded-xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-md">
              {searchResults.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Kein Keyword gefunden für &ldquo;{searchQuery.trim()}&rdquo;
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {searchResults.map(({ subcluster, matchingKeywords }) => (
                    <div
                      key={subcluster.id}
                      className="px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => {
                        setSearchQuery("");
                        handleSelect(subcluster.id);
                      }}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        {subcluster.parentName ? (
                          <>
                            <span className="font-medium text-foreground">{subcluster.parentName}</span>
                            <span>›</span>
                          </>
                        ) : null}
                        <span>{subcluster.name}</span>
                        <span className="ml-auto tabular-nums">{subcluster.keywordCount} KW</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {subcluster.keywords.map((k) => {
                          const q = searchQuery.trim().toLowerCase();
                          const isMatch = k.kwRaw.toLowerCase().includes(q);
                          if (isMatch) {
                            const idx = k.kwRaw.toLowerCase().indexOf(q);
                            const before = k.kwRaw.slice(0, idx);
                            const match = k.kwRaw.slice(idx, idx + q.length);
                            const after = k.kwRaw.slice(idx + q.length);
                            return (
                              <span key={k.id} className="font-semibold text-foreground">
                                {before}<span className="bg-yellow-200 dark:bg-yellow-800 rounded-sm px-0.5">{match}</span>{after}
                              </span>
                            );
                          }
                          return <span key={k.id}>{k.kwRaw}</span>;
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-2 text-[11px] text-muted-foreground text-center">
                    {searchResults.length} Cluster · {searchResults.reduce((s, r) => s + r.matchingKeywords.length, 0)} Treffer
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {view === "cluster" && (
        <div className="absolute top-4 right-4 z-20 flex gap-2">
          {selectedClusterId && !isRunning && hasClusterData ? (
            <Button
              type="button"
              size="icon"
              className="h-11 w-11 rounded-full border border-primary/70 bg-primary text-primary-foreground shadow-2xl transition-transform duration-200 hover:scale-105"
              onClick={handleBack}
              aria-label="Zur Cluster-Übersicht"
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
                onClick={() => toast.info("Settings findest du im Dock (Zahnrad unten).")}
              >
                <Settings2 className="mr-2 h-4 w-4 text-muted-foreground" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium"
                disabled={isRunning || !hasClusterData}
                onClick={() => setExportDialogOpen(true)}
              >
                <Download className="mr-2 h-4 w-4 text-muted-foreground" />
                Export
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {view === "entity-map" ? (
        <div className="px-4 pb-6 pt-20">
          {!hasClusterData ? (
            <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
              Noch kein SERP-Clustering gelaufen. Wechsle in die Cluster-Ansicht und starte einen Run.
            </div>
          ) : (
            <WorkspaceEntityMapView
              subclusters={subclusters ?? []}
              siteUrl={workspace?.siteUrl ?? site}
              runId={serpData?.runId ?? null}
              generatedAt={serpData?.generatedAt ?? null}
            />
          )}
        </div>
      ) : isRunning ? (
        <div className="h-full flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">{STATUS_LABELS[statusData?.status] ?? "Clustering läuft..."}</p>
            <p className="text-xs text-muted-foreground">Bitte warte, das kann je nach Keyword-Anzahl einige Minuten dauern.</p>
          </div>
        </div>
      ) : !hasClusterData ? (
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

      {view === "cluster" && (
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
        <div className="pointer-events-auto bg-card/90 backdrop-blur-sm border rounded-full shadow-lg px-3 py-2 flex items-center gap-2 text-xs">
          <Select value={selectedRunId ?? ""} onValueChange={handleRunChange} disabled={!runList?.length}>
            <SelectTrigger className="h-8 w-72 text-xs">
              <SelectValue placeholder="Run-Historie" />
            </SelectTrigger>
            <SelectContent>
              {runList?.map((run) => (
                <SelectItem key={run.id} value={run.id} className="text-xs">
                  {formatRunLabel(run)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-full"
                aria-label="Clustering-Settings"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-4" align="end">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Top Results</div>
                <div className="flex gap-2">
                  {[7, 10].map((v) => (
                    <Button key={v} size="sm" variant={topResults === v ? "default" : "outline"} onClick={() => setTopResults(v as 7 | 10)}>
                      Top {v}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Overlap</div>
                <div className="flex gap-2">
                  {[0.3, 0.4].map((v) => (
                    <Button key={v} size="sm" variant={overlapThreshold === v ? "default" : "outline"} onClick={() => setOverlapThreshold(v)}>
                      {v.toFixed(2)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Algorithmus</div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={clusterAlgorithm === "louvain" ? "default" : "outline"}
                    onClick={() => setClusterAlgorithm("louvain")}
                  >
                    Louvain
                  </Button>
                  <Button
                    size="sm"
                    variant={clusterAlgorithm === "agglomerative_single_link" ? "default" : "outline"}
                    onClick={() => setClusterAlgorithm("agglomerative_single_link")}
                  >
                    Agglomerative
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Einstellungen gelten für den nächsten Run. Bestehende Runs bleiben unverändert.</p>
            </PopoverContent>
          </Popover>

          <Input
            type="number"
            className="w-24 h-8 text-xs"
            value={createMinDemandInput}
            onChange={(e) => setCreateMinDemandInput(e.target.value)}
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
          <div className="hidden items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground lg:flex">
            <span>Keyword-Basis:</span>
            <span className="max-w-[220px] truncate font-medium text-foreground">{keywordScopeLabel}</span>
            {keywordScopeMode === "upload_source" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() => {
                  setKeywordScopeMode("project");
                  setUploadScopeSourceId(null);
                  setUploadScopeSourceName(null);
                }}
              >
                Alle nutzen
              </Button>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={() => Promise.all([mutateSerp(), mutateStatus(), mutateRunList()])}
            disabled={isRunning}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>
      )}

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-[680px] rounded-2xl border-border/70 bg-card/95 p-0 backdrop-blur-md">
          <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Download className="h-5 w-5 text-primary" />
              Cluster Export
            </DialogTitle>
            <DialogDescription>
              Exportiere Keyword-Daten aus dem Clustering als strukturierte Tabelle. Die Spalten sind fix und einfach erweiterbar.
              {serpData?.runId ? (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Aktiver Run: {serpData.runId.slice(0, 8)} · {serpData.topResults ?? 10} |{" "}
                  {(serpData.overlapThreshold ?? 0.3).toFixed(2)} | {serpData.clusterAlgorithm ?? "louvain"} · min{" "}
                  {serpData.minDemand ?? 5}
                </div>
              ) : null}
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
                      Exportiert alle normalen Cluster und Keywords aus dem letzten Run.
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
                      {selectedSubcluster
                        ? `Exportiert nur "${selectedSubcluster.name}".`
                        : "Aktuell ist keine Parent-Ebene geöffnet, daher entspricht dies allen Clustern."}
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
          onImportComplete={(payload: UploadImportCompletePayload) => {
            if (payload.importMode === "upload_only") {
              setKeywordScopeMode("upload_source");
              setUploadScopeSourceId(payload.sourceId);
              setUploadScopeSourceName(payload.sourceName);
            } else {
              setKeywordScopeMode("project");
              setUploadScopeSourceId(null);
              setUploadScopeSourceName(null);
            }
            mutateSerp();
            mutateStatus();
          }}
        />
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-sm"
          : "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      }
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
