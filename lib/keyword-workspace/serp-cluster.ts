import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { nanoid } from "nanoid";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { prisma } from "@/lib/db";
import { searchAnalyticsQuery } from "@/lib/gsc";
import {
  ensureWorkspaceSource,
  ingestSourceMetrics,
  recomputeDemandForProject
} from "@/lib/keyword-workspace/service";

type KeywordLite = {
  id: string;
  kwRaw: string;
  demandMonthly: number;
};

type ClusteredSubcluster = {
  id: string;
  label: string;
  keywordIds: string[];
  members: KeywordLite[];
  totalDemand: number;
  keywordCount: number;
  topDomains: string[];
  topUrls: string[];
  overlapScore: number;
};

type NormalizedUrl = {
  url: string;
  host: string;
  path: string;
};

type SerpTopUrl = {
  url: string;
  position?: number;
};

type SerpFetchResult = {
  urls: SerpTopUrl[];
  status: number;
  durationMs: number;
  raw?: any;
  error?: string;
};

type SnapshotLite = {
  status: string;
  httpStatus: number | null;
  topUrlsJson: string | null;
};

type ParentJson = {
  parents: { name: string; subclusterIds: string[]; rationale?: string }[];
};

const MAX_CONCURRENCY = 8;
const MAX_FETCH_WAVES = 3;
const SNAPSHOT_SCAN_LIMIT = 5;
const GSC_DAYS = 180;
const DEFAULT_MODEL = "gpt-4o";
const FETCH_MAX_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = 25_000;
const FETCH_BASE_BACKOFF_MS = 1_500;
const FETCH_BACKOFF_FACTOR = 2;
const FETCH_JITTER_RATIO = 0.3;
const FETCH_RATE_LIMIT_MIN_BACKOFF_MS = 5_000;

function createLimiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

function normalizeSerpUrl(raw: string): NormalizedUrl | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.search = "";
    const host = u.host.toLowerCase();
    let path = u.pathname.replace(/\/+$/, "") || "/";
    const url = `${u.protocol}//${host}${path}`;
    return { url, host, path };
  } catch {
    return null;
  }
}

function takeTopResults(urls: SerpTopUrl[], topResults: number): NormalizedUrl[] {
  return urls
    .slice()
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .slice(0, topResults)
    .map((u) => normalizeSerpUrl(u.url))
    .filter((u): u is NormalizedUrl => Boolean(u));
}

function topFromCounts(map: Map<string, number>, limit = 5) {
  return Array.from(map.entries())
    .sort((a, b) => {
      if (b[1] === a[1]) return a[0].localeCompare(b[0]);
      return b[1] - a[1];
    })
    .slice(0, limit)
    .map(([key]) => key);
}

