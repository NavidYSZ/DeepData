import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

import { classifyAnchor, brandFromHostname } from "./anchor-classifier";
import { deriveCluster, derivePageType } from "./cluster";
import type { AnchorClass, LinkPlacement, PageType } from "./types";

// Output of a single page crawl. Persistence is a separate concern — the
// crawler returns plain data so it stays unit-testable without a DB.
export interface CrawledPage {
  url: string;
  statusCode: number;
  title: string | null;
  h1: string | null;
  canonical: string | null;
  indexable: boolean;
  pageType: PageType;
  cluster: string;
  outboundLinks: ExtractedLink[];
}

export interface ExtractedLink {
  targetUrl: string;
  anchorText: string;
  placement: LinkPlacement;
  isNofollow: boolean;
  isImageWrap: boolean;
  imageAlt: string | null;
  // Filled in by the second crawler pass once target H1/title are known.
  anchorClass?: AnchorClass;
}

export interface CrawlOptions {
  maxUrls: number;
  concurrency: number;
  // Per-page network timeout in ms.
  timeoutMs: number;
  userAgent: string;
}

export const DEFAULT_OPTIONS: CrawlOptions = {
  maxUrls: 500,
  concurrency: 3,
  timeoutMs: 8000,
  userAgent: "DeepDataBot/1.0 (Internal Link Analysis)"
};

const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];
const MAX_BODY_BYTES = 5 * 1024 * 1024;

// URL normalisation. Keeps the page identity stable across the BFS so that
// "/foo" and "/foo/" don't get crawled twice with a different shape.
export function normaliseUrl(rawUrl: string, baseUrl?: string): string | null {
  try {
    const u = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.toLowerCase();
    if (
      (u.protocol === "http:" && u.port === "80") ||
      (u.protocol === "https:" && u.port === "443")
    ) {
      u.port = "";
    }
    // Strip a trailing slash unless the path is just "/".
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return null;
  }
}

function isSameOrigin(target: string, base: string): boolean {
  try {
    const t = new URL(target);
    const b = new URL(base);
    return t.hostname === b.hostname;
  } catch {
    return false;
  }
}

// Walk up the DOM tree from a link element to determine its semantic placement.
function detectPlacement(el: Element): LinkPlacement {
  let current: AnyNode | null = el.parent;
  while (current) {
    if (current.type === "tag") {
      const tag = (current as Element).name?.toLowerCase();
      if (tag === "nav" || tag === "header") return "navigation";
      if (tag === "footer") return "footer";
      if (tag === "aside") return "sidebar";
      if (tag === "main" || tag === "article") return "content";
    }
    current = current.parent;
  }
  return "content";
}

async function fetchHtml(
  url: string,
  options: CrawlOptions
): Promise<{ statusCode: number; html: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": options.userAgent,
        Accept: "text/html,application/xhtml+xml"
      },
      redirect: "follow",
      signal: controller.signal
    });
    const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
    if (!HTML_CONTENT_TYPES.some((t) => contentType.includes(t))) {
      return { statusCode: res.status, html: null };
    }
    const reader = res.body?.getReader();
    if (!reader) {
      return { statusCode: res.status, html: await res.text() };
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {}
        return { statusCode: res.status, html: null };
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { statusCode: res.status, html: buf.toString("utf-8") };
  } catch {
    return { statusCode: 0, html: null };
  } finally {
    clearTimeout(timer);
  }
}

export interface ParsedPage {
  url: string;
  statusCode: number;
  title: string | null;
  h1: string | null;
  canonical: string | null;
  indexable: boolean;
  outboundLinks: ExtractedLink[];
}

