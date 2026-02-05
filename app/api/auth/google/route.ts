import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getEnv } from "@/lib/env";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect("/api/auth/signin?callbackUrl=/dashboard");
  }
  const { GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI } = getEnv();

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    [
      "https://www.googleapis.com/auth/webmasters.readonly",
      "openid",
      "email",
      "profile"
    ].join(" ")
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url.toString(), { status: 302 });
}
