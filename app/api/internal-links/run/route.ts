import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { startCrawlRun } from "@/lib/internal-links/service";

// A single crawl can take ~minutes on a large site. Next.js's default route
// timeout is short on most platforms, so we widen explicitly.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({
  siteUrl: z.string().min(1),
  seedUrl: z.string().url(),
  maxUrls: z.number().int().positive().max(2000).optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const summary = await startCrawlRun({
      userId,
      siteUrl: body.siteUrl,
      seedUrl: body.seedUrl,
      maxUrls: body.maxUrls
    });
    return NextResponse.json({ run: summary }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Crawl failed";
    if (process.env.NODE_ENV !== "production") {
      console.error("[internal-links/run] error", { userId, message });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
