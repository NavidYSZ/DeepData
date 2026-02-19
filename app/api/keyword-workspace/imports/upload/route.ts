import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import { nanoid } from "nanoid";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import iconv from "iconv-lite";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  projectId: z.string()
});

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

function detectColumns(headers: string[]) {
  const lower = headers.map((h) => h.toLowerCase());
  const pick = (preds: string[]) => {
    const idx = lower.findIndex((h) => preds.some((p) => h.includes(p)));
    return idx >= 0 ? headers[idx] : null;
  };
  return {
    keyword: pick(["keyword", "kw", "suchbegriff", "query"]),
    volume: pick(["volume", "search", "sistrix"]),
    impressions: pick(["impression"]),
    clicks: pick(["click"]),
    position: pick(["position", "avg position"]),
    url: pick(["url", "landing", "page"])
  };
}

async function parseFile(filePath: string, buffer: Buffer) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
  }
  const decoded = iconv.decode(buffer, "utf-8");
  return parse(decoded, { columns: true, skip_empty_lines: true });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const form = await req.formData();
  const projectId = form.get("projectId");
  const file = form.get("file") as File | null;
  if (!projectId || typeof projectId !== "string") return err("INVALID_BODY", "projectId required");
  if (!file) return err("INVALID_BODY", "file required");

  const project = await prisma.keywordProject.findFirst({ where: { id: projectId, userId } });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", { projectId }, 404);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > 20 * 1024 * 1024) return err("FILE_TOO_LARGE", "Max 20MB", {}, 413);

  const uploadsDir = path.join(process.cwd(), "data", "uploads");
  await fsp.mkdir(uploadsDir, { recursive: true });
  const sourceId = nanoid();
  const filename = `${sourceId}-${file.name}`;
  const fullPath = path.join(uploadsDir, filename);
  await fsp.writeFile(fullPath, buffer);

  let rows: Record<string, any>[] = [];
  try {
    rows = await parseFile(file.name, buffer);
  } catch (e) {
    return err("IMPORT_FAILED", "Failed to parse file", { reason: (e as Error).message });
  }

  if (!rows.length) return err("IMPORT_FAILED", "File contained no rows");
  const headers = Object.keys(rows[0]);
  const detectedColumns = detectColumns(headers);
  if (!detectedColumns.keyword) return err("COLUMN_MISSING", "Keyword column not detected");

  const previewRows = rows.slice(0, 20);

  const source = await prisma.keywordSource.create({
    data: {
      id: sourceId,
      projectId,
      type: "upload",
      name: `Upload: ${file.name}`,
      metaJson: JSON.stringify({
        filename: file.name,
        path: fullPath,
        detectedColumns,
        previewRows
      })
    }
  });

  return NextResponse.json({
    importId: source.id,
    sourceId: source.id,
    detectedColumns,
    previewRows
  });
}
