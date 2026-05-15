"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SitemapNodeData } from "@/lib/sitemap-graph/transform";

function PageCardNodeInner({ data, selected }: NodeProps<SitemapNodeData>) {
  const { page, isRoot, childCount, layout } = data;

  // For LR layout: handles on Left (target) / Right (source).
  // For TB / tidy: handles on Top (target) / Bottom (source).
  // For radial: keep top/bottom but they barely matter visually.
  const targetPos = layout === "LR" ? Position.Left : Position.Top;
  const sourcePos = layout === "LR" ? Position.Right : Position.Bottom;

  return (
    <div
      className={cn(
        "group relative w-[220px] cursor-pointer rounded-lg border-2 bg-card text-card-foreground shadow-sm transition-all",
        "hover:shadow-md hover:-translate-y-0.5",
        isRoot
          ? "border-amber-500 ring-2 ring-amber-500/30"
          : selected
            ? "border-primary/60 ring-2 ring-primary/30"
            : "border-border"
      )}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/40"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/40"
      />

      {isRoot ? (
        <div className="absolute -top-2.5 left-2 inline-flex items-center gap-1 rounded-full border border-amber-500/70 bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white shadow-sm">
          <Star className="h-2.5 w-2.5 fill-white" />
          Pillar Page
        </div>
      ) : null}

      <div
        className={cn(
          "h-1 w-full rounded-t-[6px]",
          isRoot
            ? "bg-gradient-to-r from-amber-500 to-yellow-400"
            : "bg-muted-foreground/30"
        )}
      />

      <div className="px-3 py-2.5">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">
          {humanizeRole(page.page_role)}
        </div>
        <code className="block truncate font-mono text-[11px] text-muted-foreground">
          {page.slug}
        </code>
        <div
          className={cn(
            "mt-1 line-clamp-2 leading-snug",
            isRoot ? "text-sm font-bold" : "text-xs font-semibold"
          )}
        >
          {page.h1}
        </div>

        {childCount > 0 ? (
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            {childCount} child{childCount === 1 ? "" : "ren"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function humanizeRole(role: string): string {
  return role.replace(/_/g, " ");
}

export const PageCardNode = memo(PageCardNodeInner);
