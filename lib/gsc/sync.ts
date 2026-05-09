import { prisma } from "@/lib/db";
import { searchAnalyticsQuery } from "@/lib/gsc";
import { resolveUserSiteAccess } from "@/lib/gsc-access";

// Days to backfill on first activation. GSC retains ~16 months but a year
// is usually enough and keeps initial sync time/storage reasonable.
const INITIAL_BACKFILL_DAYS = 365;

// GSC has a 2-3 day reporting lag; we never request "today" or "yesterday".
const REPORTING_LAG_DAYS = 2;

const PAGE_SIZE = 25_000;
// Hard cap per single day to keep memory bounded for huge sites. At 25k
// rows per request and 4 pages, we'd ingest 100k query/page combos per day,
// which is an order of magnitude above what real properties report.
const MAX_PAGES_PER_DAY = 4;

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Most recent date GSC will report on, given the lag.
export function maxAvailableDate(): string {
  return shiftDate(isoToday(), -REPORTING_LAG_DAYS);
}

export interface SyncOptions {
  userId: string;
  siteUrl: string;
  preferredAccountId?: string | null;
  // Override the default backfill window when explicitly triggered.
  startDate?: string;
  endDate?: string;
  // When true, re-pull dates we already have. Default false (idempotent).
  force?: boolean;
}

export interface SyncResult {
  daysSynced: number;
  rowsWritten: number;
  startDate: string | null;
  endDate: string | null;
  skipped: boolean;
  reason?: string;
}

// Fetches one day from GSC with pagination. Returns the raw rows.
async function fetchDay(
  accessToken: string,
  siteUrl: string,
  date: string
): Promise<Array<{ keys: string[]; impressions: number; clicks: number; position: number }>> {
  const out: Array<{ keys: string[]; impressions: number; clicks: number; position: number }> = [];
  for (let page = 0; page < MAX_PAGES_PER_DAY; page++) {
    const rows = await searchAnalyticsQuery(accessToken, siteUrl, {
      startDate: date,
      endDate: date,
      dimensions: ["query", "page"],
      rowLimit: PAGE_SIZE,
      startRow: page * PAGE_SIZE
    });
    out.push(
      ...rows.map((r) => ({
        keys: r.keys,
        impressions: r.impressions,
        clicks: r.clicks,
        position: r.position
      }))
    );
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

// Persist a batch of rows for a given (user, site, date). Uses upsert on the
// composite unique key so re-runs replace stale numbers without duplicating.
async function writeDay(
  userId: string,
  siteUrl: string,
  date: string,
  rows: Array<{ keys: string[]; impressions: number; clicks: number; position: number }>
): Promise<number> {
  if (!rows.length) return 0;
  // SQLite + Prisma doesn't support efficient bulk upsert; we batch deletes
  // for the day then insert, which is faster than N upserts and stays
  // idempotent because we always delete the same (user, site, date) slice.
  await prisma.gscDailyMetric.deleteMany({
    where: { userId, siteUrl, date }
  });
  const data = rows
    .filter((r) => r.keys[0] && r.keys[1])
    .map((r) => ({
      userId,
      siteUrl,
      date,
      query: r.keys[0],
      page: r.keys[1],
      impressions: r.impressions,
      clicks: r.clicks,
      position: r.position
    }));
  if (!data.length) return 0;
  // createMany with chunking to stay under SQLite's parameter limit.
  const CHUNK = 1_000;
  let written = 0;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    const res = await prisma.gscDailyMetric.createMany({ data: slice });
    written += res.count;
  }
  return written;
}

// Determine the date range we still need to fetch given current sync state.
async function planSync(
  userId: string,
  siteUrl: string,
  override?: { startDate?: string; endDate?: string; force?: boolean }
): Promise<{ start: string; end: string; reason: string } | null> {
  const status = await prisma.gscSyncStatus.findUnique({
    where: { userId_siteUrl: { userId, siteUrl } }
  });

  const targetEnd = override?.endDate ?? maxAvailableDate();

  if (override?.startDate || override?.force) {
    const start = override.startDate ?? shiftDate(targetEnd, -INITIAL_BACKFILL_DAYS);
    return { start, end: targetEnd, reason: "explicit" };
  }

  if (!status || !status.lastSyncedDate) {
    // First-ever sync — backfill the initial window.
    return {
      start: shiftDate(targetEnd, -INITIAL_BACKFILL_DAYS),
      end: targetEnd,
      reason: "initial"
    };
  }

  if (status.lastSyncedDate >= targetEnd) {
    return null; // already up to date
  }

  return {
    start: shiftDate(status.lastSyncedDate, 1),
    end: targetEnd,
    reason: "incremental"
  };
}

// Sync GSC daily data for a single (user, site). Idempotent and incremental
// by default. Respects GSC's reporting lag and won't re-pull dates that are
// already complete unless `force` is set.
export async function syncSiteDaily(options: SyncOptions): Promise<SyncResult> {
  const { userId, siteUrl, preferredAccountId } = options;

  const plan = await planSync(userId, siteUrl, {
    startDate: options.startDate,
    endDate: options.endDate,
    force: options.force
  });
  if (!plan) {
    return {
      daysSynced: 0,
      rowsWritten: 0,
      startDate: null,
      endDate: null,
      skipped: true,
      reason: "up_to_date"
    };
  }

  const access = await resolveUserSiteAccess(userId, siteUrl, preferredAccountId ?? undefined);
  let rowsWritten = 0;
  let daysSynced = 0;
  let cursor = plan.start;

  try {
    while (cursor <= plan.end) {
      const rows = await fetchDay(access.accessToken, siteUrl, cursor);
      const written = await writeDay(userId, siteUrl, cursor, rows);
      rowsWritten += written;
      daysSynced++;

      // Update lastSyncedDate after every day so a crash mid-backfill doesn't
      // restart from scratch on the next attempt.
      await prisma.gscSyncStatus.upsert({
        where: { userId_siteUrl: { userId, siteUrl } },
        create: {
          userId,
          siteUrl,
          lastSyncedDate: cursor,
          lastSyncRunAt: new Date(),
          earliestSynced: plan.reason === "initial" ? plan.start : undefined
        },
        update: {
          lastSyncedDate: cursor,
          lastSyncRunAt: new Date(),
          lastError: null,
          earliestSynced:
            plan.reason === "initial"
              ? plan.start
              : undefined
        }
      });

      cursor = shiftDate(cursor, 1);
    }
  } catch (err: any) {
    await prisma.gscSyncStatus.upsert({
      where: { userId_siteUrl: { userId, siteUrl } },
      create: {
        userId,
        siteUrl,
        lastError: err?.message ?? "unknown error",
        lastSyncRunAt: new Date()
      },
      update: {
        lastError: err?.message ?? "unknown error",
        lastSyncRunAt: new Date()
      }
    });
    throw err;
  }

  return {
    daysSynced,
    rowsWritten,
    startDate: plan.start,
    endDate: plan.end,
    skipped: false,
    reason: plan.reason
  };
}

// Quick check: is the persisted data fresh enough that we can serve from DB?
// Used by the smart-auto-sync hook to decide whether to await a sync or
// kick one off in the background.
export async function isSyncFresh(userId: string, siteUrl: string): Promise<boolean> {
  const status = await prisma.gscSyncStatus.findUnique({
    where: { userId_siteUrl: { userId, siteUrl } }
  });
  return Boolean(status?.lastSyncedDate && status.lastSyncedDate >= maxAvailableDate());
}
