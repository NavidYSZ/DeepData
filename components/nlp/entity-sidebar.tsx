"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
  Quote,
  Sparkles,
  Tag,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  ExtractionEntity,
  ExtractionOutput,
  ExtractionRelation
} from "@/lib/nlp/types";
import { humanizePredicate, relationsForEntity } from "@/lib/nlp/entity-map";

const COLLAPSED_WIDTH = 44;
const EXPANDED_WIDTH = 380;

type Props = {
  data: ExtractionOutput;
  categoryColors: Record<string, string>;
  selectedEntity: ExtractionEntity | null;
  onClearSelection: () => void;
  onSelectEntity: (canonicalName: string) => void;
};

export function EntitySidebar({
  data,
  categoryColors,
  selectedEntity,
  onClearSelection,
  onSelectEntity
}: Props) {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = hoverExpanded || pinned;

  return (
    <aside
      onMouseEnter={() => setHoverExpanded(true)}
      onMouseLeave={() => setHoverExpanded(false)}
      className={cn(
        "absolute right-0 top-0 z-20 flex h-full flex-col border-l bg-card shadow-lg transition-[width] duration-200 ease-out"
      )}
      style={{ width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
      data-expanded={expanded}
    >
      {/* Collapsed rail */}
      {!expanded ? (
        <div className="flex h-full flex-col items-center gap-3 py-3 text-muted-foreground">
          <ChevronLeft className="h-4 w-4" aria-label="Sidebar einblenden" />
          <div className="mt-1 flex h-full flex-col items-center gap-3 text-[10px] uppercase tracking-widest">
            <span className="[writing-mode:vertical-rl] rotate-180 select-none">
              {selectedEntity ? selectedEntity.canonical_name : "Insights"}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
              {selectedEntity ? (
                <>
                  <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{selectedEntity.canonical_name}</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">SEO Insights</span>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setPinned((p) => !p)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={pinned ? "Sidebar lösen" : "Sidebar pinnen"}
                title={pinned ? "Sidebar lösen" : "Sidebar pinnen"}
              >
                <ChevronRight
                  className={cn("h-4 w-4 transition-transform", pinned && "rotate-180")}
                />
              </button>
              {selectedEntity ? (
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Auswahl aufheben"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-4 py-4">
              {selectedEntity ? (
                <EntityDetail
                  entity={selectedEntity}
                  color={categoryColors[selectedEntity.category] ?? "#64748b"}
                  relations={data.relations}
                  onSelectEntity={onSelectEntity}
                />
              ) : (
                <SeoInsights data={data} />
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  );
}

function EntityDetail({
  entity,
  color,
  relations,
  onSelectEntity
}: {
  entity: ExtractionEntity;
  color: string;
  relations: ExtractionRelation[];
  onSelectEntity: (canonicalName: string) => void;
}) {
  const { outgoing, incoming } = relationsForEntity(entity.canonical_name, relations);

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${color}22`, color }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {entity.category}
          </span>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {entity.semantic_role}
          </Badge>
          <Badge variant="secondary" className="text-[11px]">
            {entity.mentions}× erwähnt
          </Badge>
        </div>
        {entity.name !== entity.canonical_name ? (
          <div className="text-xs text-muted-foreground">
            Im Text als <span className="font-medium text-foreground">&ldquo;{entity.name}&rdquo;</span>
          </div>
        ) : null}
      </div>

      {entity.definition_in_text ? (
        <Block icon={<Info className="h-3.5 w-3.5" />} label="Definition im Text">
          <p className="text-sm italic text-muted-foreground">&ldquo;{entity.definition_in_text}&rdquo;</p>
        </Block>
      ) : null}

      <Block
        icon={<Layers className="h-3.5 w-3.5" />}
        label={`Ausgehende Relationen (${outgoing.length})`}
      >
        {outgoing.length ? (
          <ul className="space-y-2">
            {outgoing.map((r, i) => (
              <RelationRow
                key={`out-${i}`}
                direction="out"
                relation={r}
                otherName={r.object}
                onSelectEntity={onSelectEntity}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">keine</p>
        )}
      </Block>

      <Block
        icon={<Layers className="h-3.5 w-3.5 -scale-x-100" />}
        label={`Eingehende Relationen (${incoming.length})`}
      >
        {incoming.length ? (
          <ul className="space-y-2">
            {incoming.map((r, i) => (
              <RelationRow
                key={`in-${i}`}
                direction="in"
                relation={r}
                otherName={r.subject}
                onSelectEntity={onSelectEntity}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">keine</p>
        )}
      </Block>
    </div>
  );
}

function RelationRow({
  direction,
  relation,
  otherName,
  onSelectEntity
}: {
  direction: "in" | "out";
  relation: ExtractionRelation;
  otherName: string;
  onSelectEntity: (canonicalName: string) => void;
}) {
  return (
    <li className="rounded-md border bg-background/50 p-2">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
          {humanizePredicate(relation.predicate)}
        </span>
        <span className="text-muted-foreground">{direction === "out" ? "→" : "←"}</span>
        <button
          type="button"
          onClick={() => onSelectEntity(otherName)}
          className="truncate font-medium text-foreground underline-offset-2 hover:underline"
        >
          {otherName}
        </button>
      </div>
      {relation.evidence ? (
        <div className="mt-1.5 flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <Quote className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-3 italic">{relation.evidence}</span>
        </div>
      ) : null}
    </li>
  );
}

function SeoInsights({ data }: { data: ExtractionOutput }) {
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

function Block({
  icon,
  label,
  children
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}
