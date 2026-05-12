"use client";

import { useMemo, useState } from "react";
import { Compass, Globe, Layers, Link2, Network, Search, Sliders, Sparkles, Tag, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { EntityMap } from "@/components/entity-graph/entity-map";
import { EntityDetailPanel } from "@/components/nlp/entity-detail-panel";
import {
  CLUSTER_CATEGORY,
  KEYWORD_CATEGORY,
  clustersToEntityGraph,
  type ClusterEntityInput,
  type ClusterEntityMapOptions
} from "@/lib/keyword-workspace/cluster-entity-map";

type Props = {
  subclusters: ClusterEntityInput[];
  siteUrl: string | null;
  runId: string | null;
  generatedAt: string | null;
};

const DEFAULT_OPTIONS: ClusterEntityMapOptions = {
  includeKeywords: false,
  topNKeywordsPerCluster: 5,
  relatedThreshold: 0.25,
  minClusterDemand: 0,
  minKeywordDemand: 0
};

export function WorkspaceEntityMapView({ subclusters, siteUrl, runId, generatedAt }: Props) {
  const [options, setOptions] = useState<ClusterEntityMapOptions>(DEFAULT_OPTIONS);

  const graph = useMemo(() => clustersToEntityGraph(subclusters, options), [subclusters, options]);
  const totalDemand = useMemo(
    () => subclusters.reduce((acc, c) => acc + (c.totalDemand ?? 0), 0),
    [subclusters]
  );
  const totalKeywords = useMemo(
    () => subclusters.reduce((acc, c) => acc + (c.keywordCount ?? 0), 0),
    [subclusters]
  );

  const largestCluster = useMemo(
    () =>
      subclusters
        .slice()
        .sort((a, b) => (b.totalDemand ?? 0) - (a.totalDemand ?? 0))[0] ?? null,
    [subclusters]
  );

  const clusterEntities = graph.entities.filter((e) => e.category === CLUSTER_CATEGORY);
  const clusterRelations = graph.relations.filter(
    (r) => r.predicate === "related_to"
  );

  const connectedness = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of clusterRelations) {
      counts.set(r.subject, (counts.get(r.subject) ?? 0) + 1);
      counts.set(r.object, (counts.get(r.object) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const mostConnected = sorted[0] ?? null;
    const isolatedNames = clusterEntities
      .map((e) => e.canonical_name)
      .filter((name) => !counts.has(name));
    return { mostConnected, isolated: isolatedNames };
  }, [clusterRelations, clusterEntities]);

  return (
    <div className="space-y-4">
      <WorkspaceProfile
        siteUrl={siteUrl}
        runId={runId}
        generatedAt={generatedAt}
        totalDemand={totalDemand}
        totalKeywords={totalKeywords}
        clusterCount={graph.filteredClusterCount}
        totalClusterCount={graph.totalClusterCount}
        relationCount={clusterRelations.length}
        largestCluster={largestCluster}
        mostConnected={connectedness.mostConnected}
        isolated={connectedness.isolated}
      />

      <FilterToolbar options={options} onChange={setOptions} />

      <div className="rounded-lg border bg-card">
        <EntityMap
          data={graph}
          heightClass="h-[72vh]"
          orphansLabel={(n) =>
            `${n} Cluster-Beziehung${n === 1 ? "" : "en"} nicht aufgelöst`
          }
          renderSidebar={({ selectedEntity, onSelectEntity, categoryColors }) => {
            if (!selectedEntity) {
              return {
                collapsedLabel: "Workspace",
                headerTitle: "Workspace-Insights",
                headerIcon: <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />,
                body: (
                  <WorkspaceInsights
                    subclusters={subclusters}
                    relationCount={clusterRelations.length}
                    isolated={connectedness.isolated}
                  />
                ),
                showCloseButton: false
              };
            }
            if (selectedEntity.category === CLUSTER_CATEGORY) {
              const cluster = graph.clusterIndex.get(selectedEntity.canonical_name);
              return {
                collapsedLabel: selectedEntity.canonical_name,
                headerTitle: selectedEntity.canonical_name,
                headerIcon: <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />,
                body: cluster ? (
                  <ClusterDetailPanel
                    cluster={cluster}
                    color={categoryColors[CLUSTER_CATEGORY] ?? "#64748b"}
                    siteUrl={siteUrl}
                  />
                ) : null,
                showCloseButton: true
              };
            }
            return {
              collapsedLabel: selectedEntity.canonical_name,
              headerTitle: selectedEntity.canonical_name,
              headerIcon: <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />,
              body: (
                <EntityDetailPanel
                  entity={selectedEntity}
                  color={categoryColors[selectedEntity.category] ?? "#64748b"}
                  relations={graph.relations}
                  onSelectEntity={onSelectEntity}
                />
              ),
              showCloseButton: true
            };
          }}
        />
      </div>
    </div>
  );
}

function WorkspaceProfile({
  siteUrl,
  runId,
  generatedAt,
  totalDemand,
  totalKeywords,
  clusterCount,
  totalClusterCount,
  relationCount,
  largestCluster,
  mostConnected,
  isolated
}: {
  siteUrl: string | null;
  runId: string | null;
  generatedAt: string | null;
  totalDemand: number;
  totalKeywords: number;
  clusterCount: number;
  totalClusterCount: number;
  relationCount: number;
  largestCluster: ClusterEntityInput | null;
  mostConnected: [string, number] | null;
  isolated: string[];
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300"
            >
              Topic-Universe
            </Badge>
            {runId ? (
              <Badge variant="outline" className="text-[10px] tracking-wide">
                Run {runId.slice(0, 8)}
              </Badge>
            ) : null}
            {generatedAt ? (
              <Badge variant="outline" className="text-[10px] tracking-wide">
                {new Date(generatedAt).toLocaleString()}
              </Badge>
            ) : null}
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Cluster-Universe
            </div>
            <h2 className="text-xl font-semibold leading-tight">
              {siteUrl ?? "Keyword-Workspace"}
            </h2>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {clusterCount === totalClusterCount
              ? `${clusterCount} Cluster mit ${totalKeywords.toLocaleString()} Keywords (${totalDemand.toLocaleString()} Demand/Monat). Kanten zwischen Clustern entstehen, wenn sich die Top-Ranker im SERP überschneiden.`
              : `${clusterCount} von ${totalClusterCount} Clustern angezeigt (Min-Demand-Filter aktiv). Kanten = Host-Overlap zwischen Clustern.`}
          </p>
          {largestCluster ? (
            <div className="text-xs text-muted-foreground">
              Größtes Cluster:{" "}
              <span className="font-medium text-foreground">{largestCluster.name}</span> ·{" "}
              {largestCluster.totalDemand.toLocaleString()} Demand
            </div>
          ) : null}
          {mostConnected ? (
            <div className="text-xs text-muted-foreground">
              Stärkste Verbindung:{" "}
              <span className="font-medium text-foreground">{mostConnected[0]}</span> ({mostConnected[1]} verknüpfte Cluster)
            </div>
          ) : null}
          {isolated.length ? (
            <div className="text-xs text-muted-foreground">
              {isolated.length} Cluster ohne SERP-Overlap zu anderen — eigenständige Themen oder eigene Pillar-Kandidaten.
            </div>
          ) : null}
        </div>

        <dl className="grid shrink-0 grid-cols-4 gap-2 text-center">
          <Stat icon={<Layers className="h-3.5 w-3.5" />} label="Cluster" value={clusterCount} />
          <Stat icon={<Tag className="h-3.5 w-3.5" />} label="Keywords" value={totalKeywords} />
          <Stat icon={<Network className="h-3.5 w-3.5" />} label="Verknüpfungen" value={relationCount} />
          <Stat icon={<Target className="h-3.5 w-3.5" />} label="Demand" value={totalDemand} compact />
        </dl>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  compact
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  compact?: boolean;
}) {
  const formatted = compact
    ? value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : value >= 1_000
        ? `${(value / 1_000).toFixed(1)}k`
        : value.toString()
    : value.toLocaleString();
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{formatted}</div>
    </div>
  );
}

