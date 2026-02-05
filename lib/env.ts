import { z } from "zod";

const envSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  DATABASE_URL: z.string().optional()
});

export function getEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Environment variables invalid:", parsed.error.flatten().fieldErrors);
    throw new Error("Missing/invalid environment variables");
  }
  return parsed.data;
}
