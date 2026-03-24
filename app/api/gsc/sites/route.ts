import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listSitesForUser } from "@/lib/gsc-access";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const preferredAccountId = cookies().get("accountId")?.value;

  try {
    const sites = await listSitesForUser(userId, preferredAccountId);
    if (process.env.NODE_ENV !== "production") {
      console.info("[GSC][sites] success", {
        userId,
        siteCount: sites.length
      });
    }
    return NextResponse.json(
      {
        sites: sites.map((s) => ({
          siteUrl: s.siteUrl,
          permissionLevel: s.permissionLevel,
          accountId: s.accountId,
          accountEmail: s.accountEmail
        }))
      },
      { status: 200 }
    );
  } catch (err: any) {
    const message = err?.message ?? "Server error";
    const invalidGrant = /invalid_grant|token revoked|token_expired/i.test(message);
    const missingRefreshToken = err?.code === "missing_refresh_token";
    if (process.env.NODE_ENV !== "production") {
      console.error("[GSC][sites] error", { userId, preferredAccountId, message });
    }
    if (missingRefreshToken) {
      return NextResponse.json({ error: message, code: "missing_refresh_token" }, { status: 401 });
    }
    if (invalidGrant) {
      return NextResponse.json({ error: message, code: "refresh_invalid" }, { status: 401 });
    }
    if (message.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT") || message.includes("insufficientPermissions")) {
      return NextResponse.json({ error: message, code: "insufficient_scope" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
