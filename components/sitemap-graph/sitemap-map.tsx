"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Node,
  type NodeMouseHandler
} from "reactflow";
import "reactflow/dist/style.css";
import { cn } from "@/lib/utils";
import {
  transformSitemapToReactFlow,
  STATUS_COLORS,
  type SitemapLayout,
  type SitemapNodeData
} from "@/lib/sitemap-graph/transform";
import type {
  RecommendedPage,
  RecommendedSitemap,
  SitemapPageStatus
} from "@/lib/nlp/types";
import { PageCardNode } from "./page-card-node";
import { IndentedTreeWithStats } from "./indented-tree";
import { EntitySidebar } from "@/components/entity-graph/entity-sidebar";

const nodeTypes = { pageCard: PageCardNode };

const ALL_STATUSES: SitemapPageStatus[] = [
  "covered_on_page",
  "content_gap",
  "likely_exists_elsewhere"
];

export type SitemapDisplayMode = SitemapLayout | "indented";

export type SitemapSidebarRenderArgs = {
  selectedPage: RecommendedPage | null;
  onSelectPage: (slug: string) => void;
  onClearSelection: () => void;
};

export type SitemapSidebarConfig = {
  collapsedLabel: string;
  headerTitle: string;
  headerIcon?: ReactNode;
  body: ReactNode;
  showCloseButton?: boolean;
};

export type SitemapFilterBarArgs = {
  visibleStatuses: Set<SitemapPageStatus>;
  onToggleStatus: (status: SitemapPageStatus) => void;
  onResetFilters: () => void;
  statusCounts: Record<SitemapPageStatus, number>;
  displayMode: SitemapDisplayMode;
  onChangeDisplayMode: (mode: SitemapDisplayMode) => void;
};

export type SitemapMapProps = {
  sitemap: RecommendedSitemap;
  renderSidebar?: (args: SitemapSidebarRenderArgs) => SitemapSidebarConfig;
  renderFilterBar?: (args: SitemapFilterBarArgs) => ReactNode;
  heightClass?: string;
  defaultMode?: SitemapDisplayMode;
};

export function SitemapMap(props: SitemapMapProps) {
  return (
    <ReactFlowProvider>
      <SitemapMapInner {...props} />
    </ReactFlowProvider>
  );
}

