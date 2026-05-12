"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Star, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SitemapNodeData } from "@/lib/sitemap-graph/transform";
import type { SitemapPageStatus } from "@/lib/nlp/types";

type StatusStyle = {
  border: string;
  stripe: string;
  chipBg: string;
  chipText: string;
  chipBorder: string;
  label: string;
  Icon: typeof CheckCircle2;
};

const STATUS_STYLES: Record<SitemapPageStatus, StatusStyle> = {
  covered_on_page: {
    border: "border-emerald-500/70",
    stripe: "bg-emerald-500",
    chipBg: "bg-emerald-50 dark:bg-emerald-500/10",
    chipText: "text-emerald-700 dark:text-emerald-300",
    chipBorder: "border-emerald-300 dark:border-emerald-500/30",
    label: "auf dieser Seite",
    Icon: CheckCircle2
  },
  content_gap: {
    border: "border-amber-500/70 border-dashed",
    stripe: "bg-amber-500",
    chipBg: "bg-amber-50 dark:bg-amber-500/10",
    chipText: "text-amber-800 dark:text-amber-300",
    chipBorder: "border-amber-300 dark:border-amber-500/30",
    label: "content gap",
    Icon: AlertTriangle
  },
  likely_exists_elsewhere: {
    border: "border-zinc-300 dark:border-zinc-700",
    stripe: "bg-zinc-400 dark:bg-zinc-500",
    chipBg: "bg-zinc-50 dark:bg-zinc-800/40",
    chipText: "text-zinc-600 dark:text-zinc-400",
    chipBorder: "border-zinc-300 dark:border-zinc-700",
    label: "likely exists",
    Icon: HelpCircle
  }
};

function resolveStatusStyle(status: string): StatusStyle {
  if (status in STATUS_STYLES) {
    return STATUS_STYLES[status as SitemapPageStatus];
  }
  return STATUS_STYLES.likely_exists_elsewhere;
}

function PageCardNodeInner({ data, selected }: NodeProps<SitemapNodeData>) {
  const { page, isRoot, childCount, layout } = data;
  const style = resolveStatusStyle(page.status);
  const { Icon } = style;

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
            ? cn(style.border, "ring-2 ring-primary/30")
            : style.border
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
          isRoot ? "bg-gradient-to-r from-amber-500 to-yellow-400" : style.stripe
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

        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
              style.chipBg,
              style.chipText,
              style.chipBorder
            )}
          >
            <Icon className="h-2.5 w-2.5" />
            {style.label}
          </span>
          {childCount > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              {childCount} child{childCount === 1 ? "" : "ren"}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function humanizeRole(role: string): string {
  return role.replace(/_/g, " ");
}

export const PageCardNode = memo(PageCardNodeInner);
