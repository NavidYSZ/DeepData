import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runSerpClustering } from "@/lib/keyword-workspace/serp-cluster";
import { getAccessTokenForUser } from "@/lib/keyword-workspace/service";

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

  const projectId = ctx.params.id;

  const project = await prisma.keywordProject.findFirst({
    where: { id: projectId, userId }
  });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", {}, 404);

  // Get access token while we still have request context (cookies)
  let accessToken: string | undefined;
  try {
    accessToken = await getAccessTokenForUser(userId);
  } catch {
    /* GSC not connected — clustering will still work if keywords exist */
  }

  // Create run record immediately
  const runId = nanoid();
  await prisma.serpClusterRun.create({
    data: {
      id: runId,
      projectId,
      status: "pending",
      urlOverlapThreshold: parsed.data.overlapThreshold ?? 0.3,
      minDemand: parsed.data.minDemand ?? 5
    }
  });

  // Fire and forget — work runs in background, UI polls status
  runSerpClustering({
    runId,
    projectId,
    userId,
    accessToken,
    gscSiteUrl: project.gscSiteUrl ?? undefined,
    ...parsed.data
  }).catch((e) => {
    console.error("SERP clustering failed:", e);
  });

  return NextResponse.json({ status: "ok", runId });
}
