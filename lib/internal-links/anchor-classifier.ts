import type { AnchorClass } from "./types";

// Pure anchor classifier. Given the raw anchor text + minimal target context,
// decide which AnchorClass the link belongs to. No I/O, no DB.

export interface AnchorContext {
  // Set when the <a> wraps an <img> with no other text content. The crawler
  // should pre-detect this; the classifier only needs the boolean + alt text.
  isImageWrap: boolean;
  imageAlt?: string;
  // Target page H1 and title — primary signal for exact/partial matching.
  targetH1: string | null;
  targetTitle: string;
  // Optional brand string (e.g. extracted from hostname). When provided, an
  // anchor that *only* equals the brand is classified as "branded".
  brand?: string;
}

// Generic anchor phrases. Matched on whole-text equality after normalisation —
// we do not flag "mehr Informationen zur Lieferung" as generic just because
// it contains "mehr". Curated for German + English.
const GENERIC_PHRASES = new Set([
  "mehr",
  "mehr erfahren",
  "mehr informationen",
  "mehr info",
  "mehr lesen",
  "weiterlesen",
  "weiter",
  "weiter lesen",
  "hier",
  "hier klicken",
  "hier mehr",
  "klicken sie hier",
  "details",
  "zum artikel",
  "zum produkt",
  "zur seite",
  "übersicht",
  "lesen",
  "lesen sie",
  "lesen sie mehr",
  "info",
  "infos",
  "click here",
  "read more",
  "learn more",
  "more",
  "here",
  "see more",
  "view more",
  "details ansehen"
]);

// Tokenisation stopwords. Used so that "der Tieflader mit Auflaufbremse"
// matches "Tieflader mit Auflaufbremse" as "exact" rather than "partial".
const STOPWORDS = new Set([
  // de
  "der",
  "die",
  "das",
  "den",
  "dem",
  "ein",
  "eine",
  "einen",
  "einer",
  "und",
  "oder",
  "mit",
  "für",
  "von",
  "im",
  "in",
  "an",
  "auf",
  "zu",
  "zur",
  "zum",
  "ist",
  "sind",
  "auch",
  // en
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "for",
  "in",
  "on",
  "to",
  "with",
  "is",
  "are"
]);

export function normaliseAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[­​-‍﻿]/g, "") // soft hyphens, zero-widths
    .trim();
}

export function tokenise(text: string): string[] {
  return normaliseAnchor(text)
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let hit = 0;
  for (const tok of a) if (setB.has(tok)) hit += 1;
  // Coverage of the smaller set, so a 1-token anchor that matches gets full
  // credit instead of being diluted by a long target H1.
  return hit / Math.min(a.length, b.length);
}

function looksLikeEntity(tokens: string[], rawText: string): boolean {
  if (tokens.length === 0 || tokens.length > 3) return false;
  // Patterns like "PI 6000", "DDR 3", "iPhone 14".
  const hasDigit = /\d/.test(rawText);
  const hasCapitalised = /[A-Z]/.test(rawText);
  return hasDigit && hasCapitalised;
}

export function classifyAnchor(rawText: string, context: AnchorContext): AnchorClass {
  // 1. Image link without descriptive alt.
  const altText = context.imageAlt?.trim() ?? "";
  if (context.isImageWrap && altText.length === 0) return "image_no_alt";

  // 2. Effective anchor text — fall back to alt for image links.
  const effective = (rawText.trim() || altText).trim();
  if (effective.length === 0) return "empty";

  const normalised = normaliseAnchor(effective);

  // 3. Branded — anchor equals the site's brand only.
  if (context.brand) {
    const brand = normaliseAnchor(context.brand);
    if (brand && normalised === brand) return "branded";
  }

  // 4. Generic stoplist (whole-text match).
  if (GENERIC_PHRASES.has(normalised)) return "generic";

  // 5. Compare to target H1 + title.
  const anchorTokens = tokenise(effective);
  const h1Tokens = context.targetH1 ? tokenise(context.targetH1) : [];
  const titleTokens = tokenise(context.targetTitle);
  const targetTokens = h1Tokens.length > 0 ? h1Tokens : titleTokens;

  if (anchorTokens.length > 0 && targetTokens.length > 0) {
    const sameTokens =
      anchorTokens.length === targetTokens.length &&
      anchorTokens.every((t, i) => t === targetTokens[i]);
    if (sameTokens) return "exact";

    const overlap = tokenOverlap(anchorTokens, targetTokens);
    if (overlap >= 0.95) return "exact";
    if (overlap >= 0.4) return "partial";
  }

  // 6. Entity-style anchor (model numbers, product codes).
  if (looksLikeEntity(anchorTokens, effective)) return "entity";

  // 7. Default: anchor exists but does not signal the target topic.
  return "generic";
}

// Extract a best-guess brand string from a hostname. "shop.example.com" →
// "Example". Used as a default for the classifier when no explicit brand
// is configured for the project.
export function brandFromHostname(hostname: string): string {
  const parts = hostname.replace(/^www\./, "").split(".");
  if (parts.length === 0) return "";
  const root = parts[0];
  // Capitalise first letter, keep the rest as-is so abbreviations stay intact.
  return root.charAt(0).toUpperCase() + root.slice(1);
}
