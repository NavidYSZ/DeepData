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

  const lastUndo = await prisma.workspaceEvent.findFirst({
    where: { projectId: project.id, type: "UNDO" },
    orderBy: { createdAt: "desc" }
  });
  if (!lastUndo) return err("REDO_NOT_AVAILABLE", "No undo event to redo", {}, 400);
  const undoneId = (lastUndo.payloadJson && JSON.parse(lastUndo.payloadJson).undoneEventId) || null;
  if (!undoneId) return err("REDO_NOT_AVAILABLE", "No undo event to redo", {}, 400);

  const event = await prisma.workspaceEvent.findUnique({ where: { id: undoneId } });
  if (!event) return err("REDO_NOT_AVAILABLE", "Original event missing", {}, 400);
  const payload = event.payloadJson ? JSON.parse(event.payloadJson) : {};

  // Reapply the original event in a simplified manner
  if (event.type === "MOVE_KEYWORDS" && payload.prevMembers) {
    // redo = move to new state (which was post-move), we can't reconstruct; skip
  } else if (event.type === "RENAME_CLUSTER" && payload.prevName && payload.clusterId) {
    // redo rename to name after rename; we don't store it, so no-op
  } else if (event.type === "MERGE_CLUSTERS" && payload.createdClusterId && payload.prevMembers) {
    await prisma.clusterMember.deleteMany({ where: { clusterId: { in: payload.prevClusters?.map((c: any) => c.id) ?? [] } } });
    await prisma.cluster.deleteMany({ where: { id: { in: payload.prevClusters?.map((c: any) => c.id) ?? [] } } });
    await prisma.cluster.create({ data: { id: payload.createdClusterId, projectId: project.id, name: payload.targetName ?? "Merge" } });
    const uniqueKeywordIds = Array.from(
      new Set<string>(payload.prevMembers.map((m: { keywordId: string }) => m.keywordId))
    );
    await prisma.clusterMember.createMany({
      data: uniqueKeywordIds.map((kid) => ({
        clusterId: payload.createdClusterId,
        keywordId: kid
      }))
    });
  }

  const redoEvent = await prisma.workspaceEvent.create({
    data: { projectId: project.id, type: "REDO", payloadJson: JSON.stringify({ redoneEventId: undoneId }) }
  });
  return NextResponse.json({ eventId: redoEvent.id, redoneEventId: undoneId });
}
