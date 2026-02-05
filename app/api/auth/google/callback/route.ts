import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { exchangeCodeForTokens } from "@/lib/google-oauth";
import { getEnv } from "@/lib/env";

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
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const { GOOGLE_REDIRECT_URI } = getEnv();

  try {
    const tokens = await exchangeCodeForTokens(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      return NextResponse.json(
        { error: "No refresh_token received. Please re-consent with prompt=consent." },
        { status: 500 }
      );
    }

    const email = await fetchEmail(tokens.access_token, tokens.id_token);

    let account;
    if (email) {
      account = await prisma.googleAccount.upsert({
        where: { email },
        update: { refresh_token: refreshToken },
        create: { email, refresh_token: refreshToken }
      });
    } else {
      account = await prisma.googleAccount.create({
        data: { refresh_token: refreshToken }
      });
    }

    cookies().set("accountId", account.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });

    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (err: any) {
    console.error("OAuth callback error", err);
    return NextResponse.json({ error: err.message ?? "OAuth error" }, { status: 500 });
  }
}
