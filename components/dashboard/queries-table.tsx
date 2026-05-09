"use client";

import { useMemo } from "react";
import { ArrowUpDown, Search } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";

export interface QueryRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

type KeywordRow = {
  query: string;
  impressions: number;
  position: number;
  ctr: number;
  clicks: number;
  visibility?: number;
};

function DataTableColumnHeader({ column, title }: { column: any; title: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      className="-ml-3 h-8 text-xs"
    >
      {title}
      <ArrowUpDown className="ml-2 h-3 w-3" />
    </Button>
  );
}

export function QueriesTable({
  rows,
  lowConfidenceThreshold = 0,
  visibilityByQuery
}: {
  rows: QueryRow[];
  lowConfidenceThreshold?: number;
  visibilityByQuery?: Map<string, number>;
}) {
  const data = useMemo<KeywordRow[]>(
    () =>
      rows.map((r) => ({
        query: r.keys[0],
        impressions: r.impressions,
        position: r.position,
        ctr: r.ctr,
        clicks: r.clicks,
        visibility: visibilityByQuery?.get(r.keys[0])
      })),
    [rows, visibilityByQuery]
  );

  const columns = useMemo<ColumnDef<KeywordRow>[]>(
    () => [
      {
        accessorKey: "query",
        header: "Query",
        cell: ({ row }) => (
          <div className="max-w-[180px] truncate sm:max-w-[240px]" title={row.getValue("query") as string}>
            {row.getValue("query")}
          </div>
        )
      },
      {
        accessorKey: "impressions",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Impr." />,
        cell: ({ row }) => <div className="text-right">{row.getValue("impressions")}</div>
      },
      {
        accessorKey: "position",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Avg. Pos" />,
        cell: ({ row }) => {
          const pos = Number(row.getValue("position"));
          const impr = Number(row.getValue("impressions"));
          const lowConfidence =
            lowConfidenceThreshold > 0 && impr < lowConfidenceThreshold;
          return (
            <div className="text-right">
              {lowConfidence ? (
                <span
                  className="inline-flex items-center gap-1 text-muted-foreground"
                  title={`Nur ${impr} Impressions — Position statistisch unzuverlässig (< ${lowConfidenceThreshold}).`}
                >
                  <span aria-hidden="true">⚠</span>
                  {pos.toFixed(1)}
                </span>
              ) : (
                pos.toFixed(1)
              )}
            </div>
          );
        }
      },
      {
        accessorKey: "ctr",
        header: ({ column }) => <DataTableColumnHeader column={column} title="CTR" />,
        cell: ({ row }) => (
          <div className="text-right">{(Number(row.getValue("ctr")) * 100).toFixed(1)}%</div>
        )
      },
      {
        accessorKey: "clicks",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Clicks" />,
        cell: ({ row }) => <div className="text-right">{row.getValue("clicks")}</div>
      },
      {
        accessorKey: "visibility",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Sichtb." />,
        cell: ({ row }) => {
          const v = row.getValue("visibility") as number | undefined;
          return (
            <div
              className="text-right tabular-nums"
              title="Erwartete Klicks aus Impressionen × CTR-Kurve"
            >
              {v == null ? "—" : Math.round(v).toLocaleString("de-DE")}
            </div>
          );
        }
      }
    ],
    [lowConfidenceThreshold]
  );

  const emptyState = (
    <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
      <Search className="h-4 w-4" />
      <span className="text-sm">Select keywords to see results</span>
      <Button variant="outline" size="sm">
        Select keywords
      </Button>
    </div>
  );

  return (
    <Card className="h-full">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Keywords</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={data}
          searchKey="query"
          searchPlaceholder="Query..."
          emptyState={emptyState}
        />
      </CardContent>
    </Card>
  );
}
