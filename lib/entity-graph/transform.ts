import dagre from "dagre";
import type { Edge, Node } from "reactflow";
import type {
  EntityGraphEntity,
  EntityGraphInput,
  EntityGraphRelation
} from "./types";

const CATEGORY_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
  "#a855f7",
  "#eab308"
] as const;

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 100;

const TIDY_H_GAP = 36;
const TIDY_V_GAP = 160;
const RADIAL_MIN_RING_STEP = 240;
const RADIAL_NODE_FOOTPRINT = NODE_WIDTH * 1.35;

export type EntityLayout = "TB" | "LR" | "tidy" | "radial";

export type EntityNodeData = {
  entity: EntityGraphEntity;
  color: string;
  incomingCount: number;
  outgoingCount: number;
  layout: EntityLayout;
};

export type EntityEdgeData = {
  relation: EntityGraphRelation;
};

export type EntityGraphResult = {
  nodes: Node<EntityNodeData>[];
  edges: Edge<EntityEdgeData>[];
  orphans: EntityGraphRelation[];
  validRelations: EntityGraphRelation[];
  categoryColors: Record<string, string>;
  layout: EntityLayout;
};

export type EntityTransformOptions = {
  layout?: EntityLayout;
};

export function buildCategoryColorMap(entities: EntityGraphEntity[]): Record<string, string> {
  const categories = Array.from(new Set(entities.map((e) => e.category)));
  const map: Record<string, string> = {};
  categories.forEach((cat, idx) => {
    map[cat] = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
  });
  return map;
}

export function humanizePredicate(p: string): string {
  return p.replace(/_/g, " ");
}

function buildNameResolver(entities: EntityGraphEntity[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entities) {
    map.set(e.name.toLowerCase().trim(), e.canonical_name);
    map.set(e.canonical_name.toLowerCase().trim(), e.canonical_name);
  }
  return map;
}

type Position = { x: number; y: number };

function findRootEntity(
  entities: EntityGraphEntity[],
  validRelations: EntityGraphRelation[]
): string | null {
  if (entities.length === 0) return null;
  const degree = new Map<string, number>();
  for (const r of validRelations) {
    degree.set(r.subject, (degree.get(r.subject) ?? 0) + 1);
    degree.set(r.object, (degree.get(r.object) ?? 0) + 1);
  }
  // Prefer pillar entities; among them pick highest degree. Fall back to all.
  const pillars = entities.filter((e) => e.semantic_role === "pillar");
  const pool = pillars.length > 0 ? pillars : entities;
  const sorted = [...pool].sort(
    (a, b) =>
      (degree.get(b.canonical_name) ?? 0) - (degree.get(a.canonical_name) ?? 0)
  );
  return sorted[0]?.canonical_name ?? null;
}

function buildSpanningTree(
  rootName: string,
  entities: EntityGraphEntity[],
  validRelations: EntityGraphRelation[]
): { children: Map<string, string[]>; reachable: Set<string> } {
  const children = new Map<string, string[]>();
  for (const e of entities) children.set(e.canonical_name, []);

  // Undirected adjacency so we can build a spanning tree regardless of
  // edge direction.
  const adj = new Map<string, Set<string>>();
  for (const e of entities) adj.set(e.canonical_name, new Set());
  for (const r of validRelations) {
    adj.get(r.subject)?.add(r.object);
    adj.get(r.object)?.add(r.subject);
  }

  const visited = new Set<string>([rootName]);
  const queue: string[] = [rootName];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const neighbors = adj.get(cur);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        children.get(cur)?.push(n);
        queue.push(n);
      }
    }
  }
  return { children, reachable: visited };
}

