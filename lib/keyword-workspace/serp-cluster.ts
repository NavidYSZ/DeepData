import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { nanoid } from "nanoid";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { prisma } from "@/lib/db";

type KeywordLite = {
  id: string;
  kwRaw: string;
  demandMonthly: number;
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

type ParentJson = {
  parents: { name: string; subclusterIds: string[]; rationale?: string }[];
};

const ZYTE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CONCURRENCY = 5;

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

function jaccard(a: Set<string>, b: Set<string>) {
  const inter = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  return inter.size / union.size;
}

async function fetchZyteSerp(keyword: string): Promise<SerpFetchResult> {
  if (!process.env.ZYTE_API_KEY) {
    return { urls: [], status: 0, durationMs: 0, error: "ZYTE_API_KEY missing" };
  }
  const started = Date.now();
  const body = {
    url: `https://www.google.com/search?q=${encodeURIComponent(keyword)}&num=10&hl=de`,
    browserHtml: true,
    pageType: "searchEngineResultsPage"
  };
  const res = await fetch("https://api.zyte.com/v1/extract", {
    method: "POST",
    headers: {
      Authorization: `Apikey ${process.env.ZYTE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const durationMs = Date.now() - started;
  const status = res.status;
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  const urls: SerpTopUrl[] =
    json?.search?.results
      ?.filter((r: any) => r?.url)
      ?.slice(0, 10)
      ?.map((r: any, idx: number) => ({ url: r.url, position: r.position ?? idx + 1 })) ?? [];

  return { urls, status, durationMs, raw: json, error: status >= 400 ? json?.message ?? "fetch_failed" : undefined };
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

function clusterGraph(graph: Graph, keywords: KeywordLite[], urlHosts: Record<string, Set<string>>) {
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
    memberIds.forEach((id) => {
      (urlHosts[id] ?? []).forEach((d) => domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1));
    });
    const topDomains = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([host]) => host);

    return {
      id: communityId,
      label: labelKw.kwRaw,
      keywordIds: memberIds,
      totalDemand,
      keywordCount: memberIds.length,
      topDomains
    };
  });
}

async function mapParentsWithLlm(subclusters: ReturnType<typeof clusterGraph>) {
  if (!process.env.OPENAI_API_KEY) {
    // fallback: each subcluster becomes its own parent
    return subclusters.map((s) => ({
      name: s.label,
      subclusterIds: [s.id],
      rationale: "fallback_no_llm"
    }));
  }

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = "gpt-4o";
  const results: ParentJson["parents"] = [];
  const chunkSize = 30;

  for (let i = 0; i < subclusters.length; i += chunkSize) {
    const chunk = subclusters.slice(i, i + chunkSize);
    const payload = chunk.map((c) => ({
      id: c.id,
      name: c.label,
      topDomains: c.topDomains,
      keywordCount: c.keywordCount,
      totalDemand: Math.round(c.totalDemand)
    }));

    const system =
      "You group related keyword subclusters into parent clusters. Return STRICT JSON {\"parents\":[{\"name\":\"\",\"subclusterIds\":[],\"rationale\":\"optional\"}]}. " +
      "Use only provided subclusterIds. Prefer concise, general names. Combine clearly overlapping topics; otherwise keep separate.";
    const user = `Subclusters:\n${JSON.stringify(payload, null, 2)}`;

    const res = await generateText({
      model: openai(model),
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });
    let parsed: ParentJson;
    try {
      const start = res.text.indexOf("{");
      const end = res.text.lastIndexOf("}");
      parsed = JSON.parse(res.text.slice(start, end + 1)) as ParentJson;
    } catch (e) {
      throw new Error(`LLM parse failed: ${String(e)} text=${res.text}`);
    }
    if (parsed?.parents) results.push(...parsed.parents);
  }
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

export async function runSerpClustering(params: {
  projectId: string;
  userId: string;
  minDemand?: number;
  overlapThreshold?: number;
  forceRefetch?: boolean;
}) {
  const { projectId, userId, minDemand = 5, overlapThreshold = 0.3, forceRefetch = false } = params;
  const project = await prisma.keywordProject.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  const keywords = await prisma.keyword.findMany({
    where: { projectId, demand: { demandMonthly: { gte: minDemand } } },
    include: { demand: true }
  });
  if (!keywords.length) throw new Error("NO_KEYWORDS");

  const runId = nanoid();
  await prisma.serpClusterRun.create({
    data: {
      id: runId,
      projectId,
      status: "running",
      urlOverlapThreshold: overlapThreshold,
      minDemand
    }
  });

  let zyteRequested = 0;
  let zyteSucceeded = 0;
  let zyteCached = 0;

  try {
    const limit = createLimiter(MAX_CONCURRENCY);
    const urlHosts: Record<string, Set<string>> = {};

    const tasks = keywords.map((kw) =>
      limit(async () => {
        const existing = await prisma.serpSnapshot.findFirst({
          where: { projectId, keywordId: kw.id },
          orderBy: { fetchedAt: "desc" }
        });
        const fresh = existing && Date.now() - existing.fetchedAt.getTime() < ZYTE_TTL_MS;
        if (fresh && !forceRefetch) {
          zyteCached += 1;
          const urls: string[] = existing.topUrlsJson ? (JSON.parse(existing.topUrlsJson) as SerpTopUrl[]).map((u) => u.url) : [];
          urlHosts[kw.id] = new Set(urls.map((u) => normalizeSerpUrl(u)?.host).filter(Boolean) as string[]);
          return;
        }
        zyteRequested += 1;
        const res = await fetchZyteSerp(kw.kwRaw);
        if (!res.error && res.urls.length) zyteSucceeded += 1;
        const normUrls = res.urls
          .map((u) => normalizeSerpUrl(u.url))
          .filter(Boolean)
          .map((u) => u!.url);
        urlHosts[kw.id] = new Set(normUrls.map((u) => normalizeSerpUrl(u)?.host).filter(Boolean) as string[]);
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
              res.urls.map((u) => ({ ...u, url: normalizeSerpUrl(u.url)?.url ?? u.url })).slice(0, 20)
            ),
            rawJson: res.raw ? JSON.stringify(res.raw).slice(0, 9000) : null,
            hash: null,
            error: res.error ?? null
          }
        });
      })
    );
    await Promise.all(tasks);

    const usableKeywords = keywords.filter((k) => (urlHosts[k.id]?.size ?? 0) > 0);
    if (!usableKeywords.length) {
      await prisma.serpClusterRun.update({
        where: { id: runId },
        data: { status: "failed", finishedAt: new Date(), error: "NO_SERPS" }
      });
      throw new Error("NO_SERPS");
    }

    const graph = buildOverlapGraph(
      usableKeywords.map((k) => ({ id: k.id, kwRaw: k.kwRaw, demandMonthly: k.demand?.demandMonthly ?? 0 })),
      urlHosts,
      overlapThreshold
    );

    const clustered = clusterGraph(
      graph,
      usableKeywords.map((k) => ({ id: k.id, kwRaw: k.kwRaw, demandMonthly: k.demand?.demandMonthly ?? 0 })),
      urlHosts
    );

    const subclusters = clustered.map((s) => ({ ...s, id: nanoid() }));
    const parents = await mapParentsWithLlm(subclusters);

    // persist
    await prisma.$transaction(async (tx) => {
      await tx.serpSubclusterMember.deleteMany({ where: { subcluster: { projectId } } });
      await tx.serpParentToSubcluster.deleteMany({ where: { parent: { projectId } } });
      await tx.serpParentCluster.deleteMany({ where: { projectId } });
      await tx.serpSubcluster.deleteMany({ where: { projectId } });

      for (const sub of subclusters) {
        await tx.serpSubcluster.create({
          data: {
            id: sub.id,
            runId,
            projectId,
            name: sub.label,
            totalDemand: sub.totalDemand,
            keywordCount: sub.keywordCount,
            topDomainsJson: JSON.stringify(sub.topDomains),
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
          zyteRequested,
          zyteSucceeded,
          zyteCached
        }
      });
    });

    return { runId, counts: { zyteRequested, zyteSucceeded, zyteCached }, parents, subclusters };
  } catch (e) {
    await prisma.serpClusterRun.update({
      where: { id: runId },
      data: { status: "failed", finishedAt: new Date(), error: e instanceof Error ? e.message : String(e), zyteRequested, zyteSucceeded, zyteCached }
    });
    throw e;
  }
}

export async function getLatestSerpClusters(projectId: string, minDemand = 5) {
  const run = await prisma.serpClusterRun.findFirst({
    where: { projectId, status: "completed" },
    orderBy: { finishedAt: "desc" }
  });
  if (!run) return null;

  const parents = await prisma.serpParentCluster.findMany({
    where: { projectId, runId: run.id, totalDemand: { gte: minDemand } },
    include: {
      subclusters: {
        include: {
          subcluster: {
            include: {
              members: {
                include: { keyword: { include: { demand: true } } }
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
    parents: parents.map((p) => ({
      id: p.id,
      name: p.name,
      totalDemand: p.totalDemand,
      keywordCount: p.keywordCount,
      topDomains: p.topDomainsJson ? (JSON.parse(p.topDomainsJson) as string[]) : [],
      subclusters: p.subclusters.map((psc) => {
        const s = psc.subcluster;
        const members = s.members.map((m) => ({
          id: m.keywordId,
          kwRaw: m.keyword.kwRaw,
          demandMonthly: m.keyword.demand?.demandMonthly ?? 0
        }));
        return {
          id: s.id,
          name: s.name,
          totalDemand: s.totalDemand,
          keywordCount: s.keywordCount,
          topUrls: s.topUrlsJson ? (JSON.parse(s.topUrlsJson) as string[]) : [],
          keywordIds: members.map((m) => m.id),
          keywords: members
        };
      })
    }))
  };
}

export async function getLatestSerpStatus(projectId: string) {
  const run = await prisma.serpClusterRun.findFirst({
    where: { projectId },
    orderBy: { startedAt: "desc" }
  });
  if (!run) return null;
  return run;
}
