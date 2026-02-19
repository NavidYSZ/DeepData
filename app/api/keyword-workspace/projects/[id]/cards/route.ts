import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const querySchema = z.object({
  search: z.string().optional(),
  minDemand: z.coerce.number().optional(),
  focusOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().optional()
});

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return err("INVALID_QUERY", "Invalid query params");
  const { search, minDemand } = parsed.data;

  const project = await prisma.keywordProject.findFirst({ where: { id: ctx.params.id, userId } });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", { projectId: ctx.params.id }, 404);

  const items = await prisma.precluster.findMany({
    where: {
      projectId: project.id,
      label: search ? { contains: search, mode: "insensitive" } : undefined,
      totalDemand: minDemand ? { gte: minDemand } : undefined
    },
    orderBy: [
      { totalDemand: "desc" },
      { label: "asc" },
      { id: "asc" }
    ],
    include: {
      _count: { select: { members: true } },
      members: {
        take: 5,
        include: { keyword: { include: { demand: true } } },
        orderBy: { keyword: { demand: { demandMonthly: "desc" } } }
      }
    }
  });

  const dto = items.map((c) => ({
    id: c.id,
    projectId: c.projectId,
    algoVersion: c.algoVersion,
    label: c.label,
    totalDemand: c.totalDemand,
    cohesion: c.cohesion,
    keywordCount: c._count.members,
    topKeywords: c.members.map((m) => ({
      keywordId: m.keywordId,
      kwRaw: m.keyword.kwRaw,
      demandMonthly: m.keyword.demand?.demandMonthly ?? 0
    })),
    focusSelected: false
  }));

  return NextResponse.json({ items: dto, total: dto.length });
}
