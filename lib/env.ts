import { z } from "zod";

const envSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(1),
  ENCRYPTION_KEY: z.string().length(64),
  DATABASE_URL: z.string().optional()
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
