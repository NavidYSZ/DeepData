import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import path from "path";
import { promises as fsp } from "fs";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseFile, detectColumns } from "@/lib/keyword-workspace/file-parse";

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
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
    rows = parseFile(file.name, buffer);
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
    headers,
    detectedColumns,
    previewRows
  });
}
