import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runPrecluster } from "@/lib/keyword-workspace/precluster";

const schema = z.object({ rerun: z.boolean().optional() });

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const project = await prisma.keywordProject.findFirst({ where: { id: ctx.params.id, userId } });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", { projectId: ctx.params.id }, 404);

  try {
    const json = await req.json();
    schema.parse(json ?? {});
  } catch {
    // ignore optional
  }

  const keywords = await prisma.keyword.findMany({
    where: { projectId: project.id },
    include: { demand: true }
  });
  if (!keywords.length) return err("NO_KEYWORDS", "No keywords to cluster", {}, 400);

  const pre = runPrecluster(
    keywords.map((k) => ({
      id: k.id,
      kwRaw: k.kwRaw,
      demandMonthly: k.demand?.demandMonthly ?? 0
    }))
  );

  await prisma.$transaction([
    prisma.preclusterMember.deleteMany({ where: { precluster: { projectId: project.id } } }),
    prisma.precluster.deleteMany({ where: { projectId: project.id } }),
    prisma.clusterMember.deleteMany({ where: { cluster: { projectId: project.id } } }),
    prisma.cluster.deleteMany({ where: { projectId: project.id } })
  ]);

  for (const cluster of pre.clusters) {
    const preclusterId = nanoid();
    await prisma.precluster.create({
      data: {
        id: preclusterId,
        projectId: project.id,
        algoVersion: pre.algoVersion,
        label: cluster.label,
        totalDemand: cluster.totalDemand,
        cohesion: cluster.cohesion,
        members: {
          createMany: {
            data: cluster.keywordIds.map((kid) => ({
              keywordId: kid,
              score: 1
            }))
          }
        }
      }
    });
    await prisma.cluster.create({
      data: {
        id: preclusterId,
        projectId: project.id,
        name: cluster.label,
        members: {
          createMany: {
            data: cluster.keywordIds.map((kid) => ({ keywordId: kid }))
          }
        }
      }
    });
  }

  return NextResponse.json({
    status: "DONE",
    algoVersion: pre.algoVersion,
    clusterCount: pre.clusters.length,
    keywordCount: keywords.length
  });
}
