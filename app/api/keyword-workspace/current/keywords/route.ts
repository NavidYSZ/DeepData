import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureWorkspaceProject,
  ensureWorkspaceSource,
  ingestSourceMetrics,
  recomputeDemandForProject
} from "@/lib/keyword-workspace/service";

const bodySchema = z.object({
  siteUrl: z.string().min(1),
  keyword: z.string().min(1),
  demandMonthly: z.number().min(0).optional(),
  clusterId: z.string().optional()
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
  const manualSource = await ensureWorkspaceSource(project.id, "upload", "Manual Input");

  await ingestSourceMetrics({
    projectId: project.id,
    sourceId: manualSource.id,
    rows: [{ kwRaw: body.keyword, volume: body.demandMonthly ?? 0 }]
  });
  await recomputeDemandForProject(project.id);

  const keyword = await prisma.keyword.findFirst({
    where: { projectId: project.id, kwRaw: body.keyword },
    orderBy: { createdAt: "desc" }
  });

  if (keyword && body.clusterId) {
    const cluster = await prisma.cluster.findFirst({ where: { id: body.clusterId, projectId: project.id } });
    if (cluster) {
      await prisma.clusterMember.upsert({
        where: { clusterId_keywordId: { clusterId: cluster.id, keywordId: keyword.id } },
        create: { clusterId: cluster.id, keywordId: keyword.id },
        update: {}
      });
    }
  }

  return NextResponse.json({ status: "DONE", projectId: project.id, keywordId: keyword?.id ?? null });
}
