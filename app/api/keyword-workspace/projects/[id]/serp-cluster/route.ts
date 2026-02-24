import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getLatestSerpClusters, getSerpClusters } from "@/lib/keyword-workspace/serp-cluster";

const querySchema = z.object({
  minDemand: z.coerce.number().optional(),
  runId: z.string().optional()
});

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) return err("INVALID_QUERY", "Invalid query params");

  const data = parsed.data.runId
    ? await getSerpClusters(parsed.data.runId, parsed.data.minDemand, ctx.params.id)
    : await getLatestSerpClusters(ctx.params.id, parsed.data.minDemand ?? 5);
  if (!data) return NextResponse.json({ runId: null, parents: [], generatedAt: null });
  return NextResponse.json(data);
}
