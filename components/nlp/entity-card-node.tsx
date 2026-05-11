"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Star, Circle, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntityNodeData } from "@/lib/nlp/entity-map";

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
          ? "border-foreground/70 ring-1 ring-foreground/40"
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
        {isPillar ? (
          <Star className="ml-auto h-3 w-3 shrink-0 text-amber-500" aria-label="Pillar" />
        ) : null}
      </div>

      <div className="px-3 py-2">
        <div className="line-clamp-2 text-sm font-semibold leading-snug">
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