function jaccard(a: Set<string>, b: Set<string>) {
  const inter = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  return inter.size / union.size;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(ms: number, ratio = FETCH_JITTER_RATIO) {
  const delta = ms * ratio;
  const jitter = (Math.random() * 2 - 1) * delta;
  return Math.max(0, Math.round(ms + jitter));
}

function retryDelayMs(attempt: number, status?: number) {
  const exp = Math.max(0, attempt - 1);
  const base = FETCH_BASE_BACKOFF_MS * Math.pow(FETCH_BACKOFF_FACTOR, exp);
  const withRateLimit = status === 429 ? Math.max(base, FETCH_RATE_LIMIT_MIN_BACKOFF_MS) : base;
  return withJitter(withRateLimit);
}

function parseTopUrlsJson(topUrlsJson: string | null): SerpTopUrl[] {
  if (!topUrlsJson) return [];
  try {
    const parsed = JSON.parse(topUrlsJson);
    if (!Array.isArray(parsed)) return [];
    const urls: SerpTopUrl[] = [];
    for (const item of parsed) {
      if (!item || typeof item.url !== "string") continue;
      urls.push({
        url: item.url,
        position: typeof item.position === "number" ? item.position : undefined
      });
    }
    return urls;
  } catch {
    return [];
  }
}

function hasUsableHosts(urls: SerpTopUrl[], topResults: number) {
  return takeTopResults(urls, topResults).length > 0;
}

function isReusableSnapshot(snapshot: SnapshotLite, topResults: number) {
  if (snapshot.status !== "ok") return false;
  const status = snapshot.httpStatus ?? 0;
  if (status < 200 || status >= 300) return false;
  const urls = parseTopUrlsJson(snapshot.topUrlsJson);
  return hasUsableHosts(urls, topResults);
}

async function fetchZyteSerp(keyword: string): Promise<SerpFetchResult> {
  const apiKey = process.env.ZYTE_API_KEY;
  if (!apiKey) {
    return { urls: [], status: 0, durationMs: 0, error: "ZYTE_API_KEY missing" };
  }

  const body = {
    url: `https://www.google.de/search?q=${encodeURIComponent(keyword)}&hl=de`,
    serp: true,
    serpOptions: { extractFrom: "httpResponseBody" },
    geolocation: "DE",
    device: "desktop",
    followRedirect: true
  };

  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response | null = null;
    try {
      res = await fetch("https://api.zyte.com/v1/extract", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timeout);
      const durationMs = Date.now() - started;
      if (attempt < FETCH_MAX_ATTEMPTS) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      const reason = e instanceof Error && e.name === "AbortError" ? "timeout" : "network_error";
      return { urls: [], status: 0, durationMs, error: `${reason}: ${String(e)}` };
    } finally {
      clearTimeout(timeout);
    }

    const durationMs = Date.now() - started;
    const status = res.status;

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }

    const organicResults: any[] = json?.serp?.organicResults ?? [];
    const urls: SerpTopUrl[] = organicResults
      .filter((r: any) => r?.url)
      .slice(0, 10)
      .map((r: any) => ({ url: r.url, position: r.rank ?? 0 }));

    const hasParseableUrls = hasUsableHosts(urls, 10);
    const retryableStatus = status === 429 || status >= 500;
    const retryableEmptyResult = status >= 200 && status < 300 && !hasParseableUrls;
    const shouldRetry = (retryableStatus || retryableEmptyResult) && attempt < FETCH_MAX_ATTEMPTS;
    if (shouldRetry) {
      await sleep(retryDelayMs(attempt, status));
      continue;
    }

    return {
      urls,
      status,
      durationMs,
      raw: json,
      error:
        status >= 400
          ? json?.message ?? `fetch_failed_${status}`
          : !hasParseableUrls
            ? "no_parseable_urls"
            : undefined
    };
  }

  return { urls: [], status: 0, durationMs: 0, error: "max_retries" };
}

function buildOverlapGraph(keywords: KeywordLite[], urlHosts: Record<string, Set<string>>, threshold: number) {
  const g = new Graph({ type: "undirected" });
  keywords.forEach((k) => g.addNode(k.id));

  for (let i = 0; i < keywords.length; i++) {
    const a = keywords[i];
    const hostsA = urlHosts[a.id] ?? new Set<string>();
    if (!hostsA.size) continue;
    for (let j = i + 1; j < keywords.length; j++) {
      const b = keywords[j];
      const hostsB = urlHosts[b.id] ?? new Set<string>();
      if (!hostsB.size) continue;
      const interSize = [...hostsA].filter((h) => hostsB.has(h)).length;
      const jac = jaccard(hostsA, hostsB);
      if (jac >= threshold || interSize >= 3) {
        g.addEdge(a.id, b.id, { weight: jac || 0.0001 });
      }
    }
  }
  return g;
}

