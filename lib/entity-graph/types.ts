export type SemanticRole = "pillar" | "supporting" | "peripheral";

export type EntityGraphEntity = {
  name: string;
  canonical_name: string;
  category: string;
  mentions: number;
  definition_in_text: string | null;
  semantic_role: SemanticRole;
};

export type EntityGraphRelation = {
  subject: string;
  predicate: string;
  object: string;
  evidence: string;
};

export type EntityGraphInput = {
  entities: EntityGraphEntity[];
  relations: EntityGraphRelation[];
};
