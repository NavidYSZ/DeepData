"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Star
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  flattenSitemapForIndentedView,
  STATUS_COLORS
} from "@/lib/sitemap-graph/transform";
import type {
  RecommendedPage,
  RecommendedSitemap,
  SitemapPageStatus
} from "@/lib/nlp/types";

type StatusMeta = {
  Icon: typeof CheckCircle2;
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
};

const STATUS_META: Record<SitemapPageStatus, StatusMeta> = {
  covered_on_page: {
    Icon: CheckCircle2,
    label: "covered",
    textClass: "text-emerald-700 dark:text-emerald-300",
    bgClass: "bg-emerald-50 dark:bg-emerald-500/10",
    borderClass: "border-emerald-300 dark:border-emerald-500/30"
  },
  content_gap: {
    Icon: AlertTriangle,
    label: "gap",
    textClass: "text-amber-800 dark:text-amber-300",
    bgClass: "bg-amber-50 dark:bg-amber-500/10",
    borderClass: "border-amber-300 dark:border-amber-500/30"
  },
  likely_exists_elsewhere: {
    Icon: HelpCircle,
    label: "likely",
    textClass: "text-zinc-600 dark:text-zinc-400",
    bgClass: "bg-zinc-50 dark:bg-zinc-800/40",
    borderClass: "border-zinc-300 dark:border-zinc-700"
  }
};

function getStatusMeta(status: string): StatusMeta {
  return STATUS_META[status as SitemapPageStatus] ?? STATUS_META.likely_exists_elsewhere;
}

type Props = {
  sitemap: RecommendedSitemap;
  selectedSlug: string | null;
  onSelectPage: (slug: string) => void;
  visibleStatuses: Set<SitemapPageStatus>;
};

export function IndentedTree({
  sitemap,
  selectedSlug,
  onSelectPage,
  visibleStatuses
}: Props) {
  const rows = useMemo(() => flattenSitemapForIndentedView(sitemap), [sitemap]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Keine Pages im Sitemap.
      </div>
    );
  }

  const visibleRows = rows.filter((r) =>
    visibleStatuses.has(r.page.status as SitemapPageStatus)
  );

  if (visibleRows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Alle Status sind ausgefiltert — Filter wieder aktivieren.
      </div>
    );
  }

  return (
    <div className="divide-y rounded-md border">
      {visibleRows.map(({ page, depth }) => {
        const meta = getStatusMeta(page.status);
        const isSelected = selectedSlug === page.slug;
        const isRoot = page.parent_slug === null;
        const { Icon } = meta;
        return (
          <button
            key={page.slug}
            type="button"
            onClick={() => onSelectPage(page.slug)}
            className={cn(
              "group flex w-full items-center gap-2 px-3 py-2 text-left transition",
              "hover:bg-muted/50",
              isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/30"
            )}
            style={{ paddingLeft: `${12 + depth * 20}px` }}
          >
            {/* indent guides */}
            {depth > 0 ? (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            ) : (
              <span className="w-3" />
            )}

            {/* pillar star */}
            {isRoot ? (
              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500" />
            ) : (
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    STATUS_COLORS[page.status as SitemapPageStatus] ?? "#94a3b8"
                }}
              />
            )}

            {/* slug */}
            <code className="shrink-0 truncate font-mono text-[11px] text-muted-foreground">
              {page.slug}
            </code>

            {/* h1 */}
            <span
              className={cn(
                "flex-1 truncate text-sm",
                isRoot ? "font-bold" : "font-medium"
              )}
            >
              {page.h1}
            </span>

            {/* role */}
            <span className="hidden shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground md:inline">
              {page.page_role.replace(/_/g, " ")}
            </span>

            {/* status chip */}
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                meta.bgClass,
                meta.textClass,
                meta.borderClass
              )}
            >
              <Icon className="h-2.5 w-2.5" />
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function IndentedTreeWithStats({
  sitemap,
  selectedSlug,
  onSelectPage,
  visibleStatuses,
  stats
}: Props & {
  stats: { total: number; covered: number; gap: number; likely: number; maxDepth: number };
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold">
          {stats.total} Pages
        </span>
        <span className="text-emerald-600 dark:text-emerald-400">
          {stats.covered} covered
        </span>
        <span className="text-amber-600 dark:text-amber-400">
          {stats.gap} gaps
        </span>
        <span className="text-muted-foreground">
          {stats.likely} likely
        </span>
        <span className="text-muted-foreground">
          · max Tiefe {stats.maxDepth}
        </span>
      </div>
      <IndentedTree
        sitemap={sitemap}
        selectedSlug={selectedSlug}
        onSelectPage={onSelectPage}
        visibleStatuses={visibleStatuses}
      />
    </div>
  );
}
