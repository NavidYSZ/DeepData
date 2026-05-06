import type { PageType } from "./types";

// Heuristic cluster + page-type derivation from a URL path. Deliberately
// simple — pluggable so a future implementation can use SERP-cluster output
// instead. For the current crawler this is "good enough" to give the matrix
// meaningful peer groupings.

const HUB_HINTS = ["hub", "kategorien", "sortiment"];
const CATEGORY_HINTS = ["produkte", "products", "kategorie", "category", "shop"];
const GUIDE_HINTS = ["ratgeber", "guide", "blog", "magazin", "academy", "wissen", "lexikon"];
const SERVICE_HINTS = ["service", "kontakt", "anfrage", "contact", "support", "hilfe"];

function pathSegments(pathname: string): string[] {
  return pathname
    .split("/")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Cluster key = first significant URL path segment, normalised. URLs without
// any segment (e.g. the home page) fall into the "root" cluster.
export function deriveCluster(pathname: string): string {
  const segments = pathSegments(pathname);
  if (segments.length === 0) return "root";

  // If the first segment is a language code, look one level deeper.
  const first = segments[0];
  if (/^[a-z]{2}(-[a-z]{2})?$/.test(first) && segments.length > 1) {
    return segments[1].replace(/[^a-z0-9-]/g, "-");
  }
  return first.replace(/[^a-z0-9-]/g, "-");
}

// Derive page type purely from URL pattern. The crawler can override this if
// stronger signals are available (e.g. structured data). Order of checks
// matters — service hints are checked before product hints because pages like
// `/service/produkte/` sit in the service silo, not the product silo.
export function derivePageType(pathname: string): PageType {
  const segments = pathSegments(pathname);
  if (segments.length === 0) return "hub";

  for (const seg of segments) {
    if (SERVICE_HINTS.includes(seg)) return "service";
    if (GUIDE_HINTS.includes(seg)) return "guide";
  }

  // A category landing page typically has exactly two path segments
  // ("/produkte/tieflader/") while a product page goes deeper.
  for (const seg of segments) {
    if (CATEGORY_HINTS.includes(seg)) {
      return segments.length <= 2 ? "category" : "product";
    }
  }

  for (const seg of segments) {
    if (HUB_HINTS.includes(seg)) return "hub";
  }

  // Single-segment URLs are usually top-level hubs/categories.
  if (segments.length === 1) return "hub";

  return "other";
}
