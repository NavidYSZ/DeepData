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
import { transformToReactFlow, type EntityNodeData } from "@/lib/entity-graph/transform";
import type { EntityGraphEntity, EntityGraphInput } from "@/lib/entity-graph/types";
import { EntityCardNode } from "./entity-card-node";
import { EntitySidebar } from "./entity-sidebar";

const nodeTypes = { entityCard: EntityCardNode };

export type SidebarRenderArgs = {
  selectedEntity: EntityGraphEntity | null;
  onSelectEntity: (canonicalName: string) => void;
  onClearSelection: () => void;
  categoryColors: Record<string, string>;
};

export type SidebarConfig = {
  collapsedLabel: string;
  headerTitle: string;
  headerIcon?: ReactNode;
  body: ReactNode;
  showCloseButton?: boolean;
};

export type EntityMapProps = {
  data: EntityGraphInput;
  renderSidebar?: (args: SidebarRenderArgs) => SidebarConfig;
  orphansLabel?: (count: number) => string;
  heightClass?: string;
};

export function EntityMap(props: EntityMapProps) {
  return (
    <ReactFlowProvider>
      <EntityMapInner {...props} />
    </ReactFlowProvider>
  );
}

function EntityMapInner({
  data,
  renderSidebar,
  orphansLabel,
  heightClass = "h-[78vh]"
}: EntityMapProps) {
  const { nodes: initialNodes, edges: initialEdges, orphans, categoryColors } = useMemo(
    () => transformToReactFlow(data),
    [data]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setSelectedId(null);
    setHoveredId(null);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

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
  const styledEdges = useMemo(() => {
    if (!focusId) {
      return edges.map((e) => ({
        ...e,
        style: { stroke: "hsl(var(--muted-foreground) / 0.5)", strokeWidth: 1.25 },
        labelStyle: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
        labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.85 },
        animated: false
      }));
    }
    return edges.map((e) => {
      const incidental = e.source === focusId || e.target === focusId;
      return {
        ...e,
        style: {
          stroke: incidental ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.2)",
          strokeWidth: incidental ? 2 : 1
        },
        labelStyle: {
          fontSize: 11,
          fill: incidental ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.5)"
        },
        labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.9 },
        animated: incidental,
        zIndex: incidental ? 1 : 0
      };
    });
  }, [edges, focusId]);

  const styledNodes = useMemo<Node<EntityNodeData>[]>(() => {
    if (!focusId) return nodes;
    const connectedIds = new Set<string>([focusId]);
    edges.forEach((e) => {
      if (e.source === focusId) connectedIds.add(e.target);
      if (e.target === focusId) connectedIds.add(e.source);
    });
    return nodes.map((n) => ({
      ...n,
      style: { ...n.style, opacity: connectedIds.has(n.id) ? 1 : 0.35 }
    }));
  }, [nodes, edges, focusId]);

  const selectedEntity = useMemo(
    () => data.entities.find((e) => e.canonical_name === selectedId) ?? null,
    [data.entities, selectedId]
  );

  const handleSelectEntity = useCallback((canonicalName: string) => {
    setSelectedId(canonicalName);
  }, []);
  const handleClearSelection = useCallback(() => setSelectedId(null), []);

  const sidebarConfig = renderSidebar?.({
    selectedEntity,
    onSelectEntity: handleSelectEntity,
    onClearSelection: handleClearSelection,
    categoryColors
  });

  return (
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
        minZoom={0.2}
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
          nodeColor={(n) => (n.data as EntityNodeData | undefined)?.color ?? "#94a3b8"}
          maskColor="hsl(var(--background) / 0.6)"
          style={{ right: 52, bottom: 12, left: undefined }}
        />
      </ReactFlow>

      {orphans.length > 0 ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
          {orphansLabel?.(orphans.length) ??
            `${orphans.length} Relation${orphans.length === 1 ? "" : "en"} ohne passende Entity übersprungen`}
        </div>
      ) : null}

      {sidebarConfig ? (
        <EntitySidebar
          collapsedLabel={sidebarConfig.collapsedLabel}
          headerTitle={sidebarConfig.headerTitle}
          headerIcon={sidebarConfig.headerIcon}
          body={sidebarConfig.body}
          onClose={handleClearSelection}
          showCloseButton={sidebarConfig.showCloseButton ?? selectedEntity !== null}
        />
      ) : null}
    </div>
  );
}
