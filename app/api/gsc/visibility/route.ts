import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  visibilityByQueryPage,
  visibilityMovers,
  visibilitySeries
} from "@/lib/gsc/visibility";
import { getCtrCurveArray } from "@/lib/gsc/ctr-curve";

const baseSchema = z.object({
  siteUrl: z.string().min(1)
});

const seriesSchema = baseSchema.extend({
  mode: z.literal("series"),
  startDate: z.string().min(10),
  endDate: z.string().min(10)
});

const byQueryPageSchema = baseSchema.extend({
  mode: z.literal("byQueryPage"),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  limit: z.number().int().positive().max(50_000).optional()
});

const moversSchema = baseSchema.extend({
  mode: z.literal("movers"),
  p1Start: z.string().min(10),
  p1End: z.string().min(10),
  p2Start: z.string().min(10),
  p2End: z.string().min(10),
  minImpressions: z.number().int().nonnegative().optional()
});

const curveSchema = baseSchema.extend({
  mode: z.literal("curve")
});

const bodySchema = z.discriminatedUnion("mode", [
  seriesSchema,
  byQueryPageSchema,
  moversSchema,
  curveSchema
]);

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

  try {
    if (body.mode === "series") {
      const rows = await visibilitySeries(
        userId,
        body.siteUrl,
        body.startDate,
        body.endDate
      );
      return NextResponse.json({ rows });
    }
    if (body.mode === "byQueryPage") {
      const rows = await visibilityByQueryPage(
        userId,
        body.siteUrl,
        body.startDate,
        body.endDate
      );
      const sorted = rows.sort((a, b) => b.visibility - a.visibility);
      return NextResponse.json({
        rows: body.limit ? sorted.slice(0, body.limit) : sorted
      });
    }
    if (body.mode === "movers") {
      const rows = await visibilityMovers(
        userId,
        body.siteUrl,
        body.p1Start,
        body.p1End,
        body.p2Start,
        body.p2End,
        { minImpressions: body.minImpressions }
      );
      return NextResponse.json({ rows });
    }
    if (body.mode === "curve") {
      const curve = await getCtrCurveArray(userId, body.siteUrl);
      return NextResponse.json({ curve });
    }
    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
