"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { TableContainer } from "@/components/ui/table-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SortableHeader } from "@/components/dashboard/sortable-header";

export interface ResultRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export function ResultsTable({ rows }: { rows: ResultRow[] }) {
  type SortCol = "clicks" | "impressions" | "ctr" | "position" | null;
  type SortDir = "asc" | "desc" | null;
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Rows</CardTitle>
      </CardHeader>
      <CardContent>
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keys</TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    label="Clicks"
                    active={sortCol === "clicks"}
                    direction={sortCol === "clicks" ? sortDir : null}
                    onClick={() => toggle("clicks")}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    label="Impressions"
                    active={sortCol === "impressions"}
                    direction={sortCol === "impressions" ? sortDir : null}
                    onClick={() => toggle("impressions")}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    label="CTR"
                    active={sortCol === "ctr"}
                    direction={sortCol === "ctr" ? sortDir : null}
                    onClick={() => toggle("ctr")}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    label="Position"
                    active={sortCol === "position"}
                    direction={sortCol === "position" ? sortDir : null}
                    onClick={() => toggle("position")}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Keine Daten
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell className="max-w-[280px] truncate">
                    {row.keys.join(" • ")}
                  </TableCell>
                  <TableCell className="text-right">{row.clicks}</TableCell>
                  <TableCell className="text-right">{row.impressions}</TableCell>
                  <TableCell className="text-right">
                    {(row.ctr * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">{row.position.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}