function layoutTidyOnTree(
  rootName: string,
  children: Map<string, string[]>
): Map<string, Position> {
  const subtreeWidth = new Map<string, number>();
  function computeWidth(name: string): number {
    const c = children.get(name) ?? [];
    if (c.length === 0) {
      subtreeWidth.set(name, NODE_WIDTH);
      return NODE_WIDTH;
    }
    let total = 0;
    for (let i = 0; i < c.length; i++) {
      total += computeWidth(c[i]);
      if (i > 0) total += TIDY_H_GAP;
    }
    const w = Math.max(NODE_WIDTH, total);
    subtreeWidth.set(name, w);
    return w;
  }
  computeWidth(rootName);

  const positions = new Map<string, Position>();
  function place(name: string, centerX: number, depth: number) {
    positions.set(name, {
      x: centerX - NODE_WIDTH / 2,
      y: depth * TIDY_V_GAP
    });
    const c = children.get(name) ?? [];
    if (c.length === 0) return;
    let totalChildren = 0;
    for (let i = 0; i < c.length; i++) {
      totalChildren += subtreeWidth.get(c[i]) ?? NODE_WIDTH;
      if (i > 0) totalChildren += TIDY_H_GAP;
    }
    let x = centerX - totalChildren / 2;
    for (const ch of c) {
      const w = subtreeWidth.get(ch) ?? NODE_WIDTH;
      place(ch, x + w / 2, depth + 1);
      x += w + TIDY_H_GAP;
    }
  }
  place(rootName, 0, 0);
  return positions;
}

function layoutRadialOnTree(
  rootName: string,
  children: Map<string, string[]>,
  entityCount: number
): Map<string, Position> {
  const leafCount = new Map<string, number>();
  function countLeaves(name: string): number {
    const c = children.get(name) ?? [];
    if (c.length === 0) {
      leafCount.set(name, 1);
      return 1;
    }
    let total = 0;
    for (const ch of c) total += countLeaves(ch);
    leafCount.set(name, total);
    return total;
  }
  const totalLeaves = countLeaves(rootName);

  const depthOf = new Map<string, number>();
  function computeDepth(name: string, depth: number) {
    depthOf.set(name, depth);
    for (const ch of children.get(name) ?? []) computeDepth(ch, depth + 1);
  }
  computeDepth(rootName, 0);
  let maxDepth = 0;
  for (const d of depthOf.values()) if (d > maxDepth) maxDepth = d;

  const minOuterRadius =
    (Math.max(totalLeaves, entityCount) * RADIAL_NODE_FOOTPRINT) / (2 * Math.PI);
  const ringStep = Math.max(
    RADIAL_MIN_RING_STEP,
    minOuterRadius / Math.max(maxDepth, 1)
  );

  const angleOf = new Map<string, number>();
  function place(name: string, angleStart: number, angleEnd: number) {
    angleOf.set(name, (angleStart + angleEnd) / 2);
    const c = children.get(name) ?? [];
    if (c.length === 0) return;
    const myLeaves = leafCount.get(name) ?? 1;
    const sweep = angleEnd - angleStart;
    let cur = angleStart;
    for (const ch of c) {
      const share = (leafCount.get(ch) ?? 1) / myLeaves;
      const childEnd = cur + sweep * share;
      place(ch, cur, childEnd);
      cur = childEnd;
    }
  }
  place(rootName, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI);

  const positions = new Map<string, Position>();
  for (const [name, depth] of depthOf) {
    const angle = angleOf.get(name) ?? 0;
    const radius = depth === 0 ? 0 : depth * ringStep;
    positions.set(name, {
      x: radius * Math.cos(angle) - NODE_WIDTH / 2,
      y: radius * Math.sin(angle) - NODE_HEIGHT / 2
    });
  }
  return positions;
}

function appendUnreachable(
  entities: EntityGraphEntity[],
  positions: Map<string, Position>,
  reachable: Set<string>
): void {
  const unreachable = entities.filter((e) => !reachable.has(e.canonical_name));
  if (unreachable.length === 0) return;

  let maxX = 0;
  let minY = Infinity;
  for (const pos of positions.values()) {
    if (pos.x + NODE_WIDTH > maxX) maxX = pos.x + NODE_WIDTH;
    if (pos.y < minY) minY = pos.y;
  }
  if (!Number.isFinite(minY)) minY = 0;
  const startX = maxX + 80;
  unreachable.forEach((e, i) => {
    positions.set(e.canonical_name, {
      x: startX,
      y: minY + i * (NODE_HEIGHT + 24)
    });
  });
}

