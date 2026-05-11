"use client";

import { BookOpen, Compass, Layers, Lightbulb, Network, Target, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ExtractionOutput } from "@/lib/nlp/types";

const HUB_PAGE_TYPES = new Set(["pillar_page", "category_page"]);

export function PageProfile({ data }: { data: ExtractionOutput }) {
  const { meta, seo, entities, relations } = data;
  const isHub = HUB_PAGE_TYPES.has(meta.page_type);
  const pillarEntities = entities.filter((e) => e.semantic_role === "pillar");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <RoleBadge isHub={isHub} pageType={meta.page_type} />
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {meta.intent}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              depth: {seo.coverage_depth}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {meta.language}
            </Badge>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Pillar-Topic
            </div>
            <h2 className="text-xl font-semibold leading-tight">{seo.pillar_topic}</h2>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isHub ? (
              <>
                Diese Seite ist eine <span className="font-medium text-foreground">Übersichts-/Pillar-Seite</span>{" "}
                für das Cluster <span className="font-medium text-foreground">{seo.pillar_topic}</span>. Die
                Subtopics unten sind Kandidaten für eigenständige Child-Seiten.
              </>
            ) : (
              <>
                Diese Seite ist eine <span className="font-medium text-foreground">Child-Seite</span> im Cluster{" "}
                <span className="font-medium text-foreground">{seo.pillar_topic}</span>. Die
                Pillar/Übersichtsseite müsste das Cluster als Ganzes abdecken und auf diese hier verlinken.
              </>
            )}
          </p>
        </div>

        <dl className="grid shrink-0 grid-cols-3 gap-2 text-center lg:grid-cols-3">
          <Stat icon={<Network className="h-3.5 w-3.5" />} label="Entities" value={entities.length} />
          <Stat icon={<Layers className="h-3.5 w-3.5" />} label="Relationen" value={relations.length} />
          <Stat
            icon={<Target className="h-3.5 w-3.5" />}
            label="Pillar-Entities"
            value={pillarEntities.length}
          />
        </dl>
      </div>

      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <Field icon={<Compass className="h-3.5 w-3.5" />} label="Domäne">
          {meta.domain}
        </Field>
        <Field icon={<Users className="h-3.5 w-3.5" />} label="Zielgruppe">
          {meta.audience}
        </Field>
      </div>

      <Section
        icon={<BookOpen className="h-3.5 w-3.5" />}
        label="Subtopics in dieser Seite"
        hint={
          isHub
            ? "Diese Subtopics werden hier abgedeckt — jeweils ein Kandidat für eine eigene Child-Page."
            : "Diese Subtopics behandelt diese Child-Page bereits."
        }
        items={seo.subtopics}
      />

      <Section
        icon={<Lightbulb className="h-3.5 w-3.5" />}
        label={isHub ? "Mögliche weitere Child-Pages (Content-Gaps)" : "Content-Gaps (Lücken auf dieser Seite)"}
        hint={
          isHub
            ? "Themen, die im Text erwähnt aber nicht ausgeführt werden — Bauanleitung für neue Child-Seiten."
            : "Themen, die hier nur gestreift werden — entweder ausbauen oder verlinken."
        }
        items={seo.content_gaps}
        tone="warning"
      />

      <Section
        icon={<Network className="h-3.5 w-3.5" />}
        label="Verwandte Cluster (interne Verlinkung)"
        hint="Angrenzende Topic-Cluster, zu denen interne Links sinnvoll wären."
        items={seo.related_clusters}
      />

      {seo.target_queries.length ? (
        <Section
          icon={<Target className="h-3.5 w-3.5" />}
          label="Target Queries"
          hint="Suchanfragen, für die diese Seite plausibel ranken könnte."
          items={seo.target_queries}
          muted
        />
      ) : null}

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
      {isHub ? "Hub / Übersichtsseite" : "Child-Page / Spoke"}
      <span className="opacity-60">·</span>
      <span className="font-normal">{pageType}</span>
    </span>
  );
}

function Stat({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Field({
  icon,
  label,
  children
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm">{children}</div>
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
