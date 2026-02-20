import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { runSerpClustering } from "@/lib/keyword-workspace/serp-cluster";

const bodySchema = z.object({
  forceRefetch: z.boolean().optional(),
  minDemand: z.coerce.number().optional(),
  overlapThreshold: z.coerce.number().optional()
});

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("INVALID_BODY", "Invalid body");

  try {
    const result = await runSerpClustering({
      projectId: ctx.params.id,
      userId,
      ...parsed.data
    });
    return NextResponse.json({ status: "ok", runId: result.runId, counts: result.counts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    const status = msg === "PROJECT_NOT_FOUND" ? 404 : msg === "NO_KEYWORDS" ? 400 : 500;
    return err(msg, msg, {}, status);
  }
}
