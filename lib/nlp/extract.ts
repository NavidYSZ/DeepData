import * as cheerio from "cheerio";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (compatible; DeepDataBot/1.0; +https://deepdata.local) NlpAnalyzer";

export type ExtractResult = {
  finalUrl: string;
  title: string | null;
  description: string | null;
  text: string;
  totalChars: number;
  source: "article" | "main" | "body";
};

export async function fetchAndExtract(targetUrl: string): Promise<ExtractResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de,en;q=0.8"
      },
      redirect: "follow",
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`Fetch failed with HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("html") && !contentType.includes("xml")) {
      throw new Error(`Unsupported content-type: ${contentType || "unknown"}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      const html = await res.text();
      return extractFromHtml(res.url, html);
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_HTML_BYTES) {
        try {
          await reader.cancel();
        } catch {}
        throw new Error(`Response too large (>${MAX_HTML_BYTES} bytes)`);
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
    return extractFromHtml(res.url, html);
  } finally {
    clearTimeout(timer);
  }
}

function extractFromHtml(finalUrl: string, html: string): ExtractResult {
  const $ = cheerio.load(html);

  const title = $("head title").first().text().trim() || null;
  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;

  $(
    "script, style, noscript, template, iframe, svg, nav, aside, header, footer, form, button, .cookie, .cookies, .cookie-banner, [aria-hidden='true']"
  ).remove();

  let source: ExtractResult["source"] = "body";
  let root = $("article").first();
  if (!root.length || textOf(root).length < 200) {
    root = $("main").first();
    source = "main";
  } else {
    source = "article";
  }
  if (!root.length || textOf(root).length < 200) {
    root = $("body");
    source = "body";
  }

  const text = textOf(root);
  return {
    finalUrl,
    title,
    description,
    text,
    totalChars: text.length,
    source
  };
}

function textOf(node: cheerio.Cheerio<any>): string {
  return node
    .text()
    .replace(/\s+/g, " ")
    .replace(/ /g, " ")
    .trim();
}
