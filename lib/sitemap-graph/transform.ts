import dagre from "dagre";
import type { Edge, Node } from "reactflow";
import type { RecommendedPage, RecommendedSitemap } from "@/lib/nlp/types";

export const PAGE_NODE_WIDTH = 220;
export const PAGE_NODE_HEIGHT = 120;

const MAX_DEPTH = 10;

const TIDY_H_GAP = 32;
const TIDY_V_GAP = 180;
const RADIAL_MIN_RING_STEP = 220;
const RADIAL_NODE_FOOTPRINT = PAGE_NODE_WIDTH * 1.35;

export type SitemapLayout = "TB" | "LR" | "tidy" | "radial";

export type SitemapNodeData = {
  page: RecommendedPage;
  childCount: number;
  isRoot: boolean;
  layout: SitemapLayout;
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
  byRole: Record<string, number>;
  maxDepth: number;
};

export type SitemapGraphResult = {
  nodes: Node<SitemapNodeData>[];
  edges: Edge<SitemapEdgeData>[];
  orphans: SitemapOrphan[];
  stats: SitemapStats;
  layout: SitemapLayout;
  rootSlug: string | null;
};

export type SitemapTransformOptions = {
  layout?: SitemapLayout;
};

function emptyStats(pages: RecommendedPage[]): SitemapStats {
  const byRole: Record<string, number> = {};
  for (const p of pages) {
    byRole[p.page_role] = (byRole[p.page_role] ?? 0) + 1;
  }
  return { total: pages.length, byRole, maxDepth: 0 };
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

type Position = { x: number; y: number };

function layoutDagre(
  validPages: RecommendedPage[],
  edgeSpecs: { source: string; target: string }[],
  rankdir: "TB" | "LR"
): Map<string, Position> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir,
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
  for (const e of edgeSpecs) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  const positions = new Map<string, Position>();
  for (const p of validPages) {
    const pos = g.node(p.slug);
    positions.set(p.slug, {
      x: (pos?.x ?? 0) - PAGE_NODE_WIDTH / 2,
      y: (pos?.y ?? 0) - PAGE_NODE_HEIGHT / 2
    });
  }
  return positions;
}

function buildChildrenMap(
  validPages: RecommendedPage[],
  rootSlug: string
): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const p of validPages) children.set(p.slug, []);
  for (const p of validPages) {
    if (p.slug === rootSlug || p.parent_slug === null) continue;
    const arr = children.get(p.parent_slug);
    if (arr) arr.push(p.slug);
  }
  return children;
}

function layoutTidy(
  rootSlug: string,
  validPages: RecommendedPage[]
): Map<string, Position> {
  const children = buildChildrenMap(validPages, rootSlug);

  // Compute width of each subtree (post-order).
  const subtreeWidth = new Map<string, number>();
  function computeWidth(slug: string): number {
    const c = children.get(slug) ?? [];
    if (c.length === 0) {
      subtreeWidth.set(slug, PAGE_NODE_WIDTH);
      return PAGE_NODE_WIDTH;
    }
    let total = 0;
    for (let i = 0; i < c.length; i++) {
      total += computeWidth(c[i]);
      if (i > 0) total += TIDY_H_GAP;
    }
    const w = Math.max(PAGE_NODE_WIDTH, total);
    subtreeWidth.set(slug, w);
    return w;
  }
  computeWidth(rootSlug);

  // Pre-order placement.
  const positions = new Map<string, Position>();
  function place(slug: string, centerX: number, depth: number) {
    positions.set(slug, {
      x: centerX - PAGE_NODE_WIDTH / 2,
      y: depth * TIDY_V_GAP
    });
    const c = children.get(slug) ?? [];
    if (c.length === 0) return;
    let totalChildren = 0;
    for (let i = 0; i < c.length; i++) {
      totalChildren += subtreeWidth.get(c[i]) ?? PAGE_NODE_WIDTH;
      if (i > 0) totalChildren += TIDY_H_GAP;
    }
    let x = centerX - totalChildren / 2;
    for (const ch of c) {
      const w = subtreeWidth.get(ch) ?? PAGE_NODE_WIDTH;
      place(ch, x + w / 2, depth + 1);
      x += w + TIDY_H_GAP;
    }
  }
  place(rootSlug, 0, 0);
  return positions;
}