function clusterGraph(
  graph: Graph,
  keywords: KeywordLite[],
  urlHosts: Record<string, Set<string>>,
  keywordUrls: Record<string, Set<string>>
) {
  const communities = louvain(graph, {
    attributes: { weight: "weight" },
    resolution: 1.0,
    rng: Math.random,
    weighted: true
  });
  const byCommunity = new Map<string, KeywordLite[]>();
  Object.entries(communities).forEach(([nodeId, community]) => {
    const list = byCommunity.get(String(community)) ?? [];
    const kw = keywords.find((k) => k.id === nodeId);
    if (kw) list.push(kw);
    byCommunity.set(String(community), list);
  });

  return Array.from(byCommunity.entries()).map(([communityId, members]) => {
    const memberIds = members.map((m) => m.id);
    // label: medoid by host overlap
    let bestId = memberIds[0];
    let bestScore = -1;
    for (const id of memberIds) {
      const hosts = urlHosts[id] ?? new Set<string>();
      let sum = 0;
      for (const other of memberIds) {
        if (other === id) continue;
        const hostsB = urlHosts[other] ?? new Set<string>();
        sum += jaccard(hosts, hostsB);
      }
      const avg = memberIds.length > 1 ? sum / (memberIds.length - 1) : 1;
      if (avg > bestScore) {
        bestScore = avg;
        bestId = id;
      }
    }
    const labelKw = members.find((m) => m.id === bestId) ?? members[0];
    const totalDemand = members.reduce((s, m) => s + (m.demandMonthly || 0), 0);

    // top domains
    const domainCounts = new Map<string, number>();
    const urlCounts = new Map<string, number>();
    memberIds.forEach((id) => {
      urlHosts[id]?.forEach((d) => domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1));
      keywordUrls[id]?.forEach((u) => urlCounts.set(u, (urlCounts.get(u) ?? 0) + 1));
    });

    let pairCount = 0;
    let overlapSum = 0;
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const a = urlHosts[memberIds[i]] ?? new Set<string>();
        const b = urlHosts[memberIds[j]] ?? new Set<string>();
        overlapSum += jaccard(a, b);
        pairCount += 1;
      }
    }

    return {
      id: communityId,
      label: labelKw.kwRaw,
      keywordIds: memberIds,
      members,
      totalDemand,
      keywordCount: memberIds.length,
      topDomains: topFromCounts(domainCounts),
      topUrls: topFromCounts(urlCounts, 10),
      overlapScore: memberIds.length > 1 ? overlapSum / pairCount : 1
    } satisfies ClusteredSubcluster;
  });
}

function connectedComponents(graph: Graph) {
  const visited = new Set<string>();
  const components: string[][] = [];
  graph.forEachNode((node) => {
    if (visited.has(node)) return;
    const stack = [node];
    const comp: string[] = [];
    while (stack.length) {
      const n = stack.pop()!;
      if (visited.has(n)) continue;
      visited.add(n);
      comp.push(n);
      graph.forEachNeighbor(n, (neighbor) => {
        if (!visited.has(neighbor)) stack.push(neighbor);
      });
    }
    components.push(comp);
  });
  return components;
}

function clusterGraphAgglomerative(
  graph: Graph,
  keywords: KeywordLite[],
  urlHosts: Record<string, Set<string>>,
  keywordUrls: Record<string, Set<string>>
) {
  const components = connectedComponents(graph);
  return components.map((memberIds, idx) => {
    const members = memberIds
      .map((id) => keywords.find((k) => k.id === id))
      .filter((k): k is KeywordLite => Boolean(k));

    let bestId = memberIds[0];
    let bestScore = -1;
    for (const id of memberIds) {
      const hosts = urlHosts[id] ?? new Set<string>();
      let sum = 0;
      for (const other of memberIds) {
        if (other === id) continue;
        const hostsB = urlHosts[other] ?? new Set<string>();
        sum += jaccard(hosts, hostsB);
      }
      const avg = memberIds.length > 1 ? sum / (memberIds.length - 1) : 1;
      if (avg > bestScore) {
        bestScore = avg;
        bestId = id;
      }
    }
    const labelKw = members.find((m) => m.id === bestId) ?? members[0];
    const totalDemand = members.reduce((s, m) => s + (m.demandMonthly || 0), 0);

    const domainCounts = new Map<string, number>();
    const urlCounts = new Map<string, number>();
    memberIds.forEach((id) => {
      urlHosts[id]?.forEach((d) => domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1));
      keywordUrls[id]?.forEach((u) => urlCounts.set(u, (urlCounts.get(u) ?? 0) + 1));
    });

    let pairCount = 0;
    let overlapSum = 0;
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const a = urlHosts[memberIds[i]] ?? new Set<string>();
        const b = urlHosts[memberIds[j]] ?? new Set<string>();
        overlapSum += jaccard(a, b);
        pairCount += 1;
      }
    }

    return {
      id: String(idx),
      label: labelKw.kwRaw,
      keywordIds: memberIds,
      members,
      totalDemand,
      keywordCount: memberIds.length,
      topDomains: topFromCounts(domainCounts),
      topUrls: topFromCounts(urlCounts, 10),
      overlapScore: memberIds.length > 1 ? overlapSum / pairCount : 1
    } satisfies ClusteredSubcluster;
  });
}

