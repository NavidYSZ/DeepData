import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import path from "path";
import { promises as fsp } from "fs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureWorkspaceProject,
  ensureWorkspaceSource,
  ingestSourceMetrics,
  recomputeDemandForProject,
  rebuildPreclusters
} from "@/lib/keyword-workspace/service";
import { parseFile, detectColumns, parseNumber } from "@/lib/keyword-workspace/file-parse";

function err(code: string, message: string, details: Record<string, unknown> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const formData = await req.formData();
  const siteUrl = formData.get("siteUrl");
  const file = formData.get("file");
  if (!siteUrl || typeof siteUrl !== "string") return err("INVALID_BODY", "siteUrl is required");
  if (!file || !(file instanceof File)) return err("INVALID_BODY", "file is required");

  const project = await ensureWorkspaceProject(userId, siteUrl);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > 20 * 1024 * 1024) return err("FILE_TOO_LARGE", "Max 20MB", {}, 413);

  const rows = parseFile(file.name, bytes);
  if (!rows.length) return err("IMPORT_FAILED", "No rows found");

  const headers = Object.keys(rows[0] ?? {});
  const detected = detectColumns(headers);
  if (!detected.keyword) return err("COLUMN_MISSING", "Keyword column not detected");

  const uploadsDir = path.join(process.cwd(), "data", "uploads");
  await fsp.mkdir(uploadsDir, { recursive: true });
  const storedName = `${Date.now()}-${file.name}`;
  const storedPath = path.join(uploadsDir, storedName);
  await fsp.writeFile(storedPath, bytes);

  const source = await ensureWorkspaceSource(project.id, "upload", `Upload: ${file.name}`, {
    fileName: file.name,
    path: storedPath,
    detectedColumns: detected
  });

  await ingestSourceMetrics({
    projectId: project.id,
    sourceId: source.id,
    replaceExistingForSource: true,
    rows: rows.map((row) => ({
      kwRaw: String(row[detected.keyword as string] ?? ""),
      impressions: detected.impressions ? parseNumber(row[detected.impressions]) : null,
      clicks: detected.clicks ? parseNumber(row[detected.clicks]) : null,
      position: detected.position ? parseNumber(row[detected.position]) : null,
      volume: detected.volume ? parseNumber(row[detected.volume]) : null,
      url: detected.url ? String(row[detected.url] ?? "") : null
    }))
  });
  await recomputeDemandForProject(project.id);

  const existingClusters = await prisma.cluster.count({ where: { projectId: project.id } });
  if (existingClusters === 0) {
    await rebuildPreclusters(project.id);
  }

  return NextResponse.json({
    status: "DONE",
    projectId: project.id,
    sourceId: source.id,
    rowCount: rows.length,
    detectedColumns: detected
  });
}
