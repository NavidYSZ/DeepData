import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import * as cheerio from "cheerio";
import { authOptions } from "@/lib/auth";

const bodySchema = z.object({
  url: z.string().url(),
  features: z
    .object({
      sentiment: z.boolean().optional(),
      entities: z.boolean().optional(),
      entitySentiment: z.boolean().optional(),
      classify: z.boolean().optional()
    })
    .optional()
});

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_NLP_CHARS = 20_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; DeepDataBot/1.0; +https://deepdata.local) NlpAnalyzer";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_NLP_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing GOOGLE_NLP_API_KEY. Enable the Natural Language API in Google Cloud and set GOOGLE_NLP_API_KEY in your .env.local."
      },
      { status: 500 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let extracted: ExtractResult;
  try {
    extracted = await fetchAndExtract(body.url);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to fetch URL" },
      { status: 422 }
    );
  }

  if (extracted.text.length < 50) {
    return NextResponse.json(
      {
        error:
          "Extracted body content is too short (<50 chars). The page may require JavaScript, be paywalled, or block bots.",
        extracted
      },
      { status: 422 }
    );
  }

  const features = {
    sentiment: true,
    entities: true,
    entitySentiment: false,
    classify: false,
    ...(body.features ?? {})
  };

  const truncated = extracted.text.slice(0, MAX_NLP_CHARS);

  const payload = {
    document: { type: "PLAIN_TEXT", content: truncated },
    features: {
      extractSyntax: false,
      extractEntities: !!features.entities,
      extractDocumentSentiment: !!features.sentiment,
      extractEntitySentiment: !!features.entitySentiment,
      classifyText: !!features.classify
    },
    encodingType: "UTF8"
  };

  const url = `https://language.googleapis.com/v1/documents:annotateText?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const nlp = await res.json();
    if (!res.ok) {
      const message = nlp?.error?.message ?? "Google NLP request failed";
      return NextResponse.json(
        { error: message, status: res.status, extracted },
        { status: res.status }
      );
    }
    return NextResponse.json({
      extracted: {
        ...extracted,
        analyzedChars: truncated.length,
        truncated: truncated.length < extracted.text.length
      },
      nlp
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Network error calling Google NLP", extracted },
      { status: 502 }
    );
  }
}

type ExtractResult = {
  finalUrl: string;
  title: string | null;
  description: string | null;
  text: string;
  totalChars: number;
  source: "article" | "main" | "body";
};

async function fetchAndExtract(targetUrl: string): Promise<ExtractResult> {
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
    .replace(/ /g, " ")
    .trim();
}
