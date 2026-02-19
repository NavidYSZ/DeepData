import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { ensureWorkspaceProject, rebuildPreclusters } from "@/lib/keyword-workspace/service";

const bodySchema = z.object({
  siteUrl: z.string().min(1)
});

function err(code: string, message: string, details: Record<string, unknown> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return err("INVALID_BODY", "Invalid body");
  }

  const project = await ensureWorkspaceProject(userId, body.siteUrl);
  const result = await rebuildPreclusters(project.id);
  return NextResponse.json({ status: "DONE", projectId: project.id, ...result });
}
