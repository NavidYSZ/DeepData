"use client";

import { useEffect, useState } from "react";
import { Activity, Globe, History, RefreshCw, Search, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { crawlerRows } from "@/lib/crawl/mock-data";
import { cn } from "@/lib/utils";

function statusTone(statusCode: number) {
  if (statusCode >= 400) return "text-red-700 dark:text-red-300";
  if (statusCode >= 300) return "text-amber-700 dark:text-amber-300";
  return "text-emerald-700 dark:text-emerald-300";
}

function changeTone(changeType: string) {
  if (changeType === "new") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (changeType === "removed") return "bg-red-500/10 text-red-700 dark:text-red-300";
  if (changeType === "issue") return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (changeType === "updated") return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return "bg-muted text-muted-foreground";
}

export function CrawlerWorkspace() {
  const [seedUrl, setSeedUrl] = useState("https://example.com/");
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState("all");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(68);

  useEffect(() => {
    if (!isRunning) return;

    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 100) {
          window.clearInterval(timer);
          setIsRunning(false);
          return 100;
        }

        return Math.min(current + 8, 100);
      });
    }, 350);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  const visibleRows = crawlerRows.filter((row) => {
    const matchesText =
      row.url.toLowerCase().includes(filter.toLowerCase()) ||
      row.title.toLowerCase().includes(filter.toLowerCase());

    if (!matchesText) return false;
    if (tab === "changed") return row.changeType !== "unchanged";
    if (tab === "issues") return row.issueCount > 0 || row.statusCode >= 400;
    return true;
  });

  const changedCount = crawlerRows.filter((row) => row.changeType !== "unchanged").length;
  const issueCount = crawlerRows.filter((row) => row.issueCount > 0 || row.statusCode >= 400).length;
  const indexableCount = crawlerRows.filter((row) => row.indexability === "indexable").length;

  function startDemoCrawl() {
    setProgress(14);
    setIsRunning(true);
  }

  return (
    <div className="space-y-6">
      <Card className="border-sky-200/70 bg-card/90">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge variant="outline" className="w-fit border-sky-200 bg-sky-500/10 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
              UI Prototype
            </Badge>
            <CardTitle className="text-3xl tracking-tight">Crawler</CardTitle>
            <CardDescription className="max-w-3xl text-base leading-7">
              Diese Ansicht bildet den operativen Kern des neuen Crawl-Bereichs: Seed URL,
              Run-Status, Crawl-Tabelle und die Stellen, an denen später echte Snapshot- und
              Diff-Daten einlaufen.
            </CardDescription>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-background/75 p-4">
              <p className="text-sm text-muted-foreground">URLs im Sample</p>
              <p className="mt-2 text-2xl font-semibold">{crawlerRows.length}</p>
            </div>
            <div className="rounded-2xl border bg-background/75 p-4">
              <p className="text-sm text-muted-foreground">Geändert</p>
              <p className="mt-2 text-2xl font-semibold">{changedCount}</p>
            </div>
            <div className="rounded-2xl border bg-background/75 p-4">
              <p className="text-sm text-muted-foreground">Issues</p>
              <p className="mt-2 text-2xl font-semibold">{issueCount}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle className="text-xl">Run Setup</CardTitle>
              <CardDescription>
                Schlanke Screaming-Frog-artige Steuerung mit Platz für echte Crawl-Optionen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="seed-url" className="text-sm font-medium">
                  Seed URL
                </label>
                <Input
                  id="seed-url"
                  value={seedUrl}
                  onChange={(event) => setSeedUrl(event.target.value)}
                  placeholder="https://example.com/"
                />
              </div>

              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between rounded-xl border bg-background/70 px-3 py-2">
                  <span>User Agent</span>
                  <span className="text-muted-foreground">DeepDataBot/1.0</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-background/70 px-3 py-2">
                  <span>Max URLs</span>
                  <span className="text-muted-foreground">10.000</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-background/70 px-3 py-2">
                  <span>Schedule</span>
                  <span className="text-muted-foreground">Täglich 04:00</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={startDemoCrawl} disabled={isRunning}>
                  {isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {isRunning ? "Crawl läuft" : "Demo Crawl starten"}
                </Button>
                <Button variant="outline">
                  <History className="h-4 w-4" />
                  Letzten Run laden
                </Button>
              </div>

              <div className="space-y-2 rounded-2xl border bg-background/70 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Run Progress</span>
                  <span className="text-muted-foreground">{progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-sky-500 transition-[width] duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  V1-Entscheidung: der echte Crawler schreibt zuerst Run-Metadaten, danach URL
                  Snapshots und am Ende die Change Events.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle className="text-xl">V1 Fokus</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>1. Eine stabile Tabellenbasis für URL-Snapshots und Statuscodes.</p>
              <p>2. Klare Trennung zwischen Crawl-Ausführung und Changes-Historie.</p>
              <p>3. Tagesbasierte Speicherung, damit Kalender und Delta-Liste einfach bleiben.</p>
            </CardContent>
          </Card>
        </div>

        <Card className="min-h-[620px] bg-card/90">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl">Live Crawl Table</CardTitle>
                <CardDescription>
                  Der große Arbeitsbereich bleibt tabellarisch, damit später echte Screaming-Frog-
                  Workflows wie Filtern, Sortieren und Export anschließen können.
                </CardDescription>
              </div>
              <div className="flex w-full gap-2 lg:w-auto">
                <Input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="URL oder Title filtern"
                  className="lg:w-[280px]"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border bg-background/70 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                  Indexierbar
                </div>
                <p className="mt-2 text-2xl font-semibold">{indexableCount}</p>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  Snapshot-Änderungen
                </div>
                <p className="mt-2 text-2xl font-semibold">{changedCount}</p>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                  Issues
                </div>
                <p className="mt-2 text-2xl font-semibold">{issueCount}</p>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4">
                <p className="text-sm font-medium">Seed</p>
                <p className="mt-2 truncate text-sm text-muted-foreground">{seedUrl}</p>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <Tabs value={tab} onValueChange={setTab} className="space-y-4">
              <TabsList>
                <TabsTrigger value="all">All URLs</TabsTrigger>
                <TabsTrigger value="changed">Changed</TabsTrigger>
                <TabsTrigger value="issues">Issues</TabsTrigger>
              </TabsList>

              <TabsContent value={tab} className="mt-0">
                <ScrollArea className="h-[420px] rounded-2xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>URL</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Depth</TableHead>
                        <TableHead>Canonical</TableHead>
                        <TableHead>Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            <div className="max-w-[280px] truncate">{row.url}</div>
                          </TableCell>
                          <TableCell>
                            <span className={cn("font-medium", statusTone(row.statusCode))}>
                              {row.statusCode}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[280px] truncate">{row.title}</div>
                          </TableCell>
                          <TableCell>{row.depth}</TableCell>
                          <TableCell>
                            <div className="max-w-[220px] truncate text-muted-foreground">
                              {row.canonical}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize",
                                  changeTone(row.changeType)
                                )}
                              >
                                {row.changeType}
                              </span>
                              {row.issueCount > 0 ? (
                                <span className="text-xs text-muted-foreground">
                                  {row.issueCount} Issue{row.issueCount > 1 ? "s" : ""}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
