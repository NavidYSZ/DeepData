import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const { accountId } = await request.json().catch(() => ({}));
  if (!accountId || typeof accountId !== "string") {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  const exists = await prisma.googleAccount.findUnique({ where: { id: accountId } });
  if (!exists) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  cookies().set("accountId", accountId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  return NextResponse.json({ ok: true });
}