function FilterToolbar({
  options,
  onChange
}: {
  options: ClusterEntityMapOptions;
  onChange: (next: ClusterEntityMapOptions) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Filter
          </span>
        </div>

        <ToolbarSwitch
          label="Keywords anzeigen"
          checked={options.includeKeywords}
          onChange={(v) => onChange({ ...options, includeKeywords: v })}
        />

        <ToolbarSlider
          label={`Top-N Keywords pro Cluster (${options.topNKeywordsPerCluster})`}
          value={options.topNKeywordsPerCluster}
          min={1}
          max={15}
          step={1}
          disabled={!options.includeKeywords}
          onChange={(v) => onChange({ ...options, topNKeywordsPerCluster: v })}
        />

        <ToolbarSlider
          label={`Cluster-Overlap (${options.relatedThreshold.toFixed(2)})`}
          value={options.relatedThreshold}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onChange({ ...options, relatedThreshold: v })}
          hint="Wann werden Cluster als verwandt verbunden? Höher = schärfer."
        />

        <ToolbarNumber
          label="Min Demand/Cluster"
          value={options.minClusterDemand}
          onChange={(v) => onChange({ ...options, minClusterDemand: v })}
        />
      </div>
    </div>
  );
}

function ToolbarSwitch({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function ToolbarSlider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  hint,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className={cn("flex min-w-[180px] flex-col gap-1", disabled && "opacity-50")} title={hint}>
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
    </div>
  );
}

function ToolbarNumber({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="h-7 w-24 text-xs"
      />
    </div>
  );
}