export function parseHtml(pageUrl: string, statusCode: number, html: string): ParsedPage {
  const $ = cheerio.load(html);
  const title = $("head title").first().text().trim() || null;
  const h1 = $("h1").first().text().trim() || null;
  const canonical = $("link[rel='canonical']").attr("href")?.trim() || null;
  const robots = ($("meta[name='robots']").attr("content") ?? "").toLowerCase();
  const indexable = !robots.includes("noindex") && statusCode >= 200 && statusCode < 400;

  const outboundLinks: ExtractedLink[] = [];
  $("a[href]").each((_, el) => {
    const $el = $(el);
    const hrefRaw = $el.attr("href");
    if (!hrefRaw) return;
    const target = normaliseUrl(hrefRaw, pageUrl);
    if (!target) return;
    if (target === pageUrl) return; // self-link
    const placement = detectPlacement(el as Element);
    const rel = ($el.attr("rel") ?? "").toLowerCase();
    const isNofollow = rel.split(/\s+/).includes("nofollow");
    const $img = $el.find("img").first();
    const anchorText = $el.text().replace(/\s+/g, " ").trim();
    const isImageWrap = $img.length > 0 && anchorText.length === 0;
    const imageAlt = $img.attr("alt")?.trim() ?? null;

    outboundLinks.push({
      targetUrl: target,
      anchorText,
      placement,
      isNofollow,
      isImageWrap,
      imageAlt
    });
  });

  return {
    url: pageUrl,
    statusCode,
    title,
    h1,
    canonical,
    indexable,
    outboundLinks
  };
}

// Main crawl loop. Returns once every URL in the visited set has been fetched
// or the cap is hit. Concurrency is enforced with a fixed-size worker pool.
export async function crawl(seedUrl: string, options: Partial<CrawlOptions> = {}): Promise<CrawledPage[]> {
  const opts: CrawlOptions = { ...DEFAULT_OPTIONS, ...options };
  const normalisedSeed = normaliseUrl(seedUrl);
  if (!normalisedSeed) throw new Error("Invalid seed URL");
  // Re-bind explicitly so the type narrowing survives into the worker
  // closure — TS resets narrowing for variables read inside async callbacks.
  const seed: string = normalisedSeed;

  const visited = new Set<string>();
  const enqueued = new Set<string>();
  const queue: string[] = [seed];
  enqueued.add(seed);
  const results: CrawledPage[] = [];
  let inflight = 0;

  // First pass: fetch and parse, collecting raw pages. Anchor classification
  // happens after, since it needs the target page's H1+title.
  const rawPages = new Map<string, ParsedPage>();

  async function worker() {
    while (true) {
      if (results.length + rawPages.size >= opts.maxUrls && inflight === 0) return;
      const url = queue.shift();
      if (!url) {
        if (inflight === 0) return;
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }
      if (visited.has(url)) continue;
      visited.add(url);
      if (rawPages.size >= opts.maxUrls) continue;

      inflight++;
      try {
        const { statusCode, html } = await fetchHtml(url, opts);
        if (!html) {
          // Still record a stub snapshot so the run shows error pages.
          rawPages.set(url, {
            url,
            statusCode,
            title: null,
            h1: null,
            canonical: null,
            indexable: false,
            outboundLinks: []
          });
          continue;
        }
        const parsed = parseHtml(url, statusCode, html);
        rawPages.set(url, parsed);

        for (const link of parsed.outboundLinks) {
          if (!isSameOrigin(link.targetUrl, seed)) continue;
          if (visited.has(link.targetUrl) || enqueued.has(link.targetUrl)) continue;
          if (rawPages.size + queue.length >= opts.maxUrls) break;
          queue.push(link.targetUrl);
          enqueued.add(link.targetUrl);
        }
      } finally {
        inflight--;
      }
    }
  }

  const workers = Array.from({ length: opts.concurrency }, () => worker());
  await Promise.all(workers);

  // Second pass: classify anchors with full target context now available.
  const seedHost = new URL(seed).hostname;
  const brand = brandFromHostname(seedHost);

  for (const [url, parsed] of rawPages) {
    const pathname = new URL(url).pathname;
    const cluster = deriveCluster(pathname);
    const pageType = derivePageType(pathname);

    const finalLinks: ExtractedLink[] = parsed.outboundLinks
      .filter((l) => isSameOrigin(l.targetUrl, seed))
      .map((link) => {
        const target = rawPages.get(link.targetUrl);
        const anchorClass = classifyAnchor(link.anchorText, {
          isImageWrap: link.isImageWrap,
          imageAlt: link.imageAlt ?? undefined,
          targetH1: target?.h1 ?? null,
          targetTitle: target?.title ?? link.targetUrl,
          brand
        });
        return { ...link, anchorClass };
      });

    results.push({
      url,
      statusCode: parsed.statusCode,
      title: parsed.title,
      h1: parsed.h1,
      canonical: parsed.canonical,
      indexable: parsed.indexable,
      pageType,
      cluster,
      outboundLinks: finalLinks
    });
  }

  return results;
}

