import path from "path";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import iconv from "iconv-lite";

export type DetectedColumns = {
  keyword: string | null;
  volume: string | null;
  impressions: string | null;
  clicks: string | null;
  position: string | null;
  url: string | null;
  cpc: string | null;
  kd: string | null;
};

/**
 * Sniff the first line to detect which delimiter is most common.
 * Supports comma, semicolon (Sistrix), and tab.
 */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of firstLine) {
    if (ch in counts) counts[ch]++;
  }
  if (counts[";"] > counts[","] && counts[";"] > counts["\t"]) return ";";
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  return ",";
}

/**
 * Decode buffer as UTF-8; fall back to Latin-1 if replacement characters appear.
 * Sistrix and other German tools often export as ISO-8859-1.
 */
export function decodeBuffer(buffer: Buffer): string {
  const utf8 = iconv.decode(buffer, "utf-8");
  if (utf8.includes("\uFFFD")) {
    return iconv.decode(buffer, "latin1");
  }
  return utf8;
}

/**
 * Parse a CSV or Excel file into an array of row objects.
 */
export function parseFile(filename: string, buffer: Buffer): Record<string, any>[] {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
  }
  const decoded = decodeBuffer(buffer);
  const delimiter = detectDelimiter(decoded);
  return parse(decoded, { columns: true, skip_empty_lines: true, delimiter });
}

/**
 * Auto-detect well-known column names, including Sistrix-specific German headers.
 */
export function detectColumns(headers: string[]): DetectedColumns {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const pick = (preds: string[]) => {
    const idx = lower.findIndex((h) => preds.some((p) => h.includes(p)));
    return idx >= 0 ? headers[idx] : null;
  };
  return {
    keyword: pick(["keyword", "kw", "suchbegriff", "query", "suchanfrage", "search term"]),
    volume: pick(["volume", "suchvolumen", "search vol", "sistrix", "sv"]),
    impressions: pick(["impression", "impressionen"]),
    clicks: pick(["click", "klick"]),
    position: pick(["position", "avg position", "rang", "rank"]),
    url: pick(["url", "landing", "page", "seite"]),
    cpc: pick(["cpc", "cost per click", "kosten pro klick"]),
    kd: pick(["kd", "keyword difficulty", "schwierigkeit", "competition", "wettbewerb"])
  };
}

/**
 * Parse a value into a number, handling German locale (comma as decimal, dot as thousands).
 */
export function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // Remove thousands separators (dots) and convert decimal comma
  let cleaned = String(value).trim();
  // If it looks like German format (e.g. "1.234" or "1.234,5"), convert
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(",", ".");
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}
