"use client";

import { useMemo } from "react";
import { ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { flattenSitemapForIndentedView } from "@/lib/sitemap-graph/transform";
import type { RecommendedSitemap } from "@/lib/nlp/types";

type Props = {
  sitemap: RecommendedSitemap;
  selectedSlug: string | null;
  onSelectPage: (slug: string) => void;
};

export function IndentedTree({ sitemap, selectedSlug, onSelectPage }: Props) {
  const rows = useMemo(() => flattenSitemapForIndentedView(sitemap), [sitemap]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Keine Pages im Sitemap.
      </div>
    );
  }

  return (
    <div className="divide-y rounded-md border">
      {rows.map(({ page, depth }) => {
        const isSelected = selectedSlug === page.slug;
        const isRoot = page.parent_slug === null;
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
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
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
  stats
}: Props & {
  stats: { total: number; maxDepth: number };
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold">{stats.total} Pages</span>
        <span className="text-muted-foreground">· max Tiefe {stats.maxDepth}</span>
      </div>
      <IndentedTree
        sitemap={sitemap}
        selectedSlug={selectedSlug}
        onSelectPage={onSelectPage}
      />
    </div>
  );
}
