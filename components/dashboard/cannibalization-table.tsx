"use client";

import { Fragment, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp, Info } from "lucide-react";
import type { CannibalRow, UrlAgg } from "@/lib/cannibalization";

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

  const headerBtn = (col: SortCol, label: string, help?: React.ReactNode) => {
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
        {label}
        {help && <InfoTooltip text={help} />}
        {icon}
      </button>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Kannibalisierung</CardTitle>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          Export (CSV)
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
            <Table className="text-sm min-w-full">
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
                          <p>Top Share zeigt, wie viel Prozent der Query-Leistung auf die stärkste URL entfallen (Clicks/Impr. Summe aller URLs). Beispiel: URL A hat 80 von 100 Klicks → Top Share 80%.</p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold">Interpretation</p>
                          <p>Hoch = klare Haupt-URL. Niedrig = Leistung verteilt, oft Hinweis auf Kannibalisierung/überlappende Inhalte.</p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold">Richtwerte</p>
                          <div className="space-y-1">
                            <p>- &gt;70–80%: meist stabil</p>
                            <p>- 40–70%: beobachten</p>
                            <p>- &lt;40%: oft Handlungsbedarf</p>
                          </div>
                        </div>
                        <p className="mb-0">Immer zusammen mit Impressions, #URLs und Suchintention bewerten.</p>
                      </div>
                    )}
                  </TableHead>
                  <TableHead className="text-right">
                    {headerBtn(
                      "secondShare",
                      "2nd Share",
                      <div className="space-y-2">
                        <p className="mb-2 last:mb-0">2nd Share ist der Leistungsanteil der zweitstärksten URL innerhalb derselben Query. Diese Kennzahl zeigt, wie stark die zweite URL in die Sichtbarkeit der Haupt-URL hineinragt.</p>
                        <p className="mb-2 last:mb-0">Liegt der 2nd Share nahe am Top Share, konkurrieren zwei URLs direkt um dieselbe Query – ein klassisches Muster für Kannibalisierung oder zumindest für eine nicht sauber entschiedene URL-Priorisierung.</p>
                        <p className="mb-2 last:mb-0">Ist der 2nd Share dagegen deutlich kleiner, gibt es zwar weitere rankende URLs, aber keine ernsthafte Rivalität zur Haupt-URL.</p>
                        <p className="mb-2 last:mb-0">Typische Nutzung in der Praxis: Hoher 2nd Share plus niedriger Top Share ist ein starkes Signal, dass Titel/H1, interne Verlinkung oder Content-Fokus zwischen zwei Seiten zu ähnlich sind.</p>
                      </div>
                    )}
                  </TableHead>
                  <TableHead className="text-right">
                    {headerBtn(
                      "spread",
                      "Spread",
                      <div className="space-y-2">
                        <p className="mb-2 last:mb-0">Spread beschreibt den Positionsabstand zwischen der stärksten und der zweitstärksten URL für eine Query (hier: max(Position) – min(Position)).</p>
                        <p className="mb-2 last:mb-0">Bedeutung: Ein kleiner Spread steht für ein Kopf-an-Kopf-Rennen – Google schwankt zwischen zwei Seiten, was häufig auf Kannibalisierung, Intent-Überlappung oder unklare Informationsarchitektur hinweist.</p>
                        <p className="mb-2 last:mb-0">Ein großer Spread bedeutet, dass die Haupt-URL klar vor der zweiten URL liegt und die Query-Zuordnung stabiler ist.</p>
                        <p className="mb-2 last:mb-0">Wichtig: Spread nie isoliert lesen. Ein kleiner Spread bei wenigen Impressions kann irrelevant sein; ein kleiner Spread bei hohem Query-Volumen ist hingegen ein priorisierter Optimierungsfall. Für Entscheidungen immer gemeinsam mit Top Share, 2nd Share, URLs/Query und absolutem Traffic-Potenzial betrachten.</p>
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
                      <TableRow key={r.query} className={cn(idx % 2 === 0 && "bg-muted/30") }>
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UrlList({ urls, totalClicks, totalImpr }: { urls: UrlAgg[]; totalClicks: number; totalImpr: number }) {
  const denom = totalClicks || totalImpr || 1;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">URLs</p>
      <div className="overflow-x-auto">
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
      </div>
    </div>
  );
}

function InfoTooltip({ text, maxWidth = 420 }: { text: React.ReactNode; maxWidth?: number }) {
  return (
    <span className="relative inline-flex items-center group">
      <Info className="h-3 w-3 text-muted-foreground" />
      <span
        className="pointer-events-auto absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 rounded-md border border-border bg-card px-3 py-2 text-[11px] leading-relaxed text-foreground shadow-md group-hover:block group-focus-within:block"
        style={{ maxWidth }}
      >
        {text}
      </span>
    </span>
  );
}