function fallbackParents(subclusters: ClusteredSubcluster[], reason: string) {
  return subclusters.map((s) => ({
    name: s.topDomains?.[0] ?? s.label,
    subclusterIds: [s.id],
    rationale: reason
  }));
}

async function mapParentsWithLlm(subclusters: ClusteredSubcluster[]) {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackParents(subclusters, "fallback_no_llm");
  }

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const results: ParentJson["parents"] = [];
  const chunkSize = 30;

  for (let i = 0; i < subclusters.length; i += chunkSize) {
    const chunk = subclusters.slice(i, i + chunkSize);
    const payload = chunk.map((c) => ({
      id: c.id,
      name: c.label,
      topDomains: c.topDomains,
      topKeywords: c.members
        .slice()
        .sort((a, b) => (b.demandMonthly ?? 0) - (a.demandMonthly ?? 0))
        .slice(0, 5)
        .map((k) => k.kwRaw),
      keywordCount: c.keywordCount,
      totalDemand: Math.round(c.totalDemand)
    }));

    const system =
      "You group related keyword subclusters into parent clusters. Return STRICT JSON {\"parents\":[{\"name\":\"\",\"subclusterIds\":[],\"rationale\":\"optional\"}]}. " +
      "Use only provided subclusterIds. Prefer concise, general names. Combine clearly overlapping topics; otherwise keep separate. Respond with compact parent names. " +
      "IMPORTANT: All parent cluster names MUST be in German (Deutsch). Use natural, concise German terms.";
    const user = `Subclusters:\n${JSON.stringify(payload, null, 2)}`;

    try {
      const res = await generateText({
        model: openai(DEFAULT_MODEL),
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      });
      const start = res.text.indexOf("{");
      const end = res.text.lastIndexOf("}");
      const parsed = JSON.parse(res.text.slice(start, end + 1)) as ParentJson;
      if (parsed?.parents) results.push(...parsed.parents);
    } catch (e) {
      console.warn("LLM parent mapping fallback", e);
      return fallbackParents(subclusters, "llm_parse_fallback");
    }
  }

  if (!results.length) return fallbackParents(subclusters, "llm_empty");

  // merge duplicates by name
  const merged = new Map<string, { name: string; subclusterIds: Set<string>; rationale?: string }>();
  results.forEach((p) => {
    const key = p.name.trim().toLowerCase();
    const entry = merged.get(key) ?? { name: p.name, subclusterIds: new Set<string>(), rationale: p.rationale };
    p.subclusterIds.forEach((id) => entry.subclusterIds.add(id));
    merged.set(key, entry);
  });
  return Array.from(merged.values()).map((p) => ({
    name: p.name,
    subclusterIds: Array.from(p.subclusterIds),
    rationale: p.rationale
  }));
}

