import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  projectId: z.string(),
  siteUrl: z.string(),
  days: z.number().int().min(1).max(365).default(28)
});

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  let body: z.infer<typeof schema>;
  try {
    const json = await req.json();
    body = schema.parse(json);
  } catch {
    return err("INVALID_BODY", "Invalid body");
  }

  const project = await prisma.keywordProject.findFirst({ where: { id: body.projectId, userId } });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", { projectId: body.projectId }, 404);

  const sourceId = nanoid();
  const source = await prisma.keywordSource.create({
    data: {
      id: sourceId,
      projectId: body.projectId,
      type: "gsc",
      name: `GSC: ${body.siteUrl}`,
      metaJson: JSON.stringify({ siteUrl: body.siteUrl, dateRangeDays: body.days, mappingVersion: 1 })
    }
  });

  return NextResponse.json({ importId: source.id, sourceId: source.id, rowCount: 0 });
}
