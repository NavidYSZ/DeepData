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
  /** Char count BEFORE postClean — useful to see how much boilerplate was stripped. */
  rawChars: number;
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

// Substrings that, when found in id or class of an element, mark it as
// boilerplate to strip before extracting the body. Case-insensitive.
const NOISE_ID_CLASS_PATTERNS =
  /cookie|gdpr|consent|newsletter|comments?\b|sidebar|share|social|advert|sponsor|banner|breadcrumb|popup|modal|overlay|toolbar|related[-_]?(post|article)|recommend|sticky[-_]?cta|notification|skip[-_]?link/i;

function extractFromHtml(finalUrl: string, html: string): ExtractResult {
  const $ = cheerio.load(html);

  const title = $("head title").first().text().trim() || null;
  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;

  // Step 1: Strip well-known noise tags + ARIA roles.
  $(
    [
      "script",
      "style",
      "noscript",
      "template",
      "iframe",
      "svg",
      "nav",
      "aside",
      "header",
      "footer",
      "form",
      "button",
      "[aria-hidden='true']",
      "[role='navigation']",
      "[role='banner']",
      "[role='contentinfo']",
      "[role='complementary']",
      "[role='search']",
      "[role='dialog']"
    ].join(", ")
  ).remove();

  // Step 2: Strip elements whose id/class signals boilerplate.
  $("[id], [class]").each((_, el) => {
    const $el = $(el);
    const id = $el.attr("id") ?? "";
    const cls = $el.attr("class") ?? "";
    if (NOISE_ID_CLASS_PATTERNS.test(id) || NOISE_ID_CLASS_PATTERNS.test(cls)) {
      $el.remove();
    }
  });

  // Step 3: Choose content root in priority order.
  let source: ExtractResult["source"] = "body";
  let root = $("article").first();
  if (root.length && textOfFlat(root).length >= 200) {
    source = "article";
  } else {
    root = $("main").first();
    if (root.length && textOfFlat(root).length >= 200) {
      source = "main";
    } else {
      root = $("body");
      source = "body";
    }
  }

  // Step 4: Markdown-flavoured extraction (preserves paragraph + heading
  // breaks so the LLM sees structure rather than one giant ribbon of text).
  const structured = extractStructuredText(root, $);

  // Step 5: Strip boilerplate phrases + orphan UI fragments.
  const cleaned = postClean(structured);

  return {
    finalUrl,
    title,
    description,
    text: cleaned,
    totalChars: cleaned.length,
    rawChars: structured.length,
    source
  };
}

function textOfFlat(node: cheerio.Cheerio<any>): string {
  return node.text().replace(/\s+/g, " ").trim();
}

function extractStructuredText(
  root: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI
): string {
  if (!root.length) return "";
  const parts: string[] = [];
  root
    .find("h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, dt, dd, td")
    .each((_, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (!text) return;
      let prefix = "";
      if ($el.is("h1")) prefix = "# ";
      else if ($el.is("h2")) prefix = "## ";
      else if ($el.is("h3")) prefix = "### ";
      else if ($el.is("h4, h5, h6")) prefix = "#### ";
      else if ($el.is("li, dt")) prefix = "- ";
      else if ($el.is("blockquote")) prefix = "> ";
      parts.push(prefix + text);
    });
  if (parts.length === 0) return textOfFlat(root);
  return parts.join("\n\n");
}

// Conservative regex-list — only matches phrases unambiguously associated
// with UI / legal / cookie chrome. False positives here would erase real
// content, so the list is intentionally narrow.
const BOILERPLATE_PATTERNS: RegExp[] = [
  /diese\s+website\s+verwendet\s+cookies[^\n]{0,300}/gi,
  /diese\s+seite\s+verwendet\s+cookies[^\n]{0,300}/gi,
  /we\s+use\s+cookies[^\n]{0,300}/gi,
  /by\s+clicking\s+["“'„][^"”'“]{0,30}["”'"][^\n]{0,200}cookies?[^\n]{0,200}/gi,
  /alle\s+cookies\s+akzeptieren/gi,
  /cookies?\s+(akzeptieren|accept all|accept|ablehnen|reject|verwalten|manage)/gi,
  /datenschutz(erkl[äa]rung|einstellungen|hinweise?)/gi,
  /privacy\s+(policy|preferences|settings|notice)/gi,
  /newsletter\s+(anmelden|abonnieren|subscribe|signup|sign\s*up)/gi,
  /skip\s+to\s+(main\s+)?content/gi,
  /zum\s+inhalt\s+springen/gi,
  /© \s*\d{4}[^\n]{0,200}/g,
  /all\s+rights\s+reserved\.?/gi,
  /folgen\s+sie\s+uns(\s+auf)?/gi,
  /follow\s+us(\s+on)?/gi,
  /teilen\s+(auf|via|über)/gi,
  /share\s+(on|via)/gi
];

function postClean(text: string): string {
  let cleaned = text;
  for (const pattern of BOILERPLATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  // Strip raw URLs (noise for entity extraction).
  cleaned = cleaned.replace(/https?:\/\/\S+/g, "");
  // Collapse runs of 3+ newlines.
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  // Trim each line.
  cleaned = cleaned
    .split("\n")
    .map((l) => l.trim())
    .join("\n");
  // Drop short orphan paragraphs that don't look like sentences (likely
  // residual menu items or UI fragments).
  cleaned = cleaned
    .split(/\n\n+/)
    .filter((para) => {
      const p = para.trim();
      if (!p) return false;
      if (p.startsWith("#") || p.startsWith("- ") || p.startsWith("> ")) return true;
      if (p.length < 30 && !/[.!?:]$/.test(p)) return false;
      return true;
    })
    .join("\n\n");
  return cleaned.trim();
}
