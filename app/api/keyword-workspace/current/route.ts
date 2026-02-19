import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { ensureWorkspaceProject } from "@/lib/keyword-workspace/service";

const querySchema = z.object({
  siteUrl: z.string().min(1)
});

function err(code: string, message: string, details: Record<string, unknown> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) return err("INVALID_QUERY", "siteUrl is required");

  const project = await ensureWorkspaceProject(userId, parsed.data.siteUrl);
  return NextResponse.json({
    projectId: project.id,
    siteUrl: project.gscSiteUrl,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  });
}