function layoutDagre(
  entities: EntityGraphEntity[],
  validRelations: EntityGraphRelation[],
  rankdir: "TB" | "LR"
): Map<string, Position> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir,
    nodesep: rankdir === "LR" ? 60 : 50,
    ranksep: rankdir === "LR" ? 120 : 110,
    marginx: 24,
    marginy: 24
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const e of entities) {
    g.setNode(e.canonical_name, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const r of validRelations) {
    g.setEdge(r.subject, r.object);
  }
  dagre.layout(g);

  const positions = new Map<string, Position>();
  for (const e of entities) {
    const pos = g.node(e.canonical_name);
    positions.set(e.canonical_name, {
      x: (pos?.x ?? 0) - NODE_WIDTH / 2,
      y: (pos?.y ?? 0) - NODE_HEIGHT / 2
    });
  }
  return positions;
}

export function transformToReactFlow(
  data: EntityGraphInput,
  options: EntityTransformOptions = {}
): EntityGraphResult {
  const layout = options.layout ?? "tidy";
  const resolver = buildNameResolver(data.entities);
  const categoryColors = buildCategoryColorMap(data.entities);

  // Validate relations against entity set first.
  const orphans: EntityGraphRelation[] = [];
  const validRelations: EntityGraphRelation[] = [];
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();

  for (const r of data.relations) {
    const src = resolver.get(r.subject.toLowerCase().trim());
    const tgt = resolver.get(r.object.toLowerCase().trim());
    if (!src || !tgt || src === tgt) {
      orphans.push(r);
      continue;
    }
    validRelations.push({ ...r, subject: src, object: tgt });
    outgoingCount.set(src, (outgoingCount.get(src) ?? 0) + 1);
    incomingCount.set(tgt, (incomingCount.get(tgt) ?? 0) + 1);
  }

  // Compute positions per layout.
  let positions: Map<string, Position>;
  if (layout === "TB" || layout === "LR") {
    positions = layoutDagre(data.entities, validRelations, layout);
  } else {
    const root = findRootEntity(data.entities, validRelations);
    if (!root) {
      positions = layoutDagre(data.entities, validRelations, "TB");
    } else {
      const { children, reachable } = buildSpanningTree(
        root,
        data.entities,
        validRelations
      );
      positions =
        layout === "tidy"
          ? layoutTidyOnTree(root, children)
          : layoutRadialOnTree(root, children, data.entities.length);
      appendUnreachable(data.entities, positions, reachable);
    }
  }

  const nodes: Node<EntityNodeData>[] = data.entities.map((e) => {
    const pos = positions.get(e.canonical_name) ?? { x: 0, y: 0 };
    return {
      id: e.canonical_name,
      type: "entityCard",
      position: pos,
      data: {
        entity: e,
        color: categoryColors[e.category] ?? CATEGORY_PALETTE[0],
        incomingCount: incomingCount.get(e.canonical_name) ?? 0,
        outgoingCount: outgoingCount.get(e.canonical_name) ?? 0,
        layout
      },
      draggable: true,
      connectable: false
    };
  });

  const edgeType = layout === "radial" ? "straight" : "smoothstep";
  const edges: Edge<EntityEdgeData>[] = validRelations.map((r, i) => ({
    id: `e${i}-${r.subject}->${r.object}`,
    source: r.subject,
    target: r.object,
    label: humanizePredicate(r.predicate),
    type: edgeType,
    animated: false,
    data: { relation: r }
  }));

  return { nodes, edges, orphans, validRelations, categoryColors, layout };
}

export function relationsForEntity(
  canonicalName: string,
  relations: EntityGraphRelation[]
): { outgoing: EntityGraphRelation[]; incoming: EntityGraphRelation[] } {
  const outgoing = relations.filter((r) => r.subject === canonicalName);
  const incoming = relations.filter((r) => r.object === canonicalName);
  return { outgoing, incoming };
}