function toIso(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function runSerpClustering(params: {
  runId: string;
  projectId: string;
  userId: string;
  accessToken?: string;
  gscSiteUrl?: string;
  minDemand?: number;
  overlapThreshold?: number;
  topResults?: number;
  clusterAlgorithm?: "louvain" | "agglomerative_single_link";
  snapshotReuseMode?: "reuse_any_fetch_missing";
  forceRefetch?: boolean;
}) {
  const {
    runId,
    projectId,
    userId,
    accessToken,
    gscSiteUrl,
    minDemand = 5,
    overlapThreshold = 0.3,
    topResults = 10,
    clusterAlgorithm = "louvain",
    snapshotReuseMode = "reuse_any_fetch_missing",
    forceRefetch = false
  } = params;

  async function updateStatus(status: string, extra?: Record<string, any>) {
    await prisma.serpClusterRun.update({
      where: { id: runId },
      data: { status, ...extra }
    });
  }

  let zyteRequested = 0;
  let zyteSucceeded = 0;
  let zyteCached = 0;
  let missingSnapshotCount = 0;
  let fetchedMissingCount = 0;
  let eligibleKeywordCount = 0;
  let resolvedKeywordCount = 0;
  let usedKeywordCount = 0;
  let waveCount = 0;
  let promptModel: string | null = process.env.OPENAI_API_KEY ? DEFAULT_MODEL : null;

  try {
    await updateStatus("running", {
      eligibleKeywordCount,
      resolvedKeywordCount,
      usedKeywordCount,
      waveCount
    });
    // ── Phase 1: Auto-import GSC data if needed ──
    const kwCount = await prisma.keyword.count({
      where: { projectId, demand: { demandMonthly: { gte: minDemand } } }
    });

    if (kwCount === 0 && accessToken && gscSiteUrl) {
      await updateStatus("importing_gsc");

      const to = new Date();
      to.setHours(0, 0, 0, 0);
      const from = new Date(to);
      from.setDate(to.getDate() - GSC_DAYS + 1);

      const source = await ensureWorkspaceSource(projectId, "gsc", "GSC Auto", {
        siteUrl: gscSiteUrl,
        days: GSC_DAYS
      });

      const rows = await searchAnalyticsQuery(accessToken, gscSiteUrl, {
        startDate: toIso(from),
        endDate: toIso(to),
        dimensions: ["query"],
        rowLimit: 5000
      });

      await ingestSourceMetrics({
        projectId,
        sourceId: source.id,
        replaceExistingForSource: true,
        rows: rows.map((row) => ({
          kwRaw: row.keys?.[0] ?? "",
          impressions: row.impressions,
          clicks: row.clicks,
          position: row.position,
          dateFrom: from,
          dateTo: to
        }))
      });

      await recomputeDemandForProject(projectId);
    }

    // ── Phase 2: Query keywords ──
    const eligibleKeywords = await prisma.keyword.findMany({
      where: { projectId, demand: { demandMonthly: { gte: minDemand } } },
      include: { demand: true }
    });
    if (!eligibleKeywords.length) throw new Error("NO_KEYWORDS");
    eligibleKeywordCount = eligibleKeywords.length;
    await updateStatus("fetching_serps", {
      eligibleKeywordCount,
      resolvedKeywordCount,
      usedKeywordCount,
      waveCount
    });

    // ── Phase 3: Fetch SERPs (with wave retries until full coverage) ──
    const limit = createLimiter(MAX_CONCURRENCY);
    const urlHosts: Record<string, Set<string>> = {};
    const keywordUrls: Record<string, Set<string>> = {};

    const unresolvedKeywordIds = new Set(eligibleKeywords.map((k) => k.id));

    for (let wave = 1; wave <= MAX_FETCH_WAVES && unresolvedKeywordIds.size > 0; wave++) {
      const unresolvedKeywords = eligibleKeywords.filter((kw) => unresolvedKeywordIds.has(kw.id));
      const tasks = unresolvedKeywords.map((kw) =>
        limit(async () => {
          const snapshots = await prisma.serpSnapshot.findMany({
            where: { projectId, keywordId: kw.id },
            orderBy: { fetchedAt: "desc" },
            take: SNAPSHOT_SCAN_LIMIT,
            select: {
              id: true,
              status: true,
              httpStatus: true,
              topUrlsJson: true
            }
          });

          const reusable =
            forceRefetch
              ? null
              : snapshots.find((snapshot) => isReusableSnapshot(snapshot, topResults)) ?? null;

          if (reusable) {
            zyteCached += 1;
            const urls = parseTopUrlsJson(reusable.topUrlsJson);
            const normalized = takeTopResults(urls, topResults);
            if (normalized.length) {
              urlHosts[kw.id] = new Set(normalized.map((u) => u.host));
              keywordUrls[kw.id] = new Set(normalized.map((u) => u.url));
            }
            return;
          }

          if (!snapshots.length) missingSnapshotCount += 1;
          zyteRequested += 1;
          const res = await fetchZyteSerp(kw.kwRaw);
          const normalized = takeTopResults(res.urls, topResults);
          const hasUsableHosts = normalized.length > 0;

          if (!res.error && hasUsableHosts) zyteSucceeded += 1;
          if (!snapshots.length) fetchedMissingCount += 1;

          urlHosts[kw.id] = new Set(normalized.map((u) => u.host));
          keywordUrls[kw.id] = new Set(normalized.map((u) => u.url));

          await prisma.serpSnapshot.create({
            data: {
              id: nanoid(),
              projectId,
              keywordId: kw.id,
              fetchedAt: new Date(),
              status: res.error ? "error" : "ok",
              httpStatus: res.status,
              durationMs: res.durationMs,
              topUrlsJson: JSON.stringify(
                res.urls
                  .map((u) => ({ ...u, url: normalizeSerpUrl(u.url)?.url ?? u.url }))
                  .slice(0, 20)
              ),
              rawJson: res.raw ? JSON.stringify(res.raw).slice(0, 9000) : null,
              hash: null,
              error: res.error ?? null
            }
          });
        })
      );

      await Promise.all(tasks);
      waveCount = wave;

      for (const keyword of eligibleKeywords) {
        if ((urlHosts[keyword.id]?.size ?? 0) > 0) {
          unresolvedKeywordIds.delete(keyword.id);
        }
      }

      resolvedKeywordCount = eligibleKeywordCount - unresolvedKeywordIds.size;
      await updateStatus("fetching_serps", {
        zyteRequested,
        zyteSucceeded,
        zyteCached,
        missingSnapshotCount,
        fetchedMissingCount,
        eligibleKeywordCount,
        resolvedKeywordCount,
        usedKeywordCount,
        waveCount
      });
    }

    if (resolvedKeywordCount === 0) {
      throw new Error("NO_SERPS");
    }

    if (resolvedKeywordCount < eligibleKeywordCount) {
      const missing = eligibleKeywordCount - resolvedKeywordCount;
      usedKeywordCount = resolvedKeywordCount;
      throw new Error(`INCOMPLETE_SERP_COVERAGE:${missing}/${eligibleKeywordCount}`);
    }

    // ── Phase 4: Build graph + cluster ──
    usedKeywordCount = eligibleKeywordCount;
    await updateStatus("clustering", {
      zyteRequested,
      zyteSucceeded,
      zyteCached,
      missingSnapshotCount,
      fetchedMissingCount,
      eligibleKeywordCount,
      resolvedKeywordCount,
      usedKeywordCount,
      waveCount
    });

    const keywordLite = eligibleKeywords.map((k) => ({ id: k.id, kwRaw: k.kwRaw, demandMonthly: k.demand?.demandMonthly ?? 0 }));

    const graph = buildOverlapGraph(keywordLite, urlHosts, overlapThreshold);

    const clustered =
      clusterAlgorithm === "agglomerative_single_link"
        ? clusterGraphAgglomerative(graph, keywordLite, urlHosts, keywordUrls)
        : clusterGraph(graph, keywordLite, urlHosts, keywordUrls);

    const subclusters: ClusteredSubcluster[] = clustered.map((s) => ({ ...s, id: nanoid() }));

    // ── Phase 5: Map parents with LLM ──
    await updateStatus("mapping_parents", {
      zyteRequested,
      zyteSucceeded,
      zyteCached,
      missingSnapshotCount,
      fetchedMissingCount,
      eligibleKeywordCount,
      resolvedKeywordCount,
      usedKeywordCount,
      waveCount
    });
    const parents = await mapParentsWithLlm(subclusters);
    promptModel = process.env.OPENAI_API_KEY ? DEFAULT_MODEL : null;

    // ── Phase 6: Persist results ──
    await prisma.$transaction(async (tx) => {
      for (const sub of subclusters) {
        await tx.serpSubcluster.create({
          data: {
            id: sub.id,
            runId,
            projectId,
            name: sub.label,
            totalDemand: sub.totalDemand,
            keywordCount: sub.keywordCount,
            overlapScore: sub.overlapScore || null,
            topDomainsJson: JSON.stringify(sub.topDomains),
            topUrlsJson: JSON.stringify(sub.topUrls),
            members: {
              createMany: {
                data: sub.keywordIds.map((kid) => ({ keywordId: kid }))
              }
            }
          }
        });
      }

      for (const parent of parents) {
        const parentId = nanoid();
        const subs = subclusters.filter((s) => parent.subclusterIds.includes(s.id));
        const totalDemand = subs.reduce((s, c) => s + c.totalDemand, 0);
        const keywordCount = subs.reduce((s, c) => s + c.keywordCount, 0);
        const topDomainsCount = new Map<string, number>();
        subs.forEach((s) => {
          (s.topDomains ?? []).forEach((d) => topDomainsCount.set(d, (topDomainsCount.get(d) ?? 0) + 1));
        });
        const topDomains = Array.from(topDomainsCount.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([d]) => d);

        await tx.serpParentCluster.create({
          data: {
            id: parentId,
            runId,
            projectId,
            name: parent.name,
            rationale: parent.rationale ?? null,
            totalDemand,
            keywordCount,
            topDomainsJson: JSON.stringify(topDomains),
            subclusters: {
              createMany: {
                data: subs.map((s) => ({ subclusterId: s.id }))
              }
            }
          }
        });
      }

      await tx.serpClusterRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          finishedAt: new Date(),
          topResults,
          clusterAlgorithm,
          snapshotReuseMode,
          missingSnapshotCount,
          fetchedMissingCount,
          zyteRequested,
          zyteSucceeded,
          zyteCached,
          promptModel,
          eligibleKeywordCount,
          resolvedKeywordCount,
          usedKeywordCount,
          waveCount
        }
      });
    });

    // Retention: keep last 50 completed runs per project
    const oldRuns = await prisma.serpClusterRun.findMany({
      where: { projectId, status: "completed" },
      orderBy: { finishedAt: "desc" },
      skip: 50,
      select: { id: true }
    });
    if (oldRuns.length) {
      await prisma.serpClusterRun.deleteMany({ where: { id: { in: oldRuns.map((r) => r.id) } } });
    }

    return { runId, counts: { zyteRequested, zyteSucceeded, zyteCached }, parents, subclusters };
  } catch (e) {
    await prisma.serpClusterRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: e instanceof Error ? e.message : String(e),
        zyteRequested,
        zyteSucceeded,
        zyteCached,
        topResults,
        clusterAlgorithm,
        snapshotReuseMode,
        missingSnapshotCount,
        fetchedMissingCount,
        promptModel,
        eligibleKeywordCount,
        resolvedKeywordCount,
        usedKeywordCount,
        waveCount
      }
    }).catch(() => {});
    throw e;
  }
}

