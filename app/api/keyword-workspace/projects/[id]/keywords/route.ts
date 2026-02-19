import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const querySchema = z.object({
  sourceId: z.string().optional(),
  clusterId: z.string().optional(),
  q: z.string().optional(),
  view: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional()
});

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const project = await prisma.keywordProject.findFirst({ where: { id: ctx.params.id, userId } });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", { projectId: ctx.params.id }, 404);

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) return err("INVALID_QUERY", "Invalid query params");
  const { sourceId, clusterId, q, page = 1, pageSize = 100, view } = parsed.data;
  const take = Math.min(pageSize || 100, 500);
  const skip = Math.max(page - 1, 0) * take;

  const where: any = { projectId: project.id };
  if (q) where.kwRaw = { contains: q, mode: "insensitive" };
  if (clusterId) where.clusterMembers = { some: { clusterId } };
  if (view === "unassigned") where.clusterMembers = { none: {} };

  const [items, total] = await Promise.all([
    prisma.keyword.findMany({
      where,
      skip,
      take,
      include: {
        demand: true,
        clusterMembers: true,
        sourceMetrics: sourceId ? { where: { sourceId } } : true
      },
      orderBy: [{ kwRaw: "asc" }]
    }),
    prisma.keyword.count({ where })
  ]);

  const dto = items.map((k) => ({
    id: k.id,
    projectId: k.projectId,
    kwRaw: k.kwRaw,
    kwNorm: k.kwNorm,
    kwSig: k.kwSig,
    demandMonthly: k.demand?.demandMonthly ?? 0,
    demandSource: k.demand?.demandSource ?? "none",
    clusterIds: k.clusterMembers?.map((c) => c.clusterId) ?? []
  }));

  return NextResponse.json({ items: dto, total });
}
