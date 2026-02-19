import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const moveSchema = z.object({
  type: z.literal("MOVE_KEYWORDS"),
  keywordIds: z.array(z.string()).min(1),
  fromClusterId: z.string().nullable().optional(),
  toClusterId: z.string()
});

const renameSchema = z.object({
  type: z.literal("RENAME_CLUSTER"),
  clusterId: z.string(),
  nextName: z.string().min(1)
});

const mergeSchema = z.object({
  type: z.literal("MERGE_CLUSTERS"),
  clusterIds: z.array(z.string()).min(2),
  targetName: z.string().min(1)
});

const splitSchema = z.object({
  type: z.literal("SPLIT_CLUSTER"),
  clusterId: z.string(),
  groups: z.array(z.object({ name: z.string().min(1), keywordIds: z.array(z.string()).min(1) })).min(1)
});

const deleteSchema = z.object({
  type: z.literal("DELETE_KEYWORDS"),
  keywordIds: z.array(z.string()).min(1)
});

const commandSchema = z.discriminatedUnion("type", [
  moveSchema,
  renameSchema,
  mergeSchema,
  splitSchema,
  deleteSchema
]);

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const project = await prisma.keywordProject.findFirst({ where: { id: ctx.params.id, userId } });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", { projectId: ctx.params.id }, 404);

  let command: z.infer<typeof commandSchema>;
  try {
    const json = await req.json();
    command = commandSchema.parse(json);
  } catch {
    return err("INVALID_COMMAND", "Invalid command");
  }

  let eventPayload: any = {};

  if (command.type === "MOVE_KEYWORDS") {
    const targetCluster = await prisma.cluster.findFirst({ where: { id: command.toClusterId, projectId: project.id } });
    if (!targetCluster) return err("CLUSTER_NOT_FOUND", "Target cluster not found", { clusterId: command.toClusterId }, 404);
    const prevMembers = await prisma.clusterMember.findMany({
      where: { keywordId: { in: command.keywordIds } }
    });
    eventPayload.prevMembers = prevMembers;
    await prisma.clusterMember.deleteMany({ where: { keywordId: { in: command.keywordIds } } });
    await prisma.clusterMember.createMany({
      data: command.keywordIds.map((kid) => ({ clusterId: command.toClusterId, keywordId: kid })),
      skipDuplicates: true
    });
  } else if (command.type === "RENAME_CLUSTER") {
    const cluster = await prisma.cluster.findFirst({ where: { id: command.clusterId, projectId: project.id } });
    if (!cluster) return err("CLUSTER_NOT_FOUND", "Cluster not found", { clusterId: command.clusterId }, 404);
    eventPayload.prevName = cluster.name;
    eventPayload.clusterId = cluster.id;
    await prisma.cluster.update({ where: { id: cluster.id }, data: { name: command.nextName } });
  } else if (command.type === "MERGE_CLUSTERS") {
    const clusters = await prisma.cluster.findMany({ where: { id: { in: command.clusterIds }, projectId: project.id } });
    if (clusters.length !== command.clusterIds.length) return err("CLUSTER_NOT_FOUND", "Cluster missing");
    const targetId = nanoid();
    const members = await prisma.clusterMember.findMany({ where: { clusterId: { in: command.clusterIds } } });
    eventPayload.prevClusters = clusters;
    eventPayload.prevMembers = members;
    eventPayload.targetName = command.targetName;
    await prisma.cluster.create({
      data: { id: targetId, projectId: project.id, name: command.targetName }
    });
    await prisma.clusterMember.createMany({
      data: Array.from(new Set(members.map((m) => m.keywordId))).map((kid) => ({
        clusterId: targetId,
        keywordId: kid
      })),
      skipDuplicates: true
    });
    await prisma.clusterMember.deleteMany({ where: { clusterId: { in: command.clusterIds } } });
    await prisma.cluster.deleteMany({ where: { id: { in: command.clusterIds } } });
    eventPayload.createdClusterId = targetId;
  } else if (command.type === "SPLIT_CLUSTER") {
    const cluster = await prisma.cluster.findFirst({ where: { id: command.clusterId, projectId: project.id } });
    if (!cluster) return err("CLUSTER_NOT_FOUND", "Cluster not found", { clusterId: command.clusterId }, 404);
    const prevMembers = await prisma.clusterMember.findMany({ where: { clusterId: command.clusterId } });
    eventPayload.prevMembers = prevMembers;
    eventPayload.prevCluster = cluster;
    await prisma.clusterMember.deleteMany({ where: { clusterId: cluster.id } });
    const created: { id: string; name: string; keywordIds: string[] }[] = [];
    for (const group of command.groups) {
      const newId = nanoid();
      await prisma.cluster.create({ data: { id: newId, projectId: project.id, name: group.name } });
      await prisma.clusterMember.createMany({
        data: group.keywordIds.map((kid) => ({ clusterId: newId, keywordId: kid })),
        skipDuplicates: true
      });
      created.push({ id: newId, name: group.name, keywordIds: group.keywordIds });
    }
    eventPayload.createdClusters = created;
    await prisma.cluster.delete({ where: { id: cluster.id } });
  } else if (command.type === "DELETE_KEYWORDS") {
    const keywords = await prisma.keyword.findMany({ where: { id: { in: command.keywordIds }, projectId: project.id } });
    eventPayload.deletedKeywords = keywords;
    await prisma.keyword.deleteMany({ where: { id: { in: command.keywordIds }, projectId: project.id } });
  }

  const event = await prisma.workspaceEvent.create({
    data: {
      projectId: project.id,
      type: command.type,
      payloadJson: JSON.stringify(eventPayload)
    }
  });

  return NextResponse.json({ eventId: event.id, stateVersion: event.createdAt.getTime() });
}
