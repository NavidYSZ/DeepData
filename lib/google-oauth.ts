import { getEnv } from "@/lib/env";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export async function exchangeCodeForTokens(code: string, redirectUri?: string): Promise<TokenResponse> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = getEnv();
  const redirect = (redirectUri ?? GOOGLE_REDIRECT_URI)!;

  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", GOOGLE_CLIENT_ID);
  body.set("client_secret", GOOGLE_CLIENT_SECRET);
  body.set("redirect_uri", redirect);
  body.set("grant_type", "authorization_code");

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function refreshAccessToken(refresh_token: string): Promise<TokenResponse> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getEnv();

  const body = new URLSearchParams({
    refresh_token,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token"
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}
