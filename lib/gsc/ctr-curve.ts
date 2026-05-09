import { prisma } from "@/lib/db";

// Position bucket for the CTR curve. We bucket by integer position because
// GSC's "average position" is fractional but the SERP itself is discrete:
// position 1.4 most likely means the URL bounced between rank 1 and 2 with
// 60/40 weighting, and we'd rather attribute it to a real bucket than
// invent a 1.4-bucket.
type Bucket = number;

const MAX_POSITION = 100;

// Smooth fallback curve. Used when a (user, site) doesn't have enough data
// to compute its own. Loosely matches publicly-cited CTR studies (Backlinko
// 2024, Sistrix-style); good enough as a prior, will be replaced by the
// site's own curve once data is available.
const FALLBACK_CTR: Record<number, number> = {
  1: 0.27, 2: 0.155, 3: 0.11, 4: 0.085, 5: 0.062,
  6: 0.046, 7: 0.034, 8: 0.027, 9: 0.022, 10: 0.018,
  11: 0.014, 12: 0.012, 13: 0.011, 14: 0.010, 15: 0.009,
  16: 0.008, 17: 0.008, 18: 0.007, 19: 0.007, 20: 0.006
};
const FALLBACK_TAIL = 0.003; // pos 21-100

function fallbackCtrAt(position: Bucket): number {
  if (position <= 20) return FALLBACK_CTR[position] ?? FALLBACK_TAIL;
  return FALLBACK_TAIL;
}

export interface CtrCurve {
  // ctrAt(position) returns the click-through rate to use when scoring a
  // ranking at that position. Always positive, monotonically non-increasing.
  ctrAt(position: number): number;
  source: "site" | "fallback";
  sampleSize: number;
}

// Minimum impressions per bucket before we trust the site's own data for
// that bucket. Lower buckets (top of page) need fewer impressions to be
// statistically meaningful because their CTR is bigger; deeper buckets
// need more samples since a single accidental click can spike the rate.
function minImpressionsForBucket(bucket: Bucket): number {
  if (bucket <= 3) return 200;
  if (bucket <= 10) return 500;
  if (bucket <= 20) return 1_000;
  return 2_000;
}

// Compute the per-position CTR curve for a (user, site) from the persisted
// daily metrics. Falls back to the prior for buckets without enough data
// so the curve is always defined for every position. Returns the prior
// directly when there's no data at all yet.
export async function getCtrCurve(
  userId: string,
  siteUrl: string,
  options: { lookbackDays?: number } = {}
): Promise<CtrCurve> {
  const lookbackDays = options.lookbackDays ?? 90;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - lookbackDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const rows = await prisma.gscDailyMetric.findMany({
    where: {
      userId,
      siteUrl,
      date: { gte: cutoffIso },
      // Position 0 happens for impressions where Google didn't record a rank
      // (rare but real). Skip them.
      position: { gt: 0 }
    },
    select: { position: true, impressions: true, clicks: true }
  });

  if (!rows.length) {
    return {
      ctrAt: fallbackCtrAt,
      source: "fallback",
      sampleSize: 0
    };
  }

  // Bucket totals: impressions and clicks per integer position.
  const buckets = new Map<Bucket, { impressions: number; clicks: number }>();
  let totalImpressions = 0;
  for (const r of rows) {
    const bucket = Math.min(MAX_POSITION, Math.max(1, Math.round(r.position)));
    const entry = buckets.get(bucket) ?? { impressions: 0, clicks: 0 };
    entry.impressions += r.impressions;
    entry.clicks += r.clicks;
    buckets.set(bucket, entry);
    totalImpressions += r.impressions;
  }

  // Raw CTRs per bucket. Buckets with too little data fall back to the
  // prior — this is what stops a single impression at position 73 from
  // claiming a 100% CTR.
  const raw = new Map<Bucket, number>();
  for (let b = 1; b <= MAX_POSITION; b++) {
    const e = buckets.get(b);
    if (!e || e.impressions < minImpressionsForBucket(b)) {
      raw.set(b, fallbackCtrAt(b));
    } else {
      raw.set(b, e.clicks / e.impressions);
    }
  }

  // Enforce monotonicity: CTR at position N+1 cannot exceed CTR at N. Real
  // data is noisy and you'll occasionally see pos 4 outperforming pos 3;
  // pulling those down to the running minimum keeps the curve sensible
  // and stops artefacts from dominating the visibility index.
  let runningMin = raw.get(1) ?? fallbackCtrAt(1);
  const monotone = new Map<Bucket, number>();
  for (let b = 1; b <= MAX_POSITION; b++) {
    const v = Math.min(raw.get(b) ?? FALLBACK_TAIL, runningMin);
    monotone.set(b, v);
    runningMin = v;
  }

  return {
    ctrAt(position: number) {
      const bucket = Math.min(
        MAX_POSITION,
        Math.max(1, Math.round(position))
      );
      return monotone.get(bucket) ?? FALLBACK_TAIL;
    },
    source: "site",
    sampleSize: totalImpressions
  };
}

// Convenience for callers that want to inspect the full curve (e.g., UI
// debug views or sanity checks). Returns array of length MAX_POSITION.
export async function getCtrCurveArray(
  userId: string,
  siteUrl: string,
  options: { lookbackDays?: number } = {}
): Promise<{ position: number; ctr: number }[]> {
  const curve = await getCtrCurve(userId, siteUrl, options);
  const out: { position: number; ctr: number }[] = [];
  for (let p = 1; p <= MAX_POSITION; p++) {
    out.push({ position: p, ctr: curve.ctrAt(p) });
  }
  return out;
}
