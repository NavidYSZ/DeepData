"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { SortableHeader } from "@/components/dashboard/sortable-header";

export interface QueryRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

type SortCol = "impressions" | "position" | "ctr" | "clicks" | null;
type SortDir = "asc" | "desc" | null;

export function QueriesTable({ rows, maxHeight = 520 }: { rows: QueryRow[]; maxHeight?: number }) {
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

  const header = (col: SortCol, label: string) => (
    <SortableHeader
      label={label}
      active={sortCol === col}
      direction={sortCol === col ? sortDir : null}
      onClick={() => toggle(col)}
    />
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Keywords</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="overflow-y-auto" style={{ maxHeight }}>
            <Table className="text-sm min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead className="text-right">{header("impressions", "Imp.")}</TableHead>
                  <TableHead className="text-right">{header("position", "Avg. Pos")}</TableHead>
                  <TableHead className="text-right">{header("ctr", "CTR")}</TableHead>
                  <TableHead className="text-right">{header("clicks", "Clicks")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r, idx) => (
                  <TableRow key={idx} className={cn(idx % 2 === 0 && "bg-muted/30") }>
                    <TableCell className="max-w-[220px] truncate">{r.keys[0]}</TableCell>
                    <TableCell className="text-right">{r.impressions}</TableCell>
                    <TableCell className="text-right">{r.position.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{(r.ctr * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{r.clicks}</TableCell>
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
