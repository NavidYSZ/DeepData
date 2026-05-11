export type SemanticRole = "pillar" | "supporting" | "peripheral";

export type CoverageDepth = "shallow" | "moderate" | "deep";

export type PageType =
  | "pillar_page"
  | "service_page"
  | "product_detail"
  | "blog_article"
  | "faq"
  | "category_page"
  | "location_page"
  | "about_page"
  | "landing_page"
  | "other";

export type Intent = "informational" | "commercial" | "transactional" | "navigational";

export type ExtractionEntity = {
  name: string;
  canonical_name: string;
  category: string;
  mentions: number;
  definition_in_text: string | null;
  semantic_role: SemanticRole;
};

export type ExtractionRelation = {
  subject: string;
  predicate: string;
  object: string;
  evidence: string;
};

export type ExtractionMeta = {
  language: string;
  domain: string;
  page_type: PageType | string;
  intent: Intent | string;
  audience: string;
};

export type ExtractionSeo = {
  pillar_topic: string;
  subtopics: string[];
  semantic_field: string[];
  coverage_depth: CoverageDepth | string;
  content_gaps: string[];
  related_clusters: string[];
  competing_topics: string[];
  target_queries: string[];
};

export type ExtractionOutput = {
  meta: ExtractionMeta;
  schema: { categories: string[] };
  entities: ExtractionEntity[];
  relations: ExtractionRelation[];
  seo: ExtractionSeo;
};
