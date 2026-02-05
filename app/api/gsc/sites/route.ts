import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { refreshAccessToken } from "@/lib/google-oauth";
import { listSites } from "@/lib/gsc";
import { authOptions } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const cookieStore = cookies();
  const accountId = cookieStore.get("accountId")?.value;
  const account = accountId
    ? await prisma.gscAccount.findFirst({ where: { id: accountId, userId } })
    : await prisma.gscAccount.findFirst({ where: { userId }, orderBy: { created_at: "asc" } });

  if (!account?.refresh_token) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  try {
    const tokens = await refreshAccessToken(decrypt(account.refresh_token));
    const sites = await listSites(tokens.access_token);
    return NextResponse.json(
      {
        sites: sites.map((s) => ({
          siteUrl: s.siteUrl,
          permissionLevel: s.permissionLevel
        }))
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("GSC sites error", err);
    const message = err?.message ?? "Server error";
    if (message.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT") || message.includes("insufficientPermissions")) {
      return NextResponse.json({ error: message, code: "insufficient_scope" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
