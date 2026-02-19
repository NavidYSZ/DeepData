import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const projectSchema = z.object({
  name: z.string().min(1),
  gscSiteUrl: z.string().optional(),
  lang: z.string().default("de"),
  country: z.string().default("DE"),
  gscDefaultDays: z.number().int().min(1).max(365).default(28)
});

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  const traceId = nanoid(10);
  return NextResponse.json({ code, message, details, traceId }, { status });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);
  const projects = await prisma.keywordProject.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      lang: true,
      country: true,
      gscSiteUrl: true,
      gscDefaultDays: true,
      createdAt: true,
      updatedAt: true
    }
  });
  return NextResponse.json({ items: projects });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);
  let body: z.infer<typeof projectSchema>;
  try {
    const json = await req.json();
    body = projectSchema.parse(json);
  } catch {
    return err("INVALID_BODY", "Invalid body", {}, 400);
  }
  const project = await prisma.keywordProject.create({
    data: {
      userId,
      name: body.name,
      gscSiteUrl: body.gscSiteUrl,
      lang: body.lang ?? "de",
      country: body.country ?? "DE",
      gscDefaultDays: body.gscDefaultDays ?? 28
    }
  });
  return NextResponse.json(project, { status: 201 });
}
