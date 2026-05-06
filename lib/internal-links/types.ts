// Schema for internal link analysis. Mirrors the persistence shape that a
// future crawler is expected to write, so the UI and scoring layer can be
// swapped from mock data to real data without further refactoring.

export type AnchorClass =
  | "exact"
  | "partial"
  | "branded"
  | "entity"
  | "generic"
  | "empty"
  | "image_no_alt";

export type LinkPlacement = "content" | "navigation" | "footer" | "sidebar" | "image";

export type PageType = "hub" | "category" | "product" | "guide" | "service" | "other";

// One crawled URL plus its merged GSC metrics. The crawler emits the snapshot,
// the GSC sync joins position/impressions/clicks. Cluster is derived from the
// SERP-cluster pipeline that already exists in this repo.
export interface UrlSnapshot {
  id: string;
  url: string;
  title: string;
  h1: string | null;
  pageType: PageType;
  cluster: string;
  indexable: boolean;
  // GSC-derived metrics (28d default window).
  position: number;
  impressions: number;
  clicks: number;
}

// One internal link instance. The crawler emits one row per occurrence, so a
// single source URL can have multiple links to the same target with different
// anchors and placements.
export interface InternalLink {
  id: string;
  sourceId: string;
  targetId: string;
  anchorText: string;
  anchorClass: AnchorClass;
  placement: LinkPlacement;
  // True when the link sits in the main content body (not nav/footer/sidebar).
  isContextual: boolean;
  isNofollow: boolean;
}

// Output of the scoring pass. One row per indexable target URL.
export interface OpportunityRow {
  snapshot: UrlSnapshot;
  // Aggregate inlink stats.
  totalInlinks: number;
  uniqueSources: number;
  contextualLinks: number;
  // Anchor distribution as percentages summing to 100.
  anchorBreakdown: Record<AnchorClass, number>;
  // Cluster-relative deficit. Positive = below peers.
  peerDeficitPct: number;
  // Normalised 0–100 axes used by the matrix.
  rankingProximity: number;
  linkDeficit: number;
  anchorHealth: number;
  quickWinScore: number;
  quadrant: "quick_win" | "link_audit" | "low_priority" | "content_audit";
  category: "quick_win" | "investigate" | "stable" | "low_data";
}

// Pre-computed recommendation a user can act on. Generated deterministically
// from the inlink graph + anchor stats — no LLM required. Field semantics are
// kept plain-language so the UI can render them verbatim:
//   action      = the imperative ("Verlinke von der Übersichtsseite")
//   sourceUrl   = which page should hold the new/changed link
//   oldAnchor   = the anchor text to replace, if any
//   newAnchor   = the anchor text to use instead
//   why         = a one-sentence reason for the recommendation
export interface LinkRecommendation {
  id: string;
  targetId: string;
  kind: "add_hub_link" | "replace_generic_anchor" | "cross_link_peer" | "fix_image_alt";
  priority: "high" | "medium" | "low";
  action: string;
  why: string;
  sourceUrl?: string;
  oldAnchor?: string;
  newAnchor?: string;
}

// Snapshot-level stat used by the Executive Dashboard view. Computed in one
// pass over the opportunity rows so the UI does not need to know the formula.
export interface ExecutiveKpis {
  // Pages that already rank inside reachable territory but have a real link
  // deficit — i.e. the "quick_win" category.
  highPriorityCount: number;
  // Estimated additional monthly clicks if every quick-win URL gained the
  // realistic CTR uplift from a small position improvement.
  estimatedClicksPotential: number;
  // Share of all internal links whose anchor is generic / empty / image
  // without alt — the easy rewrites.
  weakAnchorPct: number;
  // Indexable URLs with 0–2 incoming internal links.
  nearOrphanCount: number;
}

// Inbound-link record used by the URL Inspector modal so it can show the full
// anchor distribution per target without re-querying.
export interface InboundLink {
  sourceId: string;
  sourceUrl: string;
  anchorText: string;
  anchorClass: AnchorClass;
  placement: LinkPlacement;
  isContextual: boolean;
  isNofollow: boolean;
}
