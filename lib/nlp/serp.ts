export type SerpTopUrl = {
  url: string;
  position: number;
};

export type SerpFetchResult = {
  urls: SerpTopUrl[];
  status: number;
  durationMs: number;
  error?: string;
};

export type SerpFetchOptions = {
  geolocation?: string;
  language?: string;
  device?: "desktop" | "mobile";
  topN?: number;
  maxAttempts?: number;
  timeoutMs?: number;
};

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_GEOLOCATION = "DE";
const DEFAULT_LANGUAGE = "de";
const DEFAULT_DEVICE = "desktop";
const DEFAULT_TOP_N = 10;

function retryDelayMs(attempt: number): number {
  return Math.min(2000 * attempt, 6000);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch the top organic SERP URLs for a keyword via the Zyte API.
 *
 * Uses the same provider as the keyword-workspace SERP-clustering pipeline.
 * Requires ZYTE_API_KEY in the environment.
 */
export async function fetchSerpTopUrls(
  keyword: string,
  options: SerpFetchOptions = {}
): Promise<SerpFetchResult> {
  const apiKey = process.env.ZYTE_API_KEY;
  if (!apiKey) {
    return { urls: [], status: 0, durationMs: 0, error: "ZYTE_API_KEY missing" };
  }

  const language = options.language ?? DEFAULT_LANGUAGE;
  const geolocation = options.geolocation ?? DEFAULT_GEOLOCATION;
  const device = options.device ?? DEFAULT_DEVICE;
  const topN = options.topN ?? DEFAULT_TOP_N;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const searchUrl = `https://www.google.${language === "de" ? "de" : "com"}/search?q=${encodeURIComponent(
    keyword
  )}&hl=${encodeURIComponent(language)}`;

  const body = {
    url: searchUrl,
    serp: true,
    serpOptions: { extractFrom: "httpResponseBody" },
    geolocation,
    device,
    followRedirect: true
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
      const durationMs = Date.now() - started;
      if (attempt < maxAttempts) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      const reason =
        e instanceof Error && e.name === "AbortError" ? "timeout" : "network_error";
      return { urls: [], status: 0, durationMs, error: `${reason}: ${String(e)}` };
    } finally {
      clearTimeout(timeout);
    }

    const durationMs = Date.now() - started;
    const status = res.status;

    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }

    const organicResults: unknown[] =
      (json as { serp?: { organicResults?: unknown[] } })?.serp?.organicResults ?? [];
    const urls: SerpTopUrl[] = organicResults
      .filter((r): r is { url: string; rank?: number } => {
        return typeof r === "object" && r !== null && typeof (r as { url?: unknown }).url === "string";
      })
      .slice(0, topN)
      .map((r, idx) => ({
        url: r.url,
        position: typeof r.rank === "number" ? r.rank : idx + 1
      }));

    const retryableStatus = status === 429 || status >= 500;
    const retryableEmpty = status >= 200 && status < 300 && urls.length === 0;
    const shouldRetry = (retryableStatus || retryableEmpty) && attempt < maxAttempts;
    if (shouldRetry) {
      await sleep(retryDelayMs(attempt));
      continue;
    }

    const errorMessage = (json as { message?: string })?.message;
    return {
      urls,
      status,
      durationMs,
      error:
        status >= 400
          ? errorMessage ?? `serp_fetch_failed_${status}`
          : urls.length === 0
            ? "no_organic_results"
            : undefined
    };
  }

  return { urls: [], status: 0, durationMs: 0, error: "max_retries" };
}
