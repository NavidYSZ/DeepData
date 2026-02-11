import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const chatSession = await prisma.chatSession.findFirst({
    where: { id: params.id, userId, archived: false }
  });
  if (!chatSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: chatSession.id },
    orderBy: { createdAt: "asc" }
  });

  return NextResponse.json({ session: { id: chatSession.id, title: chatSession.title }, messages });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const chatSession = await prisma.chatSession.findFirst({
    where: { id: params.id, userId, archived: false }
  });
  if (!chatSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.chatSession.update({
    where: { id: chatSession.id },
    data: { archived: true }
  });

  return NextResponse.json({ ok: true });
}
