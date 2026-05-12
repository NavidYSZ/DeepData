"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Star, Circle, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntityNodeData } from "@/lib/entity-graph/transform";

function EntityCardNodeInner({ data, selected }: NodeProps<EntityNodeData>) {
  const { entity, color, incomingCount, outgoingCount } = data;
  const isPillar = entity.semantic_role === "pillar";
  const isPeripheral = entity.semantic_role === "peripheral";
  const linkCount = incomingCount + outgoingCount;

  return (
    <div
      className={cn(
        "group relative w-[240px] cursor-pointer rounded-lg border bg-card text-card-foreground shadow-sm transition-all",
        "hover:shadow-md hover:-translate-y-0.5",
        isPillar
          ? "border-amber-500/70 ring-2 ring-amber-500/40"
          : selected
            ? "border-primary ring-1 ring-primary/40"
            : "border-border",
        isPeripheral && "opacity-70"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/40"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/40"
      />

      {isPillar ? (
        <div className="absolute -top-2.5 left-2 inline-flex items-center gap-1 rounded-full border border-amber-500/70 bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white shadow-sm">
          <Star className="h-2.5 w-2.5 fill-white" />
          Pillar
        </div>
      ) : null}

      <div
        className="flex items-center gap-2 rounded-t-lg px-3 py-1.5"
        style={{ backgroundColor: `${color}22` }}
      >
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {entity.category}
        </span>
      </div>

      <div className="px-3 py-2">
        <div className={cn("line-clamp-2 leading-snug", isPillar ? "text-base font-bold" : "text-sm font-semibold")}>
          {entity.canonical_name}
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Circle className="h-2.5 w-2.5" />
            {entity.mentions}× erwähnt
          </span>
          {linkCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-2.5 w-2.5" />
              {linkCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const EntityCardNode = memo(EntityCardNodeInner);
