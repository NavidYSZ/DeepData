import type {
  EntityGraphEntity,
  EntityGraphInput,
  EntityGraphRelation
} from "@/lib/entity-graph/types";

export type ClusterKeyword = {
  id: string;
  kwRaw: string;
  demandMonthly: number;
  demandSource?: string;
  difficultyScore?: number | null;
};

export type ClusterEntityInput = {
  id: string;
  name: string;
  totalDemand: number;
  keywordCount: number;
  keywords: ClusterKeyword[];
  topDomains?: string[];
  topUrls?: string[];
  overlapScore?: number | null;
};

export type ClusterEntityMapOptions = {
  includeKeywords: boolean;
  topNKeywordsPerCluster: number;
  relatedThreshold: number;
  minClusterDemand: number;
  minKeywordDemand: number;
};

export const DEFAULT_CLUSTER_ENTITY_MAP_OPTIONS: ClusterEntityMapOptions = {
  includeKeywords: false,
  topNKeywordsPerCluster: 5,
  relatedThreshold: 0.25,
  minClusterDemand: 0,
  minKeywordDemand: 0
};

export const CLUSTER_CATEGORY = "Topic-Cluster";
export const KEYWORD_CATEGORY = "Keyword";

export type ClusterEntityMapResult = EntityGraphInput & {
  clusterIndex: Map<string, ClusterEntityInput>;
  filteredClusterCount: number;
  totalClusterCount: number;
};

function jaccard(a: string[] | undefined, b: string[] | undefined): number {
  if (!a?.length || !b?.length) return 0;
  const sa = new Set(a.map((s) => s.toLowerCase()));
  const sb = new Set(b.map((s) => s.toLowerCase()));
  let intersect = 0;
  for (const x of sa) if (sb.has(x)) intersect++;
  const union = sa.size + sb.size - intersect;
  return union > 0 ? intersect / union : 0;
}

export function clustersToEntityGraph(
  subclusters: ClusterEntityInput[],
  opts: Partial<ClusterEntityMapOptions> = {}
): ClusterEntityMapResult {
  const options: ClusterEntityMapOptions = {
    ...DEFAULT_CLUSTER_ENTITY_MAP_OPTIONS,
    ...opts
  };

  const filtered = subclusters.filter((c) => c.totalDemand >= options.minClusterDemand);

  const entities: EntityGraphEntity[] = [];
  const relations: EntityGraphRelation[] = [];
  const clusterIndex = new Map<string, ClusterEntityInput>();

  const clusterNameToCanonical = new Map<string, string>();

  for (const cluster of filtered) {
    let canonicalName = cluster.name;
    if (clusterNameToCanonical.has(canonicalName)) {
      canonicalName = `${cluster.name} (${cluster.id.slice(0, 6)})`;
    }
    clusterNameToCanonical.set(cluster.name, canonicalName);
    clusterIndex.set(canonicalName, cluster);

    const definitionParts: string[] = [];
    if (cluster.keywordCount) definitionParts.push(`${cluster.keywordCount} Keywords`);
    if (cluster.totalDemand) definitionParts.push(`${cluster.totalDemand.toLocaleString()} Demand/Monat`);
    if (cluster.topDomains?.length) {
      definitionParts.push(`Top: ${cluster.topDomains.slice(0, 3).join(", ")}`);
    }

    entities.push({
      name: cluster.name,
      canonical_name: canonicalName,
      category: CLUSTER_CATEGORY,
      mentions: Math.max(1, Math.round(cluster.totalDemand)),
      semantic_role: "pillar",
      definition_in_text: definitionParts.length ? definitionParts.join(" · ") : null
    });
  }

  if (options.includeKeywords) {
    const seenKeyword = new Set<string>();
    for (const cluster of filtered) {
      const canonicalClusterName = Array.from(clusterIndex.entries()).find(
        ([, c]) => c.id === cluster.id
      )?.[0];
      if (!canonicalClusterName) continue;

      const topKeywords = cluster.keywords
        .filter((k) => k.demandMonthly >= options.minKeywordDemand)
        .sort((a, b) => b.demandMonthly - a.demandMonthly)
        .slice(0, options.topNKeywordsPerCluster);

      for (const kw of topKeywords) {
        let kwName = kw.kwRaw;
        if (seenKeyword.has(kwName) || clusterIndex.has(kwName)) {
          kwName = `${kw.kwRaw} (#${kw.id.slice(0, 4)})`;
        }
        seenKeyword.add(kwName);

        entities.push({
          name: kw.kwRaw,
          canonical_name: kwName,
          category: KEYWORD_CATEGORY,
          mentions: Math.max(1, Math.round(kw.demandMonthly)),
          semantic_role: "supporting",
          definition_in_text: kw.demandSource
            ? `${kw.demandMonthly.toLocaleString()} Demand · ${kw.demandSource}`
            : `${kw.demandMonthly.toLocaleString()} Demand/Monat`
        });

        relations.push({
          subject: canonicalClusterName,
          predicate: "covers_query",
          object: kwName,
          evidence:
            cluster.topUrls?.[0] ??
            (cluster.topDomains?.length ? `Top-Domain: ${cluster.topDomains[0]}` : "")
        });
      }
    }
  }

  for (let i = 0; i < filtered.length; i++) {
    for (let j = i + 1; j < filtered.length; j++) {
      const a = filtered[i];
      const b = filtered[j];
      const score = jaccard(a.topDomains, b.topDomains);
      if (score >= options.relatedThreshold) {
        const canA = Array.from(clusterIndex.entries()).find(([, c]) => c.id === a.id)?.[0];
        const canB = Array.from(clusterIndex.entries()).find(([, c]) => c.id === b.id)?.[0];
        if (!canA || !canB) continue;
        const shared = (a.topDomains ?? []).filter((d) =>
          (b.topDomains ?? []).map((x) => x.toLowerCase()).includes(d.toLowerCase())
        );
        relations.push({
          subject: canA,
          predicate: "related_to",
          object: canB,
          evidence:
            shared.length > 0
              ? `Gemeinsame Hosts (${score.toFixed(2)}): ${shared.slice(0, 3).join(", ")}`
              : `Host-Overlap ${score.toFixed(2)}`
        });
      }
    }
  }

  return {
    entities,
    relations,
    clusterIndex,
    filteredClusterCount: filtered.length,
    totalClusterCount: subclusters.length
  };
}
