import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { exchangeCodeForTokens } from "@/lib/google-oauth";
import { getGoogleRedirectUri } from "@/lib/env";
import { authOptions } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

function buildRedirect(path: string, request: Request) {
  const base = process.env.NEXTAUTH_URL ?? request.url;
  return NextResponse.redirect(new URL(path, base));
}

async function fetchEmail(accessToken: string, idToken?: string): Promise<string | undefined> {
  // try id_token first
  if (idToken) {
    const parts = idToken.split(".");
    if (parts.length >= 2) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
        if (payload.email) return payload.email as string;
      } catch {
        // ignore
      }
    }
  }
  // fallback: userinfo endpoint
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      const json = await res.json();
      return json.email as string | undefined;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return buildRedirect("/api/auth/signin?callbackUrl=/dashboard", request);
  }
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  if (!code) {
    return buildRedirect("/dashboard?gscError=missing_code", request);
  }

  const redirectUri = getGoogleRedirectUri();

  try {
    console.info("GSC OAuth callback", {
      userId,
      codePresent: !!code,
      errorParam,
      redirectUri
    });

    // Ensure the user still exists (DB may have been reset)
    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      const sessionUser = session?.user ?? {};
      user = await prisma.user.create({
        data: {
          id: userId,
          name: (sessionUser as any)?.name ?? null,
          email: (sessionUser as any)?.email ?? null,
          image: (sessionUser as any)?.image ?? null
        }
      });
    }

    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      return buildRedirect("/dashboard?gscError=no_refresh_token", request);
    }

    const email = await fetchEmail(tokens.access_token, tokens.id_token);

    const existing = email
      ? await prisma.gscAccount.findFirst({ where: { userId, email } })
      : null;
    const account = existing
      ? await prisma.gscAccount.update({
          where: { id: existing.id },
          data: { refresh_token: encrypt(refreshToken), email }
        })
      : await prisma.gscAccount.create({
          data: { userId, email, refresh_token: encrypt(refreshToken) }
        });

    cookies().set("accountId", account.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });

    return buildRedirect("/dashboard", request);
  } catch (err: any) {
    console.error("OAuth callback error", {
      message: err?.message,
      stack: err?.stack,
      cause: err?.cause
    });
    const msg = err?.message || "oauth_error";
    const short = msg
      .toLowerCase()
      .includes("invalid_grant")
      ? "invalid_grant"
      : msg.toLowerCase().includes("access_denied")
        ? "access_denied"
        : "oauth_error";
    return buildRedirect(`/dashboard?gscError=${encodeURIComponent(short)}`, request);
  }
}
