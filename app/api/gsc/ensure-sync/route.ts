import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSyncFresh, maxAvailableDate, syncSiteDaily } from "@/lib/gsc/sync";

const bodySchema = z.object({
  siteUrl: z.string().min(1),
  // When true, wait until the sync is complete before returning. Used for
  // first-time backfills where we can't render anything without data.
  await: z.boolean().optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const preferredAccountId = cookies().get("accountId")?.value ?? null;

  const status = await prisma.gscSyncStatus.findUnique({
    where: { userId_siteUrl: { userId, siteUrl: body.siteUrl } }
  });
  const fresh = await isSyncFresh(userId, body.siteUrl);
  const targetEnd = maxAvailableDate();

  // Already up to date — fast path, no work needed.
  if (fresh) {
    return NextResponse.json({
      status: "fresh",
      lastSyncedDate: status?.lastSyncedDate ?? null,
      targetEnd
    });
  }

  // First-time backfills can take a minute. Caller decides whether to
  // block (await: true, used on the first view load) or fire-and-forget
  // (background top-up on subsequent loads).
  if (body.await) {
    try {
      const result = await syncSiteDaily({
        userId,
        siteUrl: body.siteUrl,
        preferredAccountId
      });
      return NextResponse.json({ status: "synced", ...result });
    } catch (err: any) {
      const message = err?.message ?? "Sync failed";
      const isAuth = /401|invalid_grant|missing_refresh_token/.test(message);
      return NextResponse.json(
        { status: "error", error: message },
        { status: isAuth ? 401 : 500 }
      );
    }
  }

  // Fire-and-forget: kick off the sync but return immediately. The view
  // can read whatever data is already in the DB and refresh later.
  syncSiteDaily({
    userId,
    siteUrl: body.siteUrl,
    preferredAccountId
  }).catch((err) => {
    console.error("[GSC][ensure-sync] background sync failed", {
      userId,
      siteUrl: body.siteUrl,
      message: err?.message
    });
  });

  return NextResponse.json({
    status: "syncing",
    lastSyncedDate: status?.lastSyncedDate ?? null,
    targetEnd
  });
}
