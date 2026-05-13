import type {
  EntityGraphEntity,
  EntityGraphInput,
  EntityGraphRelation
} from "@/lib/entity-graph/types";
import type { ExtractionOutput } from "@/lib/nlp/types";

export const KEYWORD_PILLAR_CATEGORY = "Keyword-Pillar";

export type AuthorityKeywordResult = {
  keyword: string;
  clusterId: string;
  clusterName: string;
  extraction: ExtractionOutput;
};

/**
 * Builds one combined entity graph from N keyword analyses. Each keyword
 * becomes its own pillar node ("Keyword: <kw>"), and every entity from that
 * analysis is wired to the pillar via a `covered_by_keyword` relation. When
 * the same canonical entity surfaces in multiple analyses we merge them once
 * and keep all keyword pillars wired to it — that's the whole point of this
 * view: shared entities = topical authority overlap.
 */
export function mergeKeywordExtractionsToGraph(
  results: AuthorityKeywordResult[]
): EntityGraphInput {
  const entityByCanonical = new Map<string, EntityGraphEntity>();
  const relations: EntityGraphRelation[] = [];
  const relationKey = new Set<string>();

  const pushRelation = (rel: EntityGraphRelation) => {
    const key = `${rel.subject}|||${rel.predicate}|||${rel.object}`;
    if (relationKey.has(key)) return;
    relationKey.add(key);
    relations.push(rel);
  };

  for (const { keyword, clusterName, extraction } of results) {
    const pillarCanonical = `Keyword: ${keyword}`;
    const existingPillar = entityByCanonical.get(pillarCanonical);
    const totalMentions =
      (extraction.entities ?? []).reduce(
        (sum, e) => sum + (Number.isFinite(e.mentions) ? e.mentions : 1),
        0
      ) || 1;

    if (existingPillar) {
      existingPillar.mentions = Math.max(existingPillar.mentions, totalMentions);
    } else {
      entityByCanonical.set(pillarCanonical, {
        name: keyword,
        canonical_name: pillarCanonical,
        category: KEYWORD_PILLAR_CATEGORY,
        mentions: totalMentions,
        definition_in_text: `Top-Keyword aus Cluster "${clusterName}"`,
        semantic_role: "pillar"
      });
    }

    for (const entity of extraction.entities ?? []) {
      const canonical = entity.canonical_name?.trim();
      if (!canonical) continue;
      // Don't let an LLM-extracted entity collide with a keyword pillar
      // canonical_name (extremely rare since pillars are prefixed).
      if (canonical === pillarCanonical) continue;

      const existing = entityByCanonical.get(canonical);
      if (existing) {
        existing.mentions += entity.mentions ?? 1;
        if (entity.semantic_role === "pillar" && existing.semantic_role !== "pillar") {
          existing.semantic_role = "supporting";
        }
        if (!existing.definition_in_text && entity.definition_in_text) {
          existing.definition_in_text = entity.definition_in_text;
        }
      } else {
        entityByCanonical.set(canonical, {
          name: entity.name,
          canonical_name: canonical,
          category: entity.category,
          mentions: entity.mentions ?? 1,
          definition_in_text: entity.definition_in_text ?? null,
          // Force every LLM-pillar to "supporting" so only the keyword
          // pillars sit at the center of the radial/tidy layout.
          semantic_role:
            entity.semantic_role === "pillar" ? "supporting" : entity.semantic_role
        });
      }

      pushRelation({
        subject: pillarCanonical,
        predicate: "covers_entity",
        object: canonical,
        evidence: `Aus Top-Keyword "${keyword}"`
      });
    }

    for (const rel of extraction.relations ?? []) {
      const subject = rel.subject?.trim();
      const object = rel.object?.trim();
      const predicate = rel.predicate?.trim();
      if (!subject || !object || !predicate) continue;
      // Only keep relations where both endpoints are entities we actually
      // emitted; otherwise the EntityMap appendUnreachable path stacks them.
      if (!entityByCanonical.has(subject) || !entityByCanonical.has(object)) continue;
      pushRelation({
        subject,
        predicate,
        object,
        evidence: rel.evidence ?? `Aus Analyse "${keyword}"`
      });
    }
  }

  return {
    entities: Array.from(entityByCanonical.values()),
    relations
  };
}
