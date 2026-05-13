import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";

const bodySchema = z.object({
  keywords: z.array(z.string().min(1)).min(1).max(200)
});

type CacheEntry = {
  allintitle: number | null;
  fetchedAt: number;
  error?: string;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 25_000;
const FETCH_MAX_ATTEMPTS = 3;

const cache = new Map<string, CacheEntry>();

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ code, message, traceId: nanoid(10) }, { status });
}

function cacheKey(keyword: string) {
  return keyword.trim().toLowerCase();
}

function isFresh(entry: CacheEntry) {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTotalResults(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function extractAllintitle(json: any): number | null {
  const serp = json?.serp ?? {};
  const candidates: unknown[] = [
    serp?.searchInformation?.totalResults,
    serp?.searchInformation?.formattedTotalResults,
    serp?.totalResults,
    serp?.metadata?.totalResults,
    serp?.displayedTotalResults,
    json?.searchInformation?.totalResults
  ];
  for (const c of candidates) {
    const n = parseTotalResults(c);
    if (n !== null) return n;
  }
  const organic = Array.isArray(serp?.organicResults) ? serp.organicResults : null;
  if (organic && organic.length === 0) return 0;
  return null;
}

async function fetchAllintitleOnce(keyword: string, apiKey: string): Promise<{ value: number | null; error?: string }> {
  const query = `allintitle:"${keyword}"`;
  const url = `https://www.google.de/search?q=${encodeURIComponent(query)}&hl=de`;
  const body = {
    url,
    serp: true,
    serpOptions: { extractFrom: "httpResponseBody" },
    geolocation: "DE",
    device: "desktop",
    followRedirect: true
  };

  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response | null = null;
    try {
      res = await fetch("https://api.zyte.com/v1/extract", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timeout);
      if (attempt < FETCH_MAX_ATTEMPTS) {
        await sleep(500 * attempt);
        continue;
      }
      const reason = e instanceof Error && e.name === "AbortError" ? "timeout" : "network_error";
      return { value: null, error: reason };
    } finally {
      clearTimeout(timeout);
    }

    const status = res.status;
    const retryable = status === 429 || status >= 500;
    if (retryable && attempt < FETCH_MAX_ATTEMPTS) {
      await sleep(800 * attempt);
      continue;
    }
    if (status >= 400) {
      return { value: null, error: `http_${status}` };
    }
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      return { value: null, error: "parse_error" };
    }
    const value = extractAllintitle(json);
    return { value };
  }
  return { value: null, error: "max_retries" };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", 401);

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return err("INVALID_BODY", "Invalid JSON body");
  }
  if (!parsed.success) return err("INVALID_BODY", "keywords[] is required (1-200)");

  const apiKey = process.env.ZYTE_API_KEY;
  if (!apiKey) return err("CONFIG_MISSING", "ZYTE_API_KEY not configured", 500);

  const uniqueByKey = new Map<string, string>();
  for (const kw of parsed.data.keywords) {
    const key = cacheKey(kw);
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, kw);
  }

  const toFetch: Array<{ key: string; original: string }> = [];
  const out = new Map<string, { allintitle: number | null; cached: boolean; error?: string }>();

  for (const [key, original] of uniqueByKey) {
    const hit = cache.get(key);
    if (hit && isFresh(hit)) {
      out.set(key, { allintitle: hit.allintitle, cached: true, error: hit.error });
    } else {
      toFetch.push({ key, original });
    }
  }

  if (toFetch.length > 0) {
    const settled = await Promise.all(
      toFetch.map(async ({ key, original }) => {
        const result = await fetchAllintitleOnce(original, apiKey);
        cache.set(key, {
          allintitle: result.value,
          fetchedAt: Date.now(),
          error: result.error
        });
        return { key, allintitle: result.value, error: result.error };
      })
    );
    for (const r of settled) {
      out.set(r.key, { allintitle: r.allintitle, cached: false, error: r.error });
    }
  }

  const results = parsed.data.keywords.map((kw) => {
    const key = cacheKey(kw);
    const entry = out.get(key);
    return {
      keyword: kw,
      allintitle: entry?.allintitle ?? null,
      cached: entry?.cached ?? false,
      error: entry?.error
    };
  });

  return NextResponse.json({ results });
}
