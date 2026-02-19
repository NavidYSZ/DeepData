import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const project = await prisma.keywordProject.findFirst({ where: { id: ctx.params.id, userId } });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", { projectId: ctx.params.id }, 404);

  const lastEvent = await prisma.workspaceEvent.findFirst({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" }
  });
  if (!lastEvent) return err("UNDO_NOT_AVAILABLE", "No event to undo", {}, 400);

  const payload = lastEvent.payloadJson ? JSON.parse(lastEvent.payloadJson) : {};

  if (lastEvent.type === "MOVE_KEYWORDS" && payload.prevMembers) {
    await prisma.clusterMember.deleteMany({ where: { keywordId: { in: payload.prevMembers.map((m: any) => m.keywordId) } } });
    await prisma.clusterMember.createMany({ data: payload.prevMembers, skipDuplicates: true });
  } else if (lastEvent.type === "RENAME_CLUSTER" && payload.prevName && payload.clusterId) {
    await prisma.cluster.update({ where: { id: payload.clusterId }, data: { name: payload.prevName } });
  } else if (lastEvent.type === "MERGE_CLUSTERS" && payload.prevClusters && payload.prevMembers) {
    if (payload.createdClusterId) {
      await prisma.clusterMember.deleteMany({ where: { clusterId: payload.createdClusterId } });
      await prisma.cluster.delete({ where: { id: payload.createdClusterId } });
    }
    await prisma.cluster.createMany({
      data: payload.prevClusters.map((c: any) => ({
        id: c.id,
        projectId: c.projectId,
        name: c.name,
        description: c.description ?? null,
        isLocked: c.isLocked ?? false
      })),
      skipDuplicates: true
    });
    await prisma.clusterMember.createMany({ data: payload.prevMembers, skipDuplicates: true });
  } else if (lastEvent.type === "SPLIT_CLUSTER" && payload.prevCluster && payload.prevMembers) {
    // delete created clusters
    if (payload.createdClusters?.length) {
      await prisma.clusterMember.deleteMany({ where: { clusterId: { in: payload.createdClusters.map((c: any) => c.id) } } });
      await prisma.cluster.deleteMany({ where: { id: { in: payload.createdClusters.map((c: any) => c.id) } } });
    }
    await prisma.cluster.create({
      data: {
        id: payload.prevCluster.id,
        projectId: payload.prevCluster.projectId,
        name: payload.prevCluster.name,
        description: payload.prevCluster.description ?? null,
        isLocked: payload.prevCluster.isLocked ?? false
      }
    });
    await prisma.clusterMember.createMany({ data: payload.prevMembers, skipDuplicates: true });
  } else if (lastEvent.type === "DELETE_KEYWORDS" && payload.deletedKeywords) {
    await prisma.keyword.createMany({ data: payload.deletedKeywords, skipDuplicates: true });
  }

  const undoEvent = await prisma.workspaceEvent.create({
    data: {
      projectId: project.id,
      type: "UNDO",
      payloadJson: JSON.stringify({ undoneEventId: lastEvent.id })
    }
  });

  return NextResponse.json({ eventId: undoEvent.id, undoneEventId: lastEvent.id });
}
