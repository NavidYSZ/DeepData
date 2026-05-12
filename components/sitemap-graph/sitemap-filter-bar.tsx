"use client";

import { useCallback, useState } from "react";
import {
  Check,
  Clipboard,
  ClipboardCheck,
  LayoutGrid,
  AlignLeft,
  ArrowDownToLine,
  ArrowRightToLine,
  Sparkles,
  CircleDot
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SitemapDisplayMode } from "./sitemap-map";
import type { RecommendedSitemap, SitemapPageStatus } from "@/lib/nlp/types";

type FilterBarProps = {
  sitemap: RecommendedSitemap;
  visibleStatuses: Set<SitemapPageStatus>;
  onToggleStatus: (status: SitemapPageStatus) => void;
  onResetFilters: () => void;
  statusCounts: Record<SitemapPageStatus, number>;
  displayMode: SitemapDisplayMode;
  onChangeDisplayMode: (mode: SitemapDisplayMode) => void;
};

const STATUS_LABELS: Record<SitemapPageStatus, string> = {
  covered_on_page: "covered on page",
  content_gap: "content gap",
  likely_exists_elsewhere: "likely exists"
};

const STATUS_DOT: Record<SitemapPageStatus, string> = {
  covered_on_page: "bg-emerald-500",
  content_gap: "bg-amber-500",
  likely_exists_elsewhere: "bg-zinc-400"
};

const STATUS_ON_CLASS: Record<SitemapPageStatus, string> = {
  covered_on_page:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  content_gap:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  likely_exists_elsewhere:
    "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-200"
};

const ALL: SitemapPageStatus[] = [
  "covered_on_page",
  "content_gap",
  "likely_exists_elsewhere"
];

const MODES: {
  value: SitemapDisplayMode;
  label: string;
  Icon: typeof ArrowDownToLine;
  tooltip: string;
}[] = [
  {
    value: "TB",
    label: "Top-Down",
    Icon: ArrowDownToLine,
    tooltip: "Pillar oben, Children fließen nach unten (Dagre)"
  },
  {
    value: "LR",
    label: "Left-Right",
    Icon: ArrowRightToLine,
    tooltip: "Pillar links, Children fließen nach rechts (Dagre)"
  },
  {
    value: "tidy",
    label: "Tidy Tree",
    Icon: Sparkles,
    tooltip: "Mathematisch zentrierter Baum, jeder Parent mittig über Children"
  },
  {
    value: "radial",
    label: "Radial",
    Icon: CircleDot,
    tooltip: "Pillar im Zentrum, Children radial nach außen"
  },
  {
    value: "indented",
    label: "Liste",
    Icon: AlignLeft,
    tooltip: "Eingerückte URL-Liste (File-Explorer-Stil)"
  }
];

export function SitemapFilterBar({
  sitemap,
  visibleStatuses,
  onToggleStatus,
  onResetFilters,
  statusCounts,
  displayMode,
  onChangeDisplayMode
}: FilterBarProps) {
  const [copied, setCopied] = useState(false);

  const onCopyJson = useCallback(async () => {
    try {
      const payload = JSON.stringify(sitemap.pages ?? [], null, 2);
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard unavailable
    }
  }, [sitemap]);

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      {/* Row 1: layout selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Ansicht:
          </span>
          <div className="inline-flex overflow-hidden rounded-md border bg-background">
            {MODES.map((mode) => {
              const active = displayMode === mode.value;
              const Icon = mode.Icon;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => onChangeDisplayMode(mode.value)}
                  title={mode.tooltip}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border-r last:border-r-0 transition",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted/50 text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onCopyJson}
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-muted/40"
        >
          {copied ? (
            <>
              <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>kopiert</span>
            </>
          ) : (
            <>
              <Clipboard className="h-3.5 w-3.5" />
              <span>Als JSON kopieren</span>
            </>
          )}
        </button>
      </div>

      {/* Row 2: status filters */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
        <span className="mr-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Filter:
        </span>
        {ALL.map((status) => {
          const on = visibleStatuses.has(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => onToggleStatus(status)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition",
                on
                  ? STATUS_ON_CLASS[status]
                  : "border-zinc-200 bg-background text-muted-foreground hover:bg-muted/40 dark:border-zinc-800"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[status])} />
              {STATUS_LABELS[status]} ({statusCounts[status] ?? 0})
              {on ? <Check className="h-3 w-3" /> : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onResetFilters}
          className="ml-1 rounded-md border border-transparent px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40"
        >
          alle anzeigen
        </button>
      </div>
    </div>
  );
}
