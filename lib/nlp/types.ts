import type {
  EntityGraphEntity,
  EntityGraphRelation,
  SemanticRole
} from "@/lib/entity-graph/types";

export type { SemanticRole } from "@/lib/entity-graph/types";

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

export type ExtractionEntity = EntityGraphEntity;
export type ExtractionRelation = EntityGraphRelation;

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

export type SitemapPageStatus =
  | "covered_on_page"
  | "content_gap"
  | "likely_exists_elsewhere";

export type SitemapPageRole =
  | "pillar"
  | "cluster_overview"
  | "service_page"
  | "info_page"
  | "location_page"
  | "about_page"
  | "faq"
  | "blog_article";

export type RecommendedPage = {
  slug: string;
  parent_slug: string | null;
  h1: string;
  page_role: SitemapPageRole | string;
  status: SitemapPageStatus | string;
  target_queries: string[];
  covers_entities: string[];
  covers_subtopics: string[];
  rationale: string;
};

export type RecommendedSitemap = {
  pages: RecommendedPage[];
};

export type ExtractionOutput = {
  meta: ExtractionMeta;
  schema: { categories: string[] };
  entities: ExtractionEntity[];
  relations: ExtractionRelation[];
  seo: ExtractionSeo;
  recommended_sitemap?: RecommendedSitemap;
};
