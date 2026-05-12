"use client";

import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Quote,
  Layers,
  Tags,
  Info,
  ArrowDown,
  ArrowUp
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { findChildPages, findParentPage } from "@/lib/sitemap-graph/transform";
import type {
  ExtractionEntity,
  RecommendedPage,
  SitemapPageStatus
} from "@/lib/nlp/types";

type StatusMeta = {
  label: string;
  className: string;
  Icon: typeof CheckCircle2;
};

const STATUS_META: Record<SitemapPageStatus, StatusMeta> = {
  covered_on_page: {
    label: "auf dieser Seite abgedeckt",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
    Icon: CheckCircle2
  },
  content_gap: {
    label: "Content Gap — sollte neu angelegt werden",
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
    Icon: AlertTriangle
  },
  likely_exists_elsewhere: {
    label: "existiert wahrscheinlich (nicht im Text)",
    className:
      "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300",
    Icon: HelpCircle
  }
};

function resolveStatusMeta(status: string): StatusMeta {
  if (status in STATUS_META) return STATUS_META[status as SitemapPageStatus];
  return STATUS_META.likely_exists_elsewhere;
}

export function SitemapDetailPanel({
  page,
  allPages,
  entities,
  onSelectPage
}: {
  page: RecommendedPage;
  allPages: RecommendedPage[];
  entities: ExtractionEntity[];
  onSelectPage: (slug: string) => void;
}) {
  const meta = resolveStatusMeta(page.status);
  const { Icon } = meta;
  const parent = findParentPage(page.slug, allPages);
  const children = findChildPages(page.slug, allPages);

  const evidenceEntities = entities.filter(
    (e) =>
      page.covers_entities.includes(e.canonical_name) && e.definition_in_text
  );

  return (
    <div className="space-y-5 text-sm">
      {/* Header */}
      <div className="space-y-2">
        <code className="block truncate font-mono text-xs text-muted-foreground">
          {page.slug}
        </code>
        <div className="text-base font-semibold leading-tight">{page.h1}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${meta.className}`}
          >
            <Icon className="h-3 w-3" />
            {meta.label}
          </span>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {page.page_role.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      {/* Rationale */}
      {page.rationale ? (
        <Block icon={<Info className="h-3.5 w-3.5" />} label="Begründung">
          <p className="italic text-muted-foreground">&ldquo;{page.rationale}&rdquo;</p>
        </Block>
      ) : null}

      {/* Target queries */}
      {page.target_queries?.length ? (
        <Block icon={<Tags className="h-3.5 w-3.5" />} label={`Target Queries (${page.target_queries.length})`}>
          <div className="flex flex-wrap gap-1">
            {page.target_queries.map((q, i) => (
              <span
                key={`tq-${i}`}
                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
              >
                {q}
              </span>
            ))}
          </div>
        </Block>
      ) : null}

      {/* Covers entities */}
      {page.covers_entities?.length ? (
        <Block
          icon={<Layers className="h-3.5 w-3.5" />}
          label={`deckt ab — Entities (${page.covers_entities.length})`}
        >
          <div className="flex flex-wrap gap-1">
            {page.covers_entities.map((e, i) => (
              <span
                key={`ce-${i}`}
                className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200"
              >
                {e}
              </span>
            ))}
          </div>
        </Block>
      ) : null}

      {/* Covers subtopics */}
      {page.covers_subtopics?.length ? (
        <Block
          icon={<Layers className="h-3.5 w-3.5" />}
          label={`deckt ab — Subtopics (${page.covers_subtopics.length})`}
        >
          <div className="flex flex-wrap gap-1">
            {page.covers_subtopics.map((s, i) => (
              <span
                key={`cs-${i}`}
                className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
              >
                {s}
              </span>
            ))}
          </div>
        </Block>
      ) : null}

      {/* Parent */}
      {parent ? (
        <Block icon={<ArrowUp className="h-3.5 w-3.5" />} label="Eltern-Page">
          <PageRow page={parent} onSelectPage={onSelectPage} />
        </Block>
      ) : null}

      {/* Children */}
      {children.length ? (
        <Block
          icon={<ArrowDown className="h-3.5 w-3.5" />}
          label={`Child-Pages (${children.length})`}
        >
          <ul className="space-y-1.5">
            {children.map((c) => (
              <li key={c.slug}>
                <PageRow page={c} onSelectPage={onSelectPage} />
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {/* Evidence from Phase 3 definitions */}
      {evidenceEntities.length > 0 ? (
        <Block icon={<Quote className="h-3.5 w-3.5" />} label="Evidence aus Phase 3">
          <ul className="space-y-2">
            {evidenceEntities.map((e) => (
              <li key={e.canonical_name} className="rounded-md border bg-background/50 p-2">
                <div className="text-[11px] font-medium text-foreground">
                  {e.canonical_name}
                </div>
                <p className="mt-0.5 text-[11px] italic text-muted-foreground line-clamp-3">
                  &ldquo;{e.definition_in_text}&rdquo;
                </p>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </div>
  );
}

function PageRow({
  page,
  onSelectPage
}: {
  page: RecommendedPage;
  onSelectPage: (slug: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectPage(page.slug)}
      className="block w-full rounded-md border bg-background/50 p-2 text-left transition hover:border-primary/50 hover:bg-background"
    >
      <code className="block truncate font-mono text-[10px] text-muted-foreground">
        {page.slug}
      </code>
      <div className="text-xs font-medium text-foreground line-clamp-1">{page.h1}</div>
    </button>
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
