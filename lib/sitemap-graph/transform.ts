import dagre from "dagre";
import type { Edge, Node } from "reactflow";
import type {
  RecommendedPage,
  RecommendedSitemap,
  SitemapPageStatus
} from "@/lib/nlp/types";

export const PAGE_NODE_WIDTH = 220;
export const PAGE_NODE_HEIGHT = 120;

const MAX_DEPTH = 10;

export const STATUS_COLORS: Record<SitemapPageStatus, string> = {
  covered_on_page: "#10b981",
  content_gap: "#f59e0b",
  likely_exists_elsewhere: "#a1a1aa"
};

export type SitemapNodeData = {
  page: RecommendedPage;
  childCount: number;
  isRoot: boolean;
};

export type SitemapEdgeData = {
  kind: "is_child_of";
};

export type SitemapOrphan = {
  page: RecommendedPage;
  reason: "duplicate_slug" | "parent_not_found" | "self_reference" | "cycle";
};

export type SitemapStats = {
  total: number;
  covered: number;
  gap: number;
  likely: number;
  byRole: Record<string, number>;
  byStatus: Record<string, number>;
  maxDepth: number;
};

export type SitemapGraphResult = {
  nodes: Node<SitemapNodeData>[];
  edges: Edge<SitemapEdgeData>[];
  orphans: SitemapOrphan[];
  stats: SitemapStats;
  direction: "TB" | "LR";
  rootSlug: string | null;
};

export type SitemapTransformOptions = {
  direction?: "TB" | "LR";
};

function emptyStats(pages: RecommendedPage[]): SitemapStats {
  const byRole: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let covered = 0;
  let gap = 0;
  let likely = 0;
  for (const p of pages) {
    byRole[p.page_role] = (byRole[p.page_role] ?? 0) + 1;
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    if (p.status === "covered_on_page") covered++;
    else if (p.status === "content_gap") gap++;
    else if (p.status === "likely_exists_elsewhere") likely++;
  }
  return { total: pages.length, covered, gap, likely, byRole, byStatus, maxDepth: 0 };
}

function depthFromRoot(
  slug: string,
  slugMap: Map<string, RecommendedPage>,
  cache: Map<string, number>
): number {
  if (cache.has(slug)) return cache.get(slug)!;
  const visited = new Set<string>();
  let cur: string | null = slug;
  let depth = 0;
  while (cur) {
    if (visited.has(cur) || depth > MAX_DEPTH) return MAX_DEPTH + 1;
    visited.add(cur);
    const page = slugMap.get(cur);
    if (!page || page.parent_slug === null) {
      cache.set(slug, depth);
      return depth;
    }
    cur = page.parent_slug;
    depth++;
  }
  cache.set(slug, depth);
  return depth;
}

