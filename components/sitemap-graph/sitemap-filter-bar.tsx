"use client";

import { useCallback, useState } from "react";
import { Check, Clipboard, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecommendedSitemap, SitemapPageStatus } from "@/lib/nlp/types";

type FilterBarProps = {
  sitemap: RecommendedSitemap;
  visibleStatuses: Set<SitemapPageStatus>;
  onToggleStatus: (status: SitemapPageStatus) => void;
  onResetFilters: () => void;
  statusCounts: Record<SitemapPageStatus, number>;
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

export function SitemapFilterBar({
  sitemap,
  visibleStatuses,
  onToggleStatus,
  onResetFilters,
  statusCounts
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
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

      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={onCopyJson}
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 hover:bg-muted/40"
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
    </div>
  );
}
