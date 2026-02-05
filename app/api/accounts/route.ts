import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const accounts = await prisma.googleAccount.findMany({
    orderBy: { created_at: "asc" },
    select: { id: true, email: true, created_at: true }
  });
  return NextResponse.json({ accounts });
}
