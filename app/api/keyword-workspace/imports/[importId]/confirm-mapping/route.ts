import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  keywordColumn: z.string(),
  volumeColumn: z.string().optional(),
  impressionsColumn: z.string().optional(),
  clicksColumn: z.string().optional(),
  positionColumn: z.string().optional(),
  urlColumn: z.string().optional()
});

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function POST(_req: Request, ctx: { params: { importId: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  let body: z.infer<typeof schema>;
  try {
    const json = await _req.json();
    body = schema.parse(json);
  } catch {
    return err("INVALID_BODY", "Invalid body");
  }

  const source = await prisma.keywordSource.findUnique({ where: { id: ctx.params.importId } });
  if (!source) return err("SOURCE_NOT_FOUND", "Source not found", { importId: ctx.params.importId }, 404);

  const project = await prisma.keywordProject.findFirst({ where: { id: source.projectId, userId } });
  if (!project) return err("FORBIDDEN", "Not allowed", {}, 403);

  const meta = source.metaJson ? JSON.parse(source.metaJson) : {};
  meta.mapping = {
    keywordColumn: body.keywordColumn,
    volumeColumn: body.volumeColumn,
    impressionsColumn: body.impressionsColumn,
    clicksColumn: body.clicksColumn,
    positionColumn: body.positionColumn,
    urlColumn: body.urlColumn,
    mappingVersion: 1
  };

  await prisma.keywordSource.update({
    where: { id: source.id },
    data: { metaJson: JSON.stringify(meta) }
  });

  return NextResponse.json({ importId: source.id, status: "MAPPED" });
}
