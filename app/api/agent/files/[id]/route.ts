import { NextResponse } from "next/server";
import fs from "fs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const file = await prisma.chatFile.findFirst({
    where: { id: params.id, userId }
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (new Date(file.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }

  if (!fs.existsSync(file.path)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stat = fs.statSync(file.path);
  const stream = fs.createReadStream(file.path);

  return new Response(stream as any, {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      "Content-Length": stat.size.toString(),
      "Content-Disposition": `attachment; filename=\"${file.filename}\"`
    }
  });
}
