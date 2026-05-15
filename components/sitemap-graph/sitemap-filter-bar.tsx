"use client";

import { useCallback, useState } from "react";
import {
  Clipboard,
  ClipboardCheck,
  AlignLeft,
  ArrowDownToLine,
  ArrowRightToLine,
  Sparkles,
  CircleDot
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SitemapDisplayMode } from "./sitemap-map";
import type { RecommendedSitemap } from "@/lib/nlp/types";

type FilterBarProps = {
  sitemap: RecommendedSitemap;
  displayMode: SitemapDisplayMode;
  onChangeDisplayMode: (mode: SitemapDisplayMode) => void;
};

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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
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
  );
}