function SitemapMapInner({
  sitemap,
  renderSidebar,
  renderFilterBar,
  heightClass = "h-[78vh]",
  defaultMode = "TB"
}: SitemapMapProps) {
  const [displayMode, setDisplayMode] = useState<SitemapDisplayMode>(defaultMode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [visibleStatuses, setVisibleStatuses] = useState<Set<SitemapPageStatus>>(
    () => new Set(ALL_STATUSES)
  );

  // Effective layout for the transformer (indented re-uses TB positions but is rendered differently).
  const graphLayout: SitemapLayout =
    displayMode === "indented" ? "TB" : (displayMode as SitemapLayout);

  const {
    nodes: initialNodes,
    edges: initialEdges,
    orphans,
    stats,
    rootSlug
  } = useMemo(
    () => transformSitemapToReactFlow(sitemap, { layout: graphLayout }),
    [sitemap, graphLayout]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<SitemapNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Reset selection / filters only when the sitemap itself changes, not on layout switches.
  useEffect(() => {
    setSelectedId(null);
    setHoveredId(null);
    setVisibleStatuses(new Set(ALL_STATUSES));
  }, [sitemap]);

  const onNodeClick = useCallback<NodeMouseHandler>((_evt, node) => {
    setSelectedId((cur) => (cur === node.id ? null : node.id));
  }, []);

  const onNodeMouseEnter = useCallback<NodeMouseHandler>((_evt, node) => {
    setHoveredId(node.id);
  }, []);
  const onNodeMouseLeave = useCallback<NodeMouseHandler>(() => {
    setHoveredId(null);
  }, []);
  const onPaneClick = useCallback(() => setSelectedId(null), []);

  const focusId = selectedId ?? hoveredId;

  const visibleSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      const status = n.data.page.status;
      if (visibleStatuses.has(status as SitemapPageStatus)) set.add(n.id);
    }
    return set;
  }, [nodes, visibleStatuses]);

  const styledEdges = useMemo(() => {
    return edges.map((e) => {
      const incidental = focusId && (e.source === focusId || e.target === focusId);
      const visible = visibleSlugs.has(e.source) && visibleSlugs.has(e.target);
      return {
        ...e,
        hidden: !visible,
        style: {
          stroke: incidental ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.45)",
          strokeWidth: incidental ? 2 : 1.25
        },
        animated: !!incidental,
        zIndex: incidental ? 1 : 0
      };
    });
  }, [edges, focusId, visibleSlugs]);

  const styledNodes = useMemo<Node<SitemapNodeData>[]>(() => {
    const connectedIds = new Set<string>();
    if (focusId) {
      connectedIds.add(focusId);
      edges.forEach((e) => {
        if (e.source === focusId) connectedIds.add(e.target);
        if (e.target === focusId) connectedIds.add(e.source);
      });
    }
    return nodes.map((n) => {
      const visible = visibleSlugs.has(n.id);
      const dimmed = focusId ? !connectedIds.has(n.id) : false;
      return {
        ...n,
        hidden: !visible,
        style: {
          ...n.style,
          opacity: !visible ? 0 : dimmed ? 0.35 : 1
        }
      };
    });
  }, [nodes, edges, focusId, visibleSlugs]);

  const selectedPage = useMemo(
    () => nodes.find((n) => n.id === selectedId)?.data.page ?? null,
    [nodes, selectedId]
  );

  const handleSelectPage = useCallback((slug: string) => {
    setSelectedId(slug);
  }, []);
  const handleClearSelection = useCallback(() => setSelectedId(null), []);

  const onToggleStatus = useCallback((status: SitemapPageStatus) => {
    setVisibleStatuses((cur) => {
      const next = new Set(cur);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);
  const onResetFilters = useCallback(() => {
    setVisibleStatuses(new Set(ALL_STATUSES));
  }, []);

  const statusCounts = useMemo<Record<SitemapPageStatus, number>>(
    () => ({
      covered_on_page: stats.covered,
      content_gap: stats.gap,
      likely_exists_elsewhere: stats.likely
    }),
    [stats]
  );

  const sidebarConfig = renderSidebar?.({
    selectedPage,
    onSelectPage: handleSelectPage,
    onClearSelection: handleClearSelection
  });

  const allFiltered = visibleSlugs.size === 0 && nodes.length > 0;

  const filterBarEl = renderFilterBar?.({
    visibleStatuses,
    onToggleStatus,
    onResetFilters,
    statusCounts,
    displayMode,
    onChangeDisplayMode: setDisplayMode
  });

  return (
    <div className="space-y-3">
      {filterBarEl}

      {displayMode === "indented" ? (
        <div className="rounded-lg border bg-card p-3">
          <IndentedTreeWithStats
            sitemap={sitemap}
            selectedSlug={selectedId}
            onSelectPage={handleSelectPage}
            visibleStatuses={visibleStatuses}
            stats={stats}
          />
          {sidebarConfig && selectedPage ? (
            <div className="mt-4 rounded-md border bg-background/60 p-4">
              <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                {sidebarConfig.headerTitle}
              </div>
              {sidebarConfig.body}
            </div>
          ) : null}
        </div>
      ) : (
        <div className={cn("relative w-full overflow-hidden rounded-lg border bg-muted/20", heightClass)}>
          <ReactFlow
            nodes={styledNodes}
            edges={styledEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.15}
            maxZoom={1.5}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
          >
            <Background gap={20} size={1} />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => {
                const data = n.data as SitemapNodeData | undefined;
                if (!data) return "#94a3b8";
                if (data.isRoot) return "#f59e0b";
                return (
                  STATUS_COLORS[data.page.status as SitemapPageStatus] ?? "#94a3b8"
                );
              }}
              maskColor="hsl(var(--background) / 0.6)"
              style={{ right: 52, bottom: 12, left: undefined }}
            />
          </ReactFlow>

          <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-background/90 px-3 py-1.5 text-[11px] shadow-sm backdrop-blur">
            <div className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">
              Sitemap-Stats
            </div>
            <div className="flex items-center gap-3">
              <span>
                <strong className="font-bold">{stats.total}</strong>{" "}
                <span className="text-muted-foreground">gesamt</span>
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                <strong className="font-bold">{stats.covered}</strong> covered
              </span>
              <span className="text-amber-600 dark:text-amber-400">
                <strong className="font-bold">{stats.gap}</strong> gaps
              </span>
              <span className="text-muted-foreground">
                <strong className="font-bold">{stats.likely}</strong> likely
              </span>
            </div>
          </div>

          {orphans.length > 0 ? (
            <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
              {orphans.length} Page{orphans.length === 1 ? "" : "s"} übersprungen (orphan/cycle)
            </div>
          ) : null}

          {allFiltered ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-lg border bg-background/90 px-4 py-3 text-sm text-muted-foreground shadow backdrop-blur">
                Alle Status sind ausgefiltert — Filter wieder aktivieren.
              </div>
            </div>
          ) : null}

          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground italic">
            Slugs &amp; H1s sind LLM-Empfehlungen — Crawl-Verifikation folgt in einer späteren Version.
          </div>

          {sidebarConfig ? (
            <EntitySidebar
              collapsedLabel={sidebarConfig.collapsedLabel}
              headerTitle={sidebarConfig.headerTitle}
              headerIcon={sidebarConfig.headerIcon}
              body={sidebarConfig.body}
              onClose={handleClearSelection}
              showCloseButton={sidebarConfig.showCloseButton ?? selectedPage !== null}
            />
          ) : null}
        </div>
      )}

      {rootSlug && displayMode !== "indented" ? (
        <div className="text-[11px] text-muted-foreground">
          Root: <code className="font-mono">{rootSlug}</code> · max Tiefe: {stats.maxDepth} · Layout: {displayMode}
        </div>
      ) : null}
    </div>
  );
}