export function transformSitemapToReactFlow(
  sitemap: RecommendedSitemap,
  options: SitemapTransformOptions = {}
): SitemapGraphResult {
  const direction = options.direction ?? "TB";
  const orphans: SitemapOrphan[] = [];

  // Step 1: Dedup slugs.
  const slugMap = new Map<string, RecommendedPage>();
  const dedupedPages: RecommendedPage[] = [];
  for (const raw of sitemap.pages ?? []) {
    const slug = raw.slug?.trim() ?? "";
    if (!slug) {
      orphans.push({ page: raw, reason: "parent_not_found" });
      continue;
    }
    const cleaned: RecommendedPage = { ...raw, slug };
    if (slugMap.has(slug)) {
      orphans.push({ page: cleaned, reason: "duplicate_slug" });
      continue;
    }
    slugMap.set(slug, cleaned);
    dedupedPages.push(cleaned);
  }

  if (dedupedPages.length === 0) {
    return {
      nodes: [],
      edges: [],
      orphans,
      stats: emptyStats([]),
      direction,
      rootSlug: null
    };
  }

  // Step 2: Resolve root(s). If multiple roots, keep the first and reparent
  // the others onto it (defensive — the LLM occasionally returns two roots).
  const rootsRaw = dedupedPages.filter((p) => p.parent_slug === null);
  let rootSlug: string | null = null;
  if (rootsRaw.length >= 1) {
    rootSlug = rootsRaw[0].slug;
    for (let i = 1; i < rootsRaw.length; i++) {
      const other = rootsRaw[i];
      slugMap.set(other.slug, { ...other, parent_slug: rootSlug });
    }
  } else {
    // No root — pick the first page as implicit root.
    rootSlug = dedupedPages[0].slug;
    slugMap.set(rootSlug, { ...slugMap.get(rootSlug)!, parent_slug: null });
  }

  // Step 3: Validate parent references and detect self-references / cycles.
  const validPages: RecommendedPage[] = [];
  const depthCache = new Map<string, number>();

  for (const p of Array.from(slugMap.values())) {
    if (p.slug === rootSlug) {
      validPages.push(p);
      continue;
    }
    if (p.parent_slug === null) {
      // Shouldn't happen after step 2 but guard anyway.
      validPages.push(p);
      continue;
    }
    if (p.parent_slug === p.slug) {
      orphans.push({ page: p, reason: "self_reference" });
      continue;
    }
    if (!slugMap.has(p.parent_slug)) {
      orphans.push({ page: p, reason: "parent_not_found" });
      continue;
    }
    const d = depthFromRoot(p.slug, slugMap, depthCache);
    if (d > MAX_DEPTH) {
      orphans.push({ page: p, reason: "cycle" });
      continue;
    }
    validPages.push(p);
  }

  // Step 4: Layout with dagre.
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 90,
    marginx: 24,
    marginy: 24,
    align: "UL"
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const p of validPages) {
    g.setNode(p.slug, { width: PAGE_NODE_WIDTH, height: PAGE_NODE_HEIGHT });
  }

  const childCount = new Map<string, number>();
  const edgeSpecs: { source: string; target: string }[] = [];

  for (const p of validPages) {
    if (p.parent_slug === null || p.slug === rootSlug) continue;
    g.setEdge(p.parent_slug, p.slug);
    edgeSpecs.push({ source: p.parent_slug, target: p.slug });
    childCount.set(p.parent_slug, (childCount.get(p.parent_slug) ?? 0) + 1);
  }

  dagre.layout(g);

  // Step 5: Build React Flow nodes/edges.
  const nodes: Node<SitemapNodeData>[] = validPages.map((p) => {
    const pos = g.node(p.slug);
    return {
      id: p.slug,
      type: "pageCard",
      position: {
        x: (pos?.x ?? 0) - PAGE_NODE_WIDTH / 2,
        y: (pos?.y ?? 0) - PAGE_NODE_HEIGHT / 2
      },
      data: {
        page: p,
        childCount: childCount.get(p.slug) ?? 0,
        isRoot: p.slug === rootSlug
      },
      draggable: true,
      connectable: false
    };
  });

  const edges: Edge<SitemapEdgeData>[] = edgeSpecs.map((spec, i) => ({
    id: `sm${i}-${spec.source}->${spec.target}`,
    source: spec.source,
    target: spec.target,
    type: "smoothstep",
    animated: false,
    data: { kind: "is_child_of" }
  }));

  // Step 6: Stats — max depth over valid pages.
  const stats = emptyStats(validPages);
  let maxDepth = 0;
  for (const p of validPages) {
    const d = depthFromRoot(p.slug, slugMap, depthCache);
    if (d > maxDepth && d <= MAX_DEPTH) maxDepth = d;
  }
  stats.maxDepth = maxDepth;

  return { nodes, edges, orphans, stats, direction, rootSlug };
}

export function findChildPages(slug: string, pages: RecommendedPage[]): RecommendedPage[] {
  return pages.filter((p) => p.parent_slug === slug);
}

export function findParentPage(
  slug: string,
  pages: RecommendedPage[]
): RecommendedPage | null {
  const page = pages.find((p) => p.slug === slug);
  if (!page || page.parent_slug === null) return null;
  return pages.find((p) => p.slug === page.parent_slug) ?? null;
}

export function findPageBySlug(
  slug: string,
  pages: RecommendedPage[]
): RecommendedPage | null {
  return pages.find((p) => p.slug === slug) ?? null;
}