export async function getLatestSerpClusters(projectId: string, minDemand = 5) {
  const run = await prisma.serpClusterRun.findFirst({
    where: { projectId, status: "completed" },
    orderBy: { finishedAt: "desc" }
  });
  if (!run) return null;
  return getSerpClusters(run.id, minDemand);
}

export async function getSerpClusters(runId: string, minDemand?: number, projectId?: string) {
  const run = await prisma.serpClusterRun.findFirst({
    where: { id: runId, ...(projectId ? { projectId } : {}) }
  });
  if (!run) return null;
  const effectiveMinDemand = minDemand ?? run.minDemand ?? 5;
  const found = run.eligibleKeywordCount ?? 0;
  const resolved = run.resolvedKeywordCount ?? 0;
  const used = run.usedKeywordCount ?? 0;
  const missing = Math.max(found - resolved, 0);
  const complete = found > 0 && used >= found && missing === 0 && run.status === "completed";

  const parents = await prisma.serpParentCluster.findMany({
    where: { projectId: run.projectId, runId: run.id, totalDemand: { gte: effectiveMinDemand } },
    include: {
      subclusters: {
        include: {
          subcluster: {
            include: {
              members: {
                include: {
                  keyword: {
                    include: {
                      demand: true,
                      sourceMetrics: {
                        select: {
                          kd: true,
                          source: { select: { type: true } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    orderBy: [{ totalDemand: "desc" }, { name: "asc" }]
  });

  return {
    runId: run.id,
    generatedAt: run.finishedAt ?? run.startedAt,
    topResults: run.topResults ?? 10,
    overlapThreshold: run.urlOverlapThreshold ?? 0.3,
    clusterAlgorithm: (run.clusterAlgorithm as any) ?? "louvain",
    minDemand: effectiveMinDemand,
    missingSnapshotCount: run.missingSnapshotCount ?? 0,
    fetchedMissingCount: run.fetchedMissingCount ?? 0,
    zyteRequested: run.zyteRequested ?? 0,
    zyteCached: run.zyteCached ?? 0,
    keywordCoverage: {
      found,
      resolved,
      used,
      missing,
      complete
    },
    parents: parents.map((p) => ({
      id: p.id,
      name: p.name,
      totalDemand: p.totalDemand,
      keywordCount: p.keywordCount,
      topDomains: p.topDomainsJson ? (JSON.parse(p.topDomainsJson) as string[]) : [],
      subclusters: p.subclusters.map((psc) => {
        const s = psc.subcluster;
        const members = s.members.map((m) => {
          const uploadDifficulty = m.keyword.sourceMetrics.reduce<number | null>((best, metric) => {
            if (metric.source.type !== "upload" || metric.kd === null) return best;
            return best === null ? metric.kd : Math.max(best, metric.kd);
          }, null);
          return {
            id: m.keywordId,
            kwRaw: m.keyword.kwRaw,
            demandMonthly: m.keyword.demand?.demandMonthly ?? 0,
            demandSource: m.keyword.demand?.demandSource ?? "none",
            difficultyScore: uploadDifficulty
          };
        });
        return {
          id: s.id,
          name: s.name,
          totalDemand: s.totalDemand,
          keywordCount: s.keywordCount,
          topDomains: s.topDomainsJson ? (JSON.parse(s.topDomainsJson) as string[]) : [],
          topUrls: s.topUrlsJson ? (JSON.parse(s.topUrlsJson) as string[]) : [],
          overlapScore: s.overlapScore ?? null,
          keywordIds: members.map((m) => m.id),
          keywords: members
        };
      })
    }))
  };
}

export async function getLatestSerpStatus(projectId: string, runId?: string) {
  const run = runId
    ? await prisma.serpClusterRun.findFirst({ where: { id: runId, projectId } })
    : await prisma.serpClusterRun.findFirst({
        where: { projectId },
        orderBy: { startedAt: "desc" }
      });
  if (!run) return null;
  return run;
}

export async function listSerpClusterRuns(projectId: string, limit = 50) {
  return prisma.serpClusterRun.findMany({
    where: { projectId },
    orderBy: [{ startedAt: "desc" }],
    take: limit
  });
}
