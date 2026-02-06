import { z } from "zod";

const envSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(1),
  ENCRYPTION_KEY: z.string().length(64),
  DATABASE_URL: z.string().optional(),
  SESSION_VERSION: z.string().optional()
});

export function getEnv() {
  const defaults = {
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "devsecretdevsecretdevsecret",
    ENCRYPTION_KEY:
      process.env.ENCRYPTION_KEY ??
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  };

  const parsed = envSchema.safeParse({ ...defaults, ...process.env });
  if (!parsed.success) {
    console.error("Environment variables invalid:", parsed.error.flatten().fieldErrors);
    throw new Error("Missing/invalid environment variables");
  }
  return parsed.data;
}

function trimTrailingSlash(input: string) {
  return input.endsWith("/") ? input.replace(/\/+$/, "") : input;
}

function normalizeRedirectUri(uri: string) {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error("Invalid GOOGLE_REDIRECT_URI/NEXTAUTH_URL provided");
  }

  // Normalize trailing slashes on the path to avoid accidental mismatches
  url.pathname = url.pathname.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Google redirect URI must use https in production");
  }

  return url.toString();
}

// Resolves the Google OAuth redirect URI used by the custom GSC flow.
// Priority: explicit GOOGLE_REDIRECT_URI, otherwise NEXTAUTH_URL + /api/auth/google/callback.
export function getGoogleRedirectUri() {
  const { GOOGLE_REDIRECT_URI, NEXTAUTH_URL } = getEnv();
  const fallback = NEXTAUTH_URL ? `${trimTrailingSlash(NEXTAUTH_URL)}/api/auth/google/callback` : undefined;
  const candidate = GOOGLE_REDIRECT_URI ?? fallback;

  if (!candidate) {
    throw new Error("Missing GOOGLE_REDIRECT_URI or NEXTAUTH_URL for Google OAuth redirect");
  }

  return normalizeRedirectUri(candidate);
}
