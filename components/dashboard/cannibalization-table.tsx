"use client";

import { Fragment, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableContainer } from "@/components/ui/table-container";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { SortableHeader } from "@/components/dashboard/sortable-header";
import type { CannibalRow, UrlAgg } from "@/lib/cannibalization";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SortCol = "score" | "totalImpressions" | "totalClicks" | "topShare" | "secondShare" | "spread" | "switches" | null;
type SortDir = "asc" | "desc" | null;

export function CannibalizationTable({ rows, showSwitches }: { rows: CannibalRow[]; showSwitches: boolean }) {
  const [sortCol, setSortCol] = useState<SortCol>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [open, setOpen] = useState<Record<string, boolean>>({});

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
      const va = (a as any)[sortCol] ?? 0;
      const vb = (b as any)[sortCol] ?? 0;
      if (va === vb) return 0;
      if (sortDir === "desc") return vb - va;
      return va - vb;
    });
    return arr;
  }, [rows, sortCol, sortDir]);

  function exportCsv() {
    const header = ["Query", "URLs", "Impressions", "Clicks", "TopShare", "SecondShare", "Spread", "Switches", "Score"];
    const lines = sorted.map((r) => [
      `"${r.query.replace(/"/g, '""')}"`,
      r.urls.length,
      r.totalImpressions,
      r.totalClicks,
      r.topShare.toFixed(3),
      r.secondShare.toFixed(3),
      r.spread.toFixed(2),
      showSwitches ? r.switches ?? 0 : "",
      r.score.toFixed(3)
    ].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kannibalisierung.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const headerBtn = (col: SortCol, label: string, help?: React.ReactNode) => (
    <SortableHeader
      label={label}
      active={sortCol === col}
      direction={sortCol === col ? sortDir : null}
      onClick={() => toggle(col)}
      help={help ? <InfoTooltip text={help} /> : undefined}
    />
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Kannibalisierung</CardTitle>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          Export (CSV)
        </Button>
      </CardHeader>
      <CardContent>
        <TableContainer className="max-h-[calc(100vh-260px)] overflow-auto">
          <Table className="min-w-[980px] text-sm">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Query</TableHead>
                <TableHead className="text-right">{headerBtn("score", "Score")}</TableHead>
                <TableHead className="text-right">{headerBtn("totalImpressions", "Impr.")}</TableHead>
                <TableHead className="text-right">{headerBtn("totalClicks", "Clicks")}</TableHead>
                <TableHead className="text-right">URLs</TableHead>
                <TableHead className="text-right">
                  {headerBtn(
                    "topShare",
                    "Top Share",
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <p className="font-semibold">Definition</p>
                        <p>Top Share zeigt, wie viel Prozent der Query-Leistung auf die stärkste URL entfallen (Clicks/Impr. Summe aller URLs). Beispiel: URL A hat 80 von 100 Klicks und Top Share 80%.</p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-semibold">Interpretation</p>
                        <p>Hoch ist eine klare Haupt-URL. Niedrig bedeutet verteilte Leistung und oft ein Hinweis auf Kannibalisierung.</p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-semibold">Richtwerte</p>
                        <p>{">"}70 bis 80% meist stabil</p>
                        <p>40 bis 70% beobachten</p>
                        <p>{"<"}40% häufig Handlungsbedarf</p>
                      </div>
                    </div>
                  )}
                </TableHead>
                <TableHead className="text-right">
                  {headerBtn(
                    "secondShare",
                    "2nd Share",
                    <div className="space-y-2">
                      <p>2nd Share ist der Anteil der zweitstärksten URL innerhalb derselben Query.</p>
                      <p>Liegt er nahe am Top Share, konkurrieren zwei URLs direkt miteinander.</p>
                      <p>Niedriger 2nd Share spricht für klarere Priorisierung.</p>
                    </div>
                  )}
                </TableHead>
                <TableHead className="text-right">
                  {headerBtn(
                    "spread",
                    "Spread",
                    <div className="space-y-2">
                      <p>Spread ist der Positionsabstand zwischen stärkster und zweitstärkster URL.</p>
                      <p>Kleiner Spread steht für ein Kopf-an-Kopf-Rennen und instabile URL-Zuordnung.</p>
                      <p>Großer Spread deutet auf eine klare Haupt-URL hin.</p>
                    </div>
                  )}
                </TableHead>
                {showSwitches && (
                  <TableHead className="text-right">
                    {headerBtn("switches", "Switches", "Anzahl Wechsel der Top-URL über den Zeitraum")}
                  </TableHead>
                )}
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={showSwitches ? 10 : 9} className="text-center text-muted-foreground">
                    Keine Daten
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((r, idx) => {
                const isOpen = open[r.query];
                return (
                  <Fragment key={r.query}>
                    <TableRow className={cn(idx % 2 === 0 && "bg-muted/30")}>
                      <TableCell className="max-w-[240px] truncate" title={r.query}>{r.query}</TableCell>
                      <TableCell className="text-right">{r.score.toFixed(3)}</TableCell>
                      <TableCell className="text-right">{r.totalImpressions.toLocaleString("de-DE")}</TableCell>
                      <TableCell className="text-right">{r.totalClicks.toLocaleString("de-DE")}</TableCell>
                      <TableCell className="text-right">{r.urls.length}</TableCell>
                      <TableCell className="text-right">{(r.topShare * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{(r.secondShare * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{r.spread.toFixed(2)}</TableCell>
                      {showSwitches && <TableCell className="text-right">{r.switches ?? 0}</TableCell>}
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOpen((o) => ({ ...o, [r.query]: !isOpen }))}
                          className="h-7 px-2 text-xs"
                        >
                          {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Details
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={showSwitches ? 10 : 9}>
                          <UrlList urls={r.urls} totalClicks={r.totalClicks} totalImpr={r.totalImpressions} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

function UrlList({ urls, totalClicks, totalImpr }: { urls: UrlAgg[]; totalClicks: number; totalImpr: number }) {
  const denom = totalClicks || totalImpr || 1;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">URLs</p>
      <TableContainer>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">Impr.</TableHead>
              <TableHead className="text-right">Avg Pos</TableHead>
              <TableHead className="text-right">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {urls.map((u) => (
              <TableRow key={u.page}>
                <TableCell className="max-w-[360px] truncate" title={u.page}>{u.page}</TableCell>
                <TableCell className="text-right">{u.clicks.toLocaleString("de-DE")}</TableCell>
                <TableCell className="text-right">{u.impressions.toLocaleString("de-DE")}</TableCell>
                <TableCell className="text-right">{u.position.toFixed(2)}</TableCell>
                <TableCell className="text-right">{((u.clicks || u.impressions) / denom * 100).toFixed(1)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}

function InfoTooltip({ text, maxWidth = 420 }: { text: React.ReactNode; maxWidth?: number }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground" aria-label="Definition anzeigen">
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="max-h-[60vh] max-w-[min(90vw,420px)] overflow-y-auto text-[11px] leading-relaxed">
          <div style={{ maxWidth }}>{text}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