function ClusterDetailPanel({
  cluster,
  color,
  siteUrl
}: {
  cluster: ClusterEntityInput;
  color: string;
  siteUrl: string | null;
}) {
  const topKeywords = cluster.keywords
    .slice()
    .sort((a, b) => b.demandMonthly - a.demandMonthly)
    .slice(0, 20);

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
            {CLUSTER_CATEGORY}
          </span>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            pillar
          </Badge>
          <Badge variant="secondary" className="text-[11px]">
            {cluster.keywordCount} Keywords
          </Badge>
        </div>
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">{cluster.totalDemand.toLocaleString()}</span> Demand/Monat
          </div>
          {cluster.overlapScore != null ? (
            <div>SERP-Overlap intern: {(cluster.overlapScore * 100).toFixed(1)}%</div>
          ) : null}
        </div>
      </div>

      {cluster.topDomains?.length ? (
        <Block icon={<Globe className="h-3.5 w-3.5" />} label="Top-Domains im SERP">
          <div className="flex flex-wrap gap-1">
            {cluster.topDomains.slice(0, 12).map((d, i) => (
              <span
                key={`${d}-${i}`}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[11px]",
                  siteUrl && d.toLowerCase().includes(stripProtocol(siteUrl).toLowerCase())
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                    : "border-border bg-background text-foreground"
                )}
              >
                {d}
              </span>
            ))}
          </div>
        </Block>
      ) : null}

      {cluster.topUrls?.length ? (
        <Block icon={<Link2 className="h-3.5 w-3.5" />} label="Top-URLs">
          <ul className="space-y-1.5">
            {cluster.topUrls.slice(0, 5).map((url, i) => (
              <li key={`${url}-${i}`} className="text-xs">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-1 text-primary underline-offset-2 hover:underline"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <Block icon={<Search className="h-3.5 w-3.5" />} label={`Top ${topKeywords.length} Keywords`}>
        <ul className="space-y-1">
          {topKeywords.map((kw) => (
            <li key={kw.id} className="flex items-center justify-between gap-2 rounded-md border bg-background/50 px-2 py-1 text-xs">
              <span className="truncate">{kw.kwRaw}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {kw.demandMonthly.toLocaleString()}
              </span>
            </li>
          ))}
          {cluster.keywords.length > topKeywords.length ? (
            <li className="px-2 text-[11px] text-muted-foreground">
              + {cluster.keywords.length - topKeywords.length} weitere
            </li>
          ) : null}
        </ul>
      </Block>
    </div>
  );
}

function WorkspaceInsights({
  subclusters,
  relationCount,
  isolated
}: {
  subclusters: ClusterEntityInput[];
  relationCount: number;
  isolated: string[];
}) {
  const topByDemand = subclusters
    .slice()
    .sort((a, b) => b.totalDemand - a.totalDemand)
    .slice(0, 8);

  const allDomains = new Map<string, number>();
  for (const c of subclusters) {
    for (const d of c.topDomains ?? []) {
      allDomains.set(d, (allDomains.get(d) ?? 0) + 1);
    }
  }
  const topDomains = Array.from(allDomains.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Insight
        </div>
        <div className="text-base font-semibold leading-snug">
          Cluster-Topologie
        </div>
        <p className="text-xs text-muted-foreground">
          Klick auf einen Cluster für Detail-Ansicht. Kanten zeigen SERP-Host-Overlap zwischen Clustern.
        </p>
      </div>

      <Block icon={<Layers className="h-3.5 w-3.5" />} label={`Top Cluster nach Demand`}>
        <ul className="space-y-1">
          {topByDemand.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-background/50 px-2 py-1 text-xs"
            >
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {c.totalDemand.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block icon={<Network className="h-3.5 w-3.5" />} label="Cluster-Verknüpfungen">
        <p className="text-xs text-muted-foreground">
          {relationCount === 0
            ? "Keine Cluster sind über SERP-Hosts verbunden — Threshold ggf. senken."
            : `${relationCount} Verbindungslinien zwischen Clustern.`}
        </p>
      </Block>

      {isolated.length ? (
        <Block icon={<Compass className="h-3.5 w-3.5" />} label={`Isolierte Cluster (${isolated.length})`}>
          <div className="flex flex-wrap gap-1">
            {isolated.slice(0, 20).map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-800 dark:text-amber-200"
              >
                {name}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Eigene Themen ohne SERP-Überschneidung mit anderen Clustern.
          </p>
        </Block>
      ) : null}

      {topDomains.length ? (
        <Block icon={<Globe className="h-3.5 w-3.5" />} label="Häufigste Top-Domains">
          <ul className="space-y-1">
            {topDomains.map(([domain, count]) => (
              <li
                key={domain}
                className="flex items-center justify-between gap-2 rounded-md border bg-background/50 px-2 py-1 text-xs"
              >
                <span className="truncate">{domain}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {count}× in Top-3
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
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

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
