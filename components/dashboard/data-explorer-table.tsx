"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { QueryRow } from "./queries-table";
import { Button } from "@/components/ui/button";

type SortCol = "impressions" | "clicks" | null;
type SortDir = "asc" | "desc" | null;

export function DataExplorerTable({
  rows,
  onSelectPage,
  selectedPage
}: {
  rows: QueryRow[];
  onSelectPage: (page: string) => void;
  selectedPage: string | null;
}) {
  const [sortCol, setSortCol] = useState<SortCol>("impressions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(col: SortCol) {
    if (col !== sortCol) {
      setSortCol(col);
      setSortDir("desc");
    } else {
      if (sortDir === "desc") setSortDir("asc");
      else if (sortDir === "asc") {
        setSortCol(null);
        setSortDir(null);
      } else {
        setSortDir("desc");
      }
    }
  }

  const sorted = useMemo(() => {
    if (!sortCol || !sortDir) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = (a as any)[sortCol];
      const vb = (b as any)[sortCol];
      if (va === vb) return 0;
      if (sortDir === "desc") return vb - va;
      return va - vb;
    });
    return arr;
  }, [rows, sortCol, sortDir]);

  const header = (col: SortCol, label: string) => {
    const icon =
      sortCol !== col ? <ArrowUpDown className="h-3 w-3" /> : sortDir === "desc" ? (
        <ArrowDown className="h-3 w-3" />
      ) : sortDir === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3" />
      );
    return (
      <button
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"
        onClick={() => toggle(col)}
      >
        {label} {icon}
      </button>
    );
  };

  function exportCsv() {
    const header = ["Query", "Impressions", "Clicks", "Page"];
    const lines = sorted.map((r) => [
      `"${(r.keys[0] ?? "").replace(/"/g, '""')}"`,
      r.impressions,
      r.clicks,
      `"${(r.keys[1] ?? "").replace(/"/g, '""')}"`
    ].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data-explorer.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Data Explorer</CardTitle>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          Export (Excel/CSV)
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
            <Table className="text-sm min-w-full">
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead className="text-right">{header("impressions", "Impr.")}</TableHead>
                  <TableHead className="text-right">{header("clicks", "Clicks")}</TableHead>
                  <TableHead>URL (Slug)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Keine Daten
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((r, idx) => (
                <TableRow key={idx} className={cn(idx % 2 === 0 && "bg-muted/30") }>
                  <TableCell className="max-w-[220px] truncate" title={r.keys[0]}>
                    {r.keys[0]}
                  </TableCell>
                  <TableCell className="text-right">{r.impressions.toLocaleString("de-DE")}</TableCell>
                  <TableCell className="text-right">{r.clicks.toLocaleString("de-DE")}</TableCell>
                  <TableCell className="max-w-[280px] truncate" title={r.keys[1]}>
                    {r.keys[1] ? (
                      <button
                        type="button"
                        className={cn(
                          "text-left text-primary hover:underline",
                          selectedPage === r.keys[1] && "font-semibold"
                        )}
                        onClick={() => onSelectPage(r.keys[1] as string)}
                      >
                        {(() => {
                          try {
                            const url = new URL(r.keys[1] as string);
                            return url.pathname || "/";
                          } catch {
                            return r.keys[1];
                          }
                        })()}
                      </button>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
