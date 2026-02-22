import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const accounts = await prisma.gscAccount.findMany({
    where: { userId },
    orderBy: { created_at: "asc" },
    select: { id: true, email: true, created_at: true }
  });

  const activeAccountId = cookies().get("accountId")?.value ?? accounts[0]?.id ?? null;

  return NextResponse.json({ accounts, activeAccountId });
}
