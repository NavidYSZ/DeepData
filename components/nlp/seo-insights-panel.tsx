"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ExtractionOutput } from "@/lib/nlp/types";

export function SeoInsightsPanel({ data }: { data: ExtractionOutput }) {
  const { meta, seo, entities, relations } = data;
  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pillar</div>
        <div className="text-base font-semibold leading-snug">{seo.pillar_topic}</div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Badge variant="outline" className="text-[10px]">
            {meta.page_type}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {meta.intent}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            depth: {seo.coverage_depth}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {meta.language}
          </Badge>
        </div>
        <div className="pt-1 text-xs text-muted-foreground">{meta.domain}</div>
        {meta.audience ? (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Zielgruppe:</span> {meta.audience}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Entities" value={entities.length} />
        <Stat label="Relationen" value={relations.length} />
        <Stat label="Kategorien" value={data.schema.categories.length} />
      </div>

      <ChipBlock label="Subtopics" items={seo.subtopics} />
      <ChipBlock label="Content Gaps" items={seo.content_gaps} tone="warning" />
      <ChipBlock label="Target Queries" items={seo.target_queries} />
      <ChipBlock label="Related Clusters" items={seo.related_clusters} />
      <ChipBlock label="Semantic Field" items={seo.semantic_field} muted />
      <ChipBlock label="Competing Topics" items={seo.competing_topics} tone="danger" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-base font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function ChipBlock({
  label,
  items,
  tone,
  muted
}: {
  label: string;
  items: string[];
  tone?: "warning" | "danger";
  muted?: boolean;
}) {
  if (!items?.length) return null;
  const toneCls =
    tone === "warning"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
      : tone === "danger"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200"
        : muted
          ? "border-border/60 bg-muted/40 text-muted-foreground"
          : "border-border bg-background text-foreground";
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((it, i) => (
          <span
            key={`${label}-${i}`}
            className={cn("rounded-md border px-1.5 py-0.5 text-[11px]", toneCls)}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}
