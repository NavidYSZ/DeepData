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

  const pillarClusterId =
    filtered.length > 0
      ? filtered.reduce(
          (best, c) => (c.totalDemand > best.totalDemand ? c : best),
          filtered[0]
        ).id
      : null;

  const entities: EntityGraphEntity[] = [];
  const relations: EntityGraphRelation[] = [];
  const clusterIndex = new Map<string, ClusterEntityInput>();

  const clusterNameToCanonical = new Map<string, string>();
  const idToCanonical = new Map<string, string>();

  for (const cluster of filtered) {
    let canonicalName = cluster.name;
    if (clusterNameToCanonical.has(canonicalName)) {
      canonicalName = `${cluster.name} (${cluster.id.slice(0, 6)})`;
    }
    clusterNameToCanonical.set(cluster.name, canonicalName);
    clusterIndex.set(canonicalName, cluster);
    idToCanonical.set(cluster.id, canonicalName);

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
      semantic_role: cluster.id === pillarClusterId ? "pillar" : "supporting",
      definition_in_text: definitionParts.length ? definitionParts.join(" · ") : null
    });
  }

  if (options.includeKeywords) {
    const seenKeyword = new Set<string>();
    for (const cluster of filtered) {
      const canonicalClusterName = idToCanonical.get(cluster.id);
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

  type CandidateEdge = {
    a: ClusterEntityInput;
    b: ClusterEntityInput;
    score: number;
    shared: string[];
  };
  const candidates: CandidateEdge[] = [];
  for (let i = 0; i < filtered.length; i++) {
    for (let j = i + 1; j < filtered.length; j++) {
      const a = filtered[i];
      const b = filtered[j];
      const score = jaccard(a.topDomains, b.topDomains);
      const shared = (a.topDomains ?? []).filter((d) =>
        (b.topDomains ?? []).map((x) => x.toLowerCase()).includes(d.toLowerCase())
      );
      candidates.push({ a, b, score, shared });
    }
  }
  candidates.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    const aTouchesPillar =
      x.a.id === pillarClusterId || x.b.id === pillarClusterId ? 1 : 0;
    const bTouchesPillar =
      y.a.id === pillarClusterId || y.b.id === pillarClusterId ? 1 : 0;
    return bTouchesPillar - aTouchesPillar;
  });

  const parent = new Map<string, string>();
  for (const c of filtered) parent.set(c.id, c.id);
  const find = (id: string): string => {
    let cur = id;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
    let p = id;
    while (parent.get(p) !== cur) {
      const next = parent.get(p)!;
      parent.set(p, cur);
      p = next;
    }
    return cur;
  };
  const union = (x: string, y: string) => {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return false;
    parent.set(rx, ry);
    return true;
  };

  for (const edge of candidates) {
    if (!union(edge.a.id, edge.b.id)) continue;
    const canA = idToCanonical.get(edge.a.id);
    const canB = idToCanonical.get(edge.b.id);
    if (!canA || !canB) continue;
    const aIsPillar = edge.a.id === pillarClusterId;
    const subject = aIsPillar ? canA : canB;
    const object = aIsPillar ? canB : canA;
    const meetsThreshold = edge.score >= options.relatedThreshold;
    const evidence = meetsThreshold
      ? edge.shared.length > 0
        ? `Gemeinsame Hosts (${edge.score.toFixed(2)}): ${edge.shared.slice(0, 3).join(", ")}`
        : `Host-Overlap ${edge.score.toFixed(2)}`
      : edge.score > 0
        ? `Schwacher Overlap ${edge.score.toFixed(2)}`
        : "Kein SERP-Overlap (synthetisch verbunden)";
    relations.push({
      subject,
      predicate: "related_to",
      object,
      evidence
    });
  }

  return {
    entities,
    relations,
    clusterIndex,
    filteredClusterCount: filtered.length,
    totalClusterCount: subclusters.length
  };
}
