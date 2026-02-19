import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import iconv from "iconv-lite";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeKeyword } from "@/lib/keyword-workspace/normalize";

function err(code: string, message: string, details: Record<string, any> = {}, status = 400) {
  return NextResponse.json({ code, message, details, traceId: nanoid(10) }, { status });
}

const schema = z.object({
  rerun: z.boolean().optional()
});

function parseFileByPath(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
  }
  const decoded = iconv.decode(buffer, "utf-8");
  return parse(decoded, { columns: true, skip_empty_lines: true });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return err("NOT_AUTHENTICATED", "Not authenticated", {}, 401);

  const project = await prisma.keywordProject.findFirst({ where: { id: ctx.params.id, userId } });
  if (!project) return err("PROJECT_NOT_FOUND", "Project not found", { projectId: ctx.params.id }, 404);

  try {
    const json = await req.json();
    schema.parse(json ?? {});
  } catch {
    // ignore optional body
  }

  const sources = await prisma.keywordSource.findMany({ where: { projectId: project.id } });
  if (!sources.length) return err("SOURCE_NOT_FOUND", "No sources found", {}, 404);

  let keywordsCreated = 0;
  let demandComputed = 0;

  for (const source of sources) {
    const meta = source.metaJson ? JSON.parse(source.metaJson) : {};
    if (source.type === "upload") {
      if (!meta.path || !meta.mapping?.keywordColumn) continue;
      const rows = parseFileByPath(meta.path);
      for (const row of rows) {
        const kwRaw = String(row[meta.mapping.keywordColumn] ?? "").trim();
        if (!kwRaw) continue;
        const norm = normalizeKeyword(kwRaw);
        if (!norm) continue;

        const existing = await prisma.keyword.findFirst({
          where: { projectId: project.id, kwNorm: norm.kwNorm }
        });
        const keywordId = existing?.id ?? nanoid();

        if (!existing) {
          await prisma.keyword.create({
            data: {
              id: keywordId,
              projectId: project.id,
              kwRaw,
              kwNorm: norm.kwNorm,
              kwSig: norm.kwSig,
              lang: project.lang,
              country: project.country
            }
          });
          keywordsCreated += 1;
        }

        const impressions = meta.mapping.impressionsColumn ? Number(row[meta.mapping.impressionsColumn] ?? 0) : undefined;
        const clicks = meta.mapping.clicksColumn ? Number(row[meta.mapping.clicksColumn] ?? 0) : undefined;
        const position = meta.mapping.positionColumn ? Number(row[meta.mapping.positionColumn] ?? 0) : undefined;
        const url = meta.mapping.urlColumn ? String(row[meta.mapping.urlColumn] ?? "") : undefined;
        const volume = meta.mapping.volumeColumn ? Number(row[meta.mapping.volumeColumn] ?? 0) : undefined;

        await prisma.keywordSourceMetric.upsert({
          where: { keywordId_sourceId: { keywordId, sourceId: source.id } },
          create: {
            keywordId,
            sourceId: source.id,
            impressions: impressions ?? null,
            clicks: clicks ?? null,
            position: position ?? null,
            sistrixVolume: volume ?? null,
            url: url || null
          },
          update: {
            impressions: impressions ?? null,
            clicks: clicks ?? null,
            position: position ?? null,
            sistrixVolume: volume ?? null,
            url: url || null
          }
        });

        // demand rule: prefer GSC (impressions) else upload volume else 0
        const demand = impressions && impressions > 0 ? impressions : volume && volume > 0 ? volume : 0;
        const demandSource = impressions && impressions > 0 ? "gsc" : volume && volume > 0 ? "upload" : "none";
        await prisma.keywordDemand.upsert({
          where: { keywordId },
          create: {
            keywordId,
            projectId: project.id,
            demandMonthly: demand,
            demandSource
          },
          update: {
            demandMonthly: demand,
            demandSource
          }
        });
        demandComputed += 1;
      }
    }
  }

  return NextResponse.json({ status: "DONE", keywordsCreated, demandComputed });
}
