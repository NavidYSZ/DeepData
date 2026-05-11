import dagre from "dagre";
import type { Edge, Node } from "reactflow";
import type {
  ExtractionEntity,
  ExtractionOutput,
  ExtractionRelation
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

export type EntityNodeData = {
  entity: ExtractionEntity;
  color: string;
  incomingCount: number;
  outgoingCount: number;
};

export type EntityEdgeData = {
  relation: ExtractionRelation;
};

export type EntityMapResult = {
  nodes: Node<EntityNodeData>[];
  edges: Edge<EntityEdgeData>[];
  orphans: ExtractionRelation[];
  validRelations: ExtractionRelation[];
  categoryColors: Record<string, string>;
};

export function buildCategoryColorMap(entities: ExtractionEntity[]): Record<string, string> {
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

function buildNameResolver(entities: ExtractionEntity[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entities) {
    map.set(e.name.toLowerCase().trim(), e.canonical_name);
    map.set(e.canonical_name.toLowerCase().trim(), e.canonical_name);
  }
  return map;
}

export function transformToReactFlow(data: ExtractionOutput): EntityMapResult {
  const resolver = buildNameResolver(data.entities);
  const categoryColors = buildCategoryColorMap(data.entities);

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const e of data.entities) {
    g.setNode(e.canonical_name, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  const orphans: ExtractionRelation[] = [];
  const validRelations: ExtractionRelation[] = [];
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();

  for (const r of data.relations) {
    const src = resolver.get(r.subject.toLowerCase().trim());
    const tgt = resolver.get(r.object.toLowerCase().trim());
    if (!src || !tgt || src === tgt) {
      orphans.push(r);
      continue;
    }
    g.setEdge(src, tgt);
    validRelations.push({ ...r, subject: src, object: tgt });
    outgoingCount.set(src, (outgoingCount.get(src) ?? 0) + 1);
    incomingCount.set(tgt, (incomingCount.get(tgt) ?? 0) + 1);
  }

  dagre.layout(g);

  const nodes: Node<EntityNodeData>[] = data.entities.map((e) => {
    const pos = g.node(e.canonical_name);
    return {
      id: e.canonical_name,
      type: "entityCard",
      position: {
        x: (pos?.x ?? 0) - NODE_WIDTH / 2,
        y: (pos?.y ?? 0) - NODE_HEIGHT / 2
      },
      data: {
        entity: e,
        color: categoryColors[e.category] ?? CATEGORY_PALETTE[0],
        incomingCount: incomingCount.get(e.canonical_name) ?? 0,
        outgoingCount: outgoingCount.get(e.canonical_name) ?? 0
      },
      draggable: true,
      connectable: false
    };
  });

  const edges: Edge<EntityEdgeData>[] = validRelations.map((r, i) => ({
    id: `e${i}-${r.subject}->${r.object}`,
    source: r.subject,
    target: r.object,
    label: humanizePredicate(r.predicate),
    type: "smoothstep",
    animated: false,
    data: { relation: r }
  }));

  return { nodes, edges, orphans, validRelations, categoryColors };
}

export function relationsForEntity(
  canonicalName: string,
  relations: ExtractionRelation[]
): { outgoing: ExtractionRelation[]; incoming: ExtractionRelation[] } {
  const outgoing = relations.filter((r) => r.subject === canonicalName);
  const incoming = relations.filter((r) => r.object === canonicalName);
  return { outgoing, incoming };
}
