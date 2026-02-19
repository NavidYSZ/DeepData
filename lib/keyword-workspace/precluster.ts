import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { normalizeKeyword, NormalizedKeyword } from "./normalize";

type KeywordInput = {
  id: string;
  kwRaw: string;
  demandMonthly: number;
};

export type PreclusterResult = {
  clusters: {
    id: string;
    label: string;
    totalDemand: number;
    cohesion: number;
    keywordIds: string[];
  }[];
  memberships: { keywordId: string; preclusterId: string; score: number }[];
  algoVersion: string;
};

type Vector = Map<string, number>;

function charNgrams(text: string, minN = 3, maxN = 5) {
  const grams: string[] = [];
  const padded = ` ${text} `;
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i <= padded.length - n; i++) {
      grams.push(padded.slice(i, i + n));
    }
  }
  return grams;
}

function tfidfVectors(items: { id: string; terms: string[] }[]): Record<string, Vector> {
  const df = new Map<string, number>();
  for (const item of items) {
    const unique = new Set(item.terms);
    unique.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  }
  const totalDocs = items.length;
  const vectors: Record<string, Vector> = {};
  for (const item of items) {
    const tf = new Map<string, number>();
    item.terms.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    const vec = new Map<string, number>();
    tf.forEach((count, term) => {
      const idf = Math.log((totalDocs + 1) / ((df.get(term) || 0) + 1)) + 1;
      vec.set(term, count * idf);
    });
    vectors[item.id] = vec;
  }
  return vectors;
}

function cosineSim(a: Vector, b: Vector): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  a.forEach((va, k) => {
    const vb = b.get(k);
    if (vb) dot += va * vb;
    normA += va * va;
  });
  b.forEach((vb) => {
    normB += vb * vb;
  });
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

export function runPrecluster(keywords: KeywordInput[], seed = 42): PreclusterResult {
  const algoVersion = "lex-charstem-v1";
  if (keywords.length === 0) {
    return { clusters: [], memberships: [], algoVersion };
  }

  const normalized: Record<string, NormalizedKeyword> = {};
  const itemsChar: { id: string; terms: string[] }[] = [];
  const itemsStem: { id: string; terms: string[] }[] = [];

  for (const kw of keywords) {
    const norm = normalizeKeyword(kw.kwRaw);
    if (!norm) continue;
    normalized[kw.id] = norm;
    itemsChar.push({ id: kw.id, terms: charNgrams(norm.kwNorm) });
    itemsStem.push({ id: kw.id, terms: norm.kwSig.split(" ").filter(Boolean) });
  }

  const charVectors = tfidfVectors(itemsChar);
  const stemVectors = tfidfVectors(itemsStem);

  const ids = Object.keys(normalized);
  const similarities: Record<string, number> = {};
  function simKey(a: string, b: string) {
    return `${a}::${b}`;
  }
  const graph = new Graph({ type: "undirected" });
  ids.forEach((id) => graph.addNode(id));

  for (let i = 0; i < ids.length; i++) {
    const idA = ids[i];
    const vecAChar = charVectors[idA];
    const vecAStem = stemVectors[idA];
    for (let j = i + 1; j < ids.length; j++) {
      const idB = ids[j];
      const scoreChar = cosineSim(vecAChar, charVectors[idB]);
      const scoreStem = cosineSim(vecAStem, stemVectors[idB]);
      const score = 0.7 * scoreChar + 0.3 * scoreStem;
      if (score >= 0.55) {
        graph.addEdgeWithKey(simKey(idA, idB), idA, idB, { weight: score });
        similarities[simKey(idA, idB)] = score;
      }
    }
  }

  const communities = louvain(graph, {
    getEdgeWeight: "weight",
    resolution: 1.0,
    randomSeed: seed
  });

  const clusterMap = new Map<string, string[]>();
  Object.entries(communities).forEach(([node, community]) => {
    if (!clusterMap.has(community)) clusterMap.set(community, []);
    clusterMap.get(community)!.push(node);
  });

  const clusters: PreclusterResult["clusters"] = [];
  const memberships: PreclusterResult["memberships"] = [];

  for (const [communityId, memberIds] of clusterMap.entries()) {
    const memberKw = memberIds.map((id) => keywords.find((k) => k.id === id)!);
    const totalDemand = memberKw.reduce((sum, k) => sum + (k.demandMonthly || 0), 0);

    // cohesion
    let pairSum = 0;
    let pairCount = 0;
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const key = simKey(memberIds[i], memberIds[j]);
        const keyAlt = simKey(memberIds[j], memberIds[i]);
        const s = similarities[key] ?? similarities[keyAlt] ?? 0;
        pairSum += s;
        pairCount += 1;
      }
    }
    const cohesion = memberIds.length <= 1 ? 1 : pairSum / Math.max(pairCount, 1);

    // label via medoid (highest avg similarity); fallback highest demand
    let bestId = memberIds[0];
    let bestScore = -1;
    for (const id of memberIds) {
      let sum = 0;
      for (const other of memberIds) {
        if (id === other) continue;
        const key = simKey(id, other);
        const keyAlt = simKey(other, id);
        sum += similarities[key] ?? similarities[keyAlt] ?? 0;
      }
      const avg = memberIds.length > 1 ? sum / (memberIds.length - 1) : 1;
      if (avg > bestScore) {
        bestScore = avg;
        bestId = id;
      }
    }
    const bestKw = keywords.find((k) => k.id === bestId);
    const label =
      bestKw?.kwRaw ||
      memberKw.sort((a, b) => (b.demandMonthly || 0) - (a.demandMonthly || 0))[0]?.kwRaw ||
      "Cluster";

    clusters.push({
      id: communityId,
      label,
      totalDemand,
      cohesion,
      keywordIds: memberIds
    });

    memberIds.forEach((id) => {
      const score = memberIds.length === 1 ? 1 : bestScore;
      memberships.push({ keywordId: id, preclusterId: communityId, score });
    });
  }

  clusters.sort((a, b) => {
    if (b.totalDemand !== a.totalDemand) return b.totalDemand - a.totalDemand;
    if (a.label !== b.label) return a.label.localeCompare(b.label);
    return a.id.localeCompare(b.id);
  });

  return { clusters, memberships, algoVersion };
}
