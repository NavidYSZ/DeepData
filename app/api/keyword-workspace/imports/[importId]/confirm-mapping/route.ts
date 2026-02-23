import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { z } from "zod";
import { promises as fsp } from "fs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseFile, parseNumber } from "@/lib/keyword-workspace/file-parse";
import {
  ingestSourceMetrics,
  recomputeDemandForProject
} from "@/lib/keyword-workspace/service";

const schema = z.object({
  keywordColumn: z.string(),
  volumeColumn: z.string().optional(),
  impressionsColumn: z.string().optional(),
  clicksColumn: z.string().optional(),
  positionColumn: z.string().optional(),
  urlColumn: z.string().optional(),
  cpcColumn: z.string().optional(),
  kdColumn: z.string().optional()
});

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

export async function POST(_req: Request, ctx: { params: { importId: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  let body: z.infer<typeof schema>;
  try {
    const json = await _req.json();
    body = schema.parse(json);
  } catch {
    return err("INVALID_BODY", "Invalid body");
  }

  const source = await prisma.keywordSource.findUnique({ where: { id: ctx.params.importId } });
  if (!source) return err("SOURCE_NOT_FOUND", "Source not found", { importId: ctx.params.importId }, 404);

  const project = await prisma.keywordProject.findFirst({ where: { id: source.projectId, userId } });
  if (!project) return err("FORBIDDEN", "Not allowed", {}, 403);

  const meta = source.metaJson ? JSON.parse(source.metaJson) : {};

  // Save the confirmed mapping
  meta.mapping = {
    keywordColumn: body.keywordColumn,
    volumeColumn: body.volumeColumn,
    impressionsColumn: body.impressionsColumn,
    clicksColumn: body.clicksColumn,
    positionColumn: body.positionColumn,
    urlColumn: body.urlColumn,
    cpcColumn: body.cpcColumn,
    kdColumn: body.kdColumn,
    mappingVersion: 1
  };

  await prisma.keywordSource.update({
    where: { id: source.id },
    data: { metaJson: JSON.stringify(meta) }
  });

  // Re-read and parse the file from disk
  const filePath = meta.path;
  if (!filePath) {
    return err("FILE_MISSING", "Upload file path not found in source metadata");
  }

  let buffer: Buffer;
  try {
    buffer = await fsp.readFile(filePath);
  } catch {
    return err("FILE_MISSING", "Upload file no longer available on disk. Please re-upload the file.", {}, 410);
  }

  let rows: Record<string, any>[];
  try {
    rows = parseFile(meta.filename ?? filePath, buffer);
  } catch (e) {
    return err("PARSE_FAILED", "Failed to parse file", { reason: (e as Error).message });
  }

  if (!rows.length) {
    return err("IMPORT_FAILED", "File contained no rows");
  }

  // Apply confirmed column mapping and ingest
  const metricRows = rows
    .map((row) => ({
      kwRaw: String(row[body.keywordColumn] ?? "").trim(),
      volume: body.volumeColumn ? parseNumber(row[body.volumeColumn]) : null,
      impressions: body.impressionsColumn ? parseNumber(row[body.impressionsColumn]) : null,
      clicks: body.clicksColumn ? parseNumber(row[body.clicksColumn]) : null,
      position: body.positionColumn ? parseNumber(row[body.positionColumn]) : null,
      url: body.urlColumn ? String(row[body.urlColumn] ?? "").trim() || null : null
    }))
    .filter((r) => r.kwRaw !== "");

  await ingestSourceMetrics({
    projectId: source.projectId,
    sourceId: source.id,
    replaceExistingForSource: true,
    rows: metricRows
  });

  await recomputeDemandForProject(source.projectId);

  return NextResponse.json({
    importId: source.id,
    status: "INGESTED",
    rowCount: metricRows.length
  });
}
