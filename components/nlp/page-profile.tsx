"use client";

import {
  BookOpen,
  Compass,
  Layers,
  Lightbulb,
  Network,
  Target,
  Users,
  Boxes,
  Telescope
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ExtractionOutput } from "@/lib/nlp/types";

const HUB_PAGE_TYPES = new Set(["pillar_page", "category_page"]);

export type AnalyzedClusterRef = {
  subclusterId: string;
  name: string;
  topKeyword: string;
  sourceCount: number;
  entityCount?: number;
  relationCount?: number;
};

export function PageProfile({
  data,
  analyzedClusters
}: {
  data: ExtractionOutput;
  /**
   * If present, the profile reframes itself as a CROSS-CLUSTER topical
   * authority overview (used by /api/nlp/clusters/analyze). Each entry
   * is shown as a row under "Analysierte Cluster". When omitted the
   * profile renders the legacy single-page narrative.
   */
  analyzedClusters?: AnalyzedClusterRef[];
}) {
  const { meta, seo, entities, relations } = data;
  const isMultiCluster = (analyzedClusters?.length ?? 0) > 0;
  const isHub = HUB_PAGE_TYPES.has(meta.page_type);
  const pillarEntities = entities.filter((e) => e.semantic_role === "pillar");

  return (
    <div className="space-y-5">
      {/* ── Top header: pillar topic + summary + badges ───────────────── */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {isMultiCluster ? (
                <Badge
                  variant="outline"
                  className="border-violet-500/40 bg-violet-500/10 text-[11px] font-medium text-violet-700 dark:text-violet-200"
                >
                  Cross-Cluster Topical Authority
                </Badge>
              ) : (
                <RoleBadge isHub={isHub} pageType={meta.page_type} />
              )}
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {meta.intent}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {meta.language}
              </Badge>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {isMultiCluster ? "Übergeordnetes Pillar-Topic" : "Pillar-Topic"}
              </div>
              <h2 className="text-2xl font-semibold leading-tight">{seo.pillar_topic}</h2>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {isMultiCluster ? (
                <>
                  Konsolidierte Sicht über{" "}
                  <span className="font-medium text-foreground">
                    {analyzedClusters!.length} Cluster
                  </span>
                  . Die Subtopics unten sind die Cluster selbst plus daraus abgeleitete
                  Themen — jeder ein Kandidat für eine eigenständige Pillar-Child-Page.
                </>
              ) : isHub ? (
                <>
                  Pillar/Übersichtsseite des Clusters{" "}
                  <span className="font-medium text-foreground">{seo.pillar_topic}</span>.
                  Die Subtopics unten sind Kandidaten für Child-Pages.
                </>
              ) : (
                <>
                  Child-Page im Cluster{" "}
                  <span className="font-medium text-foreground">{seo.pillar_topic}</span>.
                  Die zugehörige Pillar-Übersichtsseite müsste das Cluster als Ganzes
                  abdecken und auf diese hier verlinken.
                </>
              )}
            </p>
          </div>

          <CoverageDepthBar depth={seo.coverage_depth} />
        </div>
      </div>

      {/* ── Stats grid ────────────────────────────────────────────────── */}
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat
          icon={<Network className="h-3.5 w-3.5" />}
          label="Entities"
          value={entities.length}
        />
        <Stat
          icon={<Target className="h-3.5 w-3.5" />}
          label="Pillar-Entities"
          value={pillarEntities.length}
          tone="emerald"
        />
        <Stat
          icon={<Layers className="h-3.5 w-3.5" />}
          label="Relationen"
          value={relations.length}
        />
        <Stat
          icon={<BookOpen className="h-3.5 w-3.5" />}
          label="Subtopics"
          value={seo.subtopics.length}
        />
      </dl>

      {/* ── Analyzed clusters (multi-cluster mode only) ───────────────── */}
      {isMultiCluster ? (
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Boxes className="h-3.5 w-3.5" />
            <span>Analysierte Cluster ({analyzedClusters!.length})</span>
          </div>
          <ul className="space-y-1">
            {analyzedClusters!.map((c) => (
              <li
                key={c.subclusterId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/30 px-3 py-2 text-sm"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono text-xs text-foreground">{c.topKeyword}</span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {c.sourceCount} Quellen
                  </Badge>
                  {typeof c.entityCount === "number" ? (
                    <Badge variant="outline" className="text-[10px]">
                      {c.entityCount} Entities
                    </Badge>
                  ) : null}
                  {typeof c.relationCount === "number" ? (
                    <Badge variant="outline" className="text-[10px]">
                      {c.relationCount} Rel
                    </Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── Domain + Audience (2-col) ────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2">
        <KeyValueCard
          icon={<Compass className="h-3.5 w-3.5" />}
          label="Domäne"
          value={meta.domain}
        />
        <KeyValueCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Zielgruppe"
          value={meta.audience}
        />
      </div>

      {/* ── Subtopics ─────────────────────────────────────────────────── */}
      <Section
        icon={<BookOpen className="h-3.5 w-3.5" />}
        label={isMultiCluster ? "Subtopics (= Cluster + abgeleitete Themen)" : "Subtopics"}
        hint={
          isMultiCluster
            ? "Die ausgewählten Cluster sind hier als Subtopics aufgeführt, plus daraus abgeleitete Sub-Themen."
            : isHub
              ? "Diese Subtopics werden hier abgedeckt — jeweils ein Kandidat für eine eigene Child-Page."
              : "Diese Subtopics behandelt diese Child-Page bereits."
        }
        items={seo.subtopics}
      />

      {/* ── Content Gaps (highlighted as opportunities) ────────────────── */}
      <Section
        icon={<Lightbulb className="h-3.5 w-3.5" />}
        label="Content-Gaps — Ranking-Opportunities"
        hint={
          isMultiCluster
            ? "Aspekte, die quer durch die Cluster ERWÄHNT aber kaum belegt sind — Kandidaten für neue Pillar-Child-Pages."
            : isHub
              ? "Themen, die im Text erwähnt aber nicht ausgeführt werden — Bauanleitung für neue Child-Seiten."
              : "Themen, die hier nur gestreift werden — entweder ausbauen oder verlinken."
        }
        items={seo.content_gaps}
        tone="opportunity"
      />

      {/* ── Related clusters ─────────────────────────────────────────── */}
      <Section
        icon={<Network className="h-3.5 w-3.5" />}
        label="Verwandte Cluster (interne Verlinkung)"
        hint="Angrenzende Topic-Cluster, zu denen interne Links sinnvoll wären."
        items={seo.related_clusters}
      />

      {/* ── Target queries (subtle) ──────────────────────────────────── */}
      {seo.target_queries.length ? (
        <Section
          icon={<Target className="h-3.5 w-3.5" />}
          label="Target Queries"
          hint="Suchanfragen, für die diese Topical Authority plausibel ranken sollte."
          items={seo.target_queries}
          muted
        />
      ) : null}

      {/* ── Semantic field (very subtle) ──────────────────────────────── */}
      {seo.semantic_field?.length ? (
        <Section
          icon={<Telescope className="h-3.5 w-3.5" />}
          label="Semantic Field"
          hint="Thematisch eng verwandte Begriffe, die das topical lexicon definieren."
          items={seo.semantic_field}
          muted
        />
      ) : null}

      {/* ── Competing topics (warning) ───────────────────────────────── */}
      {seo.competing_topics.length ? (
        <Section
          icon={<Layers className="h-3.5 w-3.5" />}
          label="Konkurrierende Themen (Fokus-Verwässerung)"
          hint="Themen die zusätzlich behandelt werden und den Fokus verwässern."
          items={seo.competing_topics}
          tone="danger"
        />
      ) : null}
    </div>
  );
}

function CoverageDepthBar({ depth }: { depth: string }) {
  const active = depth === "deep" ? 3 : depth === "moderate" ? 2 : depth === "shallow" ? 1 : 0;
  const segs: Array<{ key: "shallow" | "moderate" | "deep"; label: string }> = [
    { key: "shallow", label: "shallow" },
    { key: "moderate", label: "moderate" },
    { key: "deep", label: "deep" }
  ];
  return (
    <div className="shrink-0 rounded-md border bg-background/70 p-3">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        Coverage Depth
      </div>
      <div className="flex items-end gap-1">
        {segs.map((seg, i) => {
          const isActive = i + 1 === active;
          const isPast = i + 1 < active;
          const height = i === 0 ? "h-2" : i === 1 ? "h-4" : "h-6";
          return (
            <div key={seg.key} className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-5 rounded-sm",
                  height,
                  isActive
                    ? "bg-primary"
                    : isPast
                      ? "bg-primary/40"
                      : "bg-muted-foreground/20"
                )}
              />
              <span
                className={cn(
                  "text-[9px] uppercase tracking-wider",
                  isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {seg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoleBadge({ isHub, pageType }: { isHub: boolean; pageType: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        isHub
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
          : "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-200"
      )}
    >
      {isHub ? "Hub / Pillar" : "Child / Spoke"}
      <span className="opacity-60">·</span>
      <span className="font-normal">{pageType}</span>
    </span>
  );
}

function Stat({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "emerald";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/30 px-3 py-2",
        tone === "emerald" &&
          "border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-500/15"
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "mt-0.5 text-2xl font-semibold tabular-nums",
          tone === "emerald" && "text-emerald-700 dark:text-emerald-200"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function KeyValueCard({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm leading-snug">{value}</div>
    </div>
  );
}

function Section({
  icon,
  label,
  hint,
  items,
  tone,
  muted
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  items: string[];
  tone?: "opportunity" | "danger";
  muted?: boolean;
}) {
  if (!items?.length) return null;
  const toneCls =
    tone === "opportunity"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
      : tone === "danger"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200"
        : muted
          ? "border-border/60 bg-muted/40 text-muted-foreground"
          : "border-border bg-background text-foreground";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={`${label}-${i}`}
            className={cn("rounded-md border px-2 py-0.5 text-xs", toneCls)}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}