function layoutRadial(
  rootSlug: string,
  validPages: RecommendedPage[]
): Map<string, Position> {
  const children = buildChildrenMap(validPages, rootSlug);

  // 1) Count leaves per subtree (= angular weight).
  const leafCount = new Map<string, number>();
  function countLeaves(slug: string): number {
    const c = children.get(slug) ?? [];
    if (c.length === 0) {
      leafCount.set(slug, 1);
      return 1;
    }
    let total = 0;
    for (const ch of c) total += countLeaves(ch);
    leafCount.set(slug, total);
    return total;
  }
  const totalLeaves = countLeaves(rootSlug);

  // 2) Compute max depth so we can size the rings.
  const depthOf = new Map<string, number>();
  function computeDepth(slug: string, depth: number) {
    depthOf.set(slug, depth);
    for (const ch of children.get(slug) ?? []) computeDepth(ch, depth + 1);
  }
  computeDepth(rootSlug, 0);
  let maxDepth = 0;
  for (const d of depthOf.values()) if (d > maxDepth) maxDepth = d;

  // 3) Adaptive ring step: outermost ring's circumference must accomodate
  //    `totalLeaves` nodes each ~RADIAL_NODE_FOOTPRINT wide.
  const minOuterRadius =
    (totalLeaves * RADIAL_NODE_FOOTPRINT) / (2 * Math.PI);
  const ringStep = Math.max(
    RADIAL_MIN_RING_STEP,
    minOuterRadius / Math.max(maxDepth, 1)
  );

  // 4) Subtree-proportional angle assignment. Each child gets an angular
  //    slice proportional to its leaf count, so wide subtrees don't crush
  //    narrow ones.
  const angleOf = new Map<string, number>();
  function place(slug: string, angleStart: number, angleEnd: number) {
    angleOf.set(slug, (angleStart + angleEnd) / 2);
    const c = children.get(slug) ?? [];
    if (c.length === 0) return;
    const myLeaves = leafCount.get(slug) ?? 1;
    const sweep = angleEnd - angleStart;
    let cur = angleStart;
    for (const ch of c) {
      const share = (leafCount.get(ch) ?? 1) / myLeaves;
      const childEnd = cur + sweep * share;
      place(ch, cur, childEnd);
      cur = childEnd;
    }
  }
  // Start at -π/2 (top) and go full 2π clockwise.
  place(rootSlug, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI);

  // 5) Polar → cartesian.
  const positions = new Map<string, Position>();
  for (const p of validPages) {
    const depth = depthOf.get(p.slug) ?? 0;
    const angle = angleOf.get(p.slug) ?? 0;
    const radius = depth === 0 ? 0 : depth * ringStep;
    positions.set(p.slug, {
      x: radius * Math.cos(angle) - PAGE_NODE_WIDTH / 2,
      y: radius * Math.sin(angle) - PAGE_NODE_HEIGHT / 2
    });
  }
  return positions;
}

export function transformSitemapToReactFlow(
  sitemap: RecommendedSitemap,
  options: SitemapTransformOptions = {}
): SitemapGraphResult {
  const layout = options.layout ?? "TB";
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
      layout,
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

  // Step 4: Build edge specs and child counts.
  const childCount = new Map<string, number>();
  const edgeSpecs: { source: string; target: string }[] = [];
  for (const p of validPages) {
    if (p.parent_slug === null || p.slug === rootSlug) continue;
    edgeSpecs.push({ source: p.parent_slug, target: p.slug });
    childCount.set(p.parent_slug, (childCount.get(p.parent_slug) ?? 0) + 1);
  }

  // Step 5: Compute positions per layout.
  let positions: Map<string, Position>;
  if (layout === "TB" || layout === "LR") {
    positions = layoutDagre(validPages, edgeSpecs, layout);
  } else if (layout === "tidy") {
    positions = layoutTidy(rootSlug, validPages);
  } else {
    positions = layoutRadial(rootSlug, validPages);
  }

  // Step 6: React Flow nodes/edges.
  const nodes: Node<SitemapNodeData>[] = validPages.map((p) => {
    const pos = positions.get(p.slug) ?? { x: 0, y: 0 };
    return {
      id: p.slug,
      type: "pageCard",
      position: pos,
      data: {
        page: p,
        childCount: childCount.get(p.slug) ?? 0,
        isRoot: p.slug === rootSlug,
        layout
      },
      draggable: true,
      connectable: false
    };
  });

  const edgeType = layout === "radial" ? "straight" : "smoothstep";
  const edges: Edge<SitemapEdgeData>[] = edgeSpecs.map((spec, i) => ({
    id: `sm${i}-${spec.source}->${spec.target}`,
    source: spec.source,
    target: spec.target,
    type: edgeType,
    animated: false,
    data: { kind: "is_child_of" }
  }));

  // Step 7: Stats with max depth over valid pages.
  const stats = emptyStats(validPages);
  let maxDepth = 0;
  for (const p of validPages) {
    const d = depthFromRoot(p.slug, slugMap, depthCache);
    if (d > maxDepth && d <= MAX_DEPTH) maxDepth = d;
  }
  stats.maxDepth = maxDepth;

  return { nodes, edges, orphans, stats, layout, rootSlug };
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

/**
 * Flatten the sitemap into a depth-annotated list for the indented-tree view.
 * Pre-order DFS so parents come before children.
 */
export function flattenSitemapForIndentedView(
  sitemap: RecommendedSitemap
): { page: RecommendedPage; depth: number }[] {
  const pages = sitemap.pages ?? [];
  if (pages.length === 0) return [];

  const slugMap = new Map<string, RecommendedPage>();
  for (const p of pages) {
    const slug = p.slug?.trim();
    if (slug && !slugMap.has(slug)) slugMap.set(slug, { ...p, slug });
  }

  const rootsRaw = Array.from(slugMap.values()).filter((p) => p.parent_slug === null);
  const rootSlug = rootsRaw[0]?.slug ?? Array.from(slugMap.values())[0]?.slug;
  if (!rootSlug) return [];

  const children = new Map<string, string[]>();
  for (const p of Array.from(slugMap.values())) children.set(p.slug, []);
  for (const p of Array.from(slugMap.values())) {
    if (p.parent_slug === null || p.slug === rootSlug) continue;
    if (slugMap.has(p.parent_slug)) {
      const arr = children.get(p.parent_slug);
      if (arr) arr.push(p.slug);
    }
  }

  const out: { page: RecommendedPage; depth: number }[] = [];
  const seen = new Set<string>();
  function walk(slug: string, depth: number) {
    if (seen.has(slug) || depth > MAX_DEPTH) return;
    seen.add(slug);
    const page = slugMap.get(slug);
    if (!page) return;
    out.push({ page, depth });
    for (const ch of children.get(slug) ?? []) walk(ch, depth + 1);
  }
  walk(rootSlug, 0);

  // Append orphans (parents that don't resolve) flat at depth 0.
  for (const p of Array.from(slugMap.values())) {
    if (!seen.has(p.slug)) out.push({ page: p, depth: 0 });
  }

  return out;
}
