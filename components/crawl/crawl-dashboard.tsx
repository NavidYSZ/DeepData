import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, History, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { crawlChangeEntries, crawlOverview, crawlRuns, crawlerRows } from "@/lib/crawl/mock-data";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function CrawlDashboard() {
  const latestRun = crawlRuns.find((run) => run.status === "completed") ?? crawlRuns[0];
  const recentChanges = crawlChangeEntries.slice(0, 3);
  const crawlerPreview = crawlerRows.slice(0, 4);
  const changeDayCount = new Set(crawlChangeEntries.map((entry) => entry.date)).size;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
        <Card className="overflow-hidden border-sky-200/70 bg-card/90">
          <CardHeader className="space-y-4">
            <Badge variant="outline" className="w-fit border-sky-200 bg-sky-500/10 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
              Crawl v1 Foundation
            </Badge>
            <div className="space-y-2">
              <CardTitle className="text-3xl tracking-tight sm:text-4xl">
                Tägliche Crawls mit sichtbarer Änderungs-Historie
              </CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7">
                Diese neue Fläche wird bewusst als eigene Fullscreen-App gebaut. So können wir
                einen reduzierten Screaming-Frog-ähnlichen Workflow abbilden, ohne Sidebar und
                Dashboard-Header mitschleppen zu müssen.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-background/80 p-4">
              <p className="text-sm text-muted-foreground">Getrackte URLs</p>
              <p className="mt-2 text-3xl font-semibold">{crawlOverview.trackedPages.toLocaleString("de-DE")}</p>
            </div>
            <div className="rounded-2xl border bg-background/80 p-4">
              <p className="text-sm text-muted-foreground">Änderungen heute</p>
              <p className="mt-2 text-3xl font-semibold">{crawlOverview.changedToday.toLocaleString("de-DE")}</p>
            </div>
            <div className="rounded-2xl border bg-background/80 p-4">
              <p className="text-sm text-muted-foreground">Offene Issues</p>
              <p className="mt-2 text-3xl font-semibold">{crawlOverview.openIssues.toLocaleString("de-DE")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle className="text-xl">Festgezogene Leitplanken</CardTitle>
            <CardDescription>
              Die UI ist bereits an der späteren Daily-Crawl-Logik ausgerichtet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="font-medium">Routing</p>
              <p className="mt-1 text-muted-foreground">
                `Crawl` liegt außerhalb von `app/(dashboard)` und erhält ein eigenes Layout.
              </p>
            </div>
            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="font-medium">Informationsarchitektur</p>
              <p className="mt-1 text-muted-foreground">
                `/crawl`, `/crawl/crawler` und `/crawl/changes` trennen Orientierung, Operative
                und History.
              </p>
            </div>
            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="font-medium">Datenmodell-Vorbereitung</p>
              <p className="mt-1 text-muted-foreground">
                Die Mock-Typen spiegeln bereits Run-, Snapshot- und Change-Event-Objekte wider.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Link href="/crawl/crawler" className="block">
          <Card className="h-full border-border/80 bg-card/90 transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg dark:hover:border-sky-800">
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1.5">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  <Search className="h-5 w-5" />
                </div>
                <CardTitle className="pt-2 text-2xl">Crawler</CardTitle>
                <CardDescription className="text-sm leading-6">
                  Screaming-Frog-artige Arbeitsfläche mit Seed-URL, Crawl-Queue, Issues und
                  Snapshot-fähiger Tabellenstruktur.
                </CardDescription>
              </div>
              <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              {crawlerPreview.map((row) => (
                <div
                  key={row.id}
                  className="grid gap-2 rounded-2xl border bg-background/75 p-3 text-sm md:grid-cols-[minmax(0,1fr)_80px_90px]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.url}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.title}</p>
                  </div>
                  <div className="text-xs text-muted-foreground md:text-right">
                    Status {row.statusCode}
                  </div>
                  <div className="text-xs font-medium md:text-right">
                    {row.changeType === "unchanged" ? "Unchanged" : row.changeType}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </Link>

        <Link href="/crawl/changes" className="block">
          <Card className="h-full border-border/80 bg-card/90 transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-lg dark:hover:border-amber-800">
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1.5">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <History className="h-5 w-5" />
                </div>
                <CardTitle className="pt-2 text-2xl">Changes</CardTitle>
                <CardDescription className="text-sm leading-6">
                  Tagesgenaue Änderungsliste mit Kalenderfokus: was wurde geändert, an welcher URL,
                  und an welchen Tagen ist überhaupt etwas passiert.
                </CardDescription>
              </div>
              <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border bg-background/75 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CalendarDays className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                    Tage mit Änderungen
                  </div>
                  <p className="mt-3 text-3xl font-semibold">{changeDayCount}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mini-Kalender markiert diese Tage direkt.
                  </p>
                </div>
                <div className="rounded-2xl border bg-background/75 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock3 className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                    Letzter Crawl
                  </div>
                  <p className="mt-3 text-sm font-medium">{latestRun.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(latestRun.finishedAt ?? latestRun.startedAt)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {recentChanges.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border bg-background/75 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-medium">{entry.url}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{entry.date}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.field}: {entry.before}
                      {" -> "}
                      {entry.after}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-card/90">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Letzter Run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{latestRun.label}</p>
            <p className="text-muted-foreground">{latestRun.changedUrls} geänderte URLs</p>
            <p className="text-muted-foreground">{latestRun.issueCount} technische Auffälligkeiten</p>
          </CardContent>
        </Card>
        <Card className="bg-card/90">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nächster Daily Crawl</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{formatDateTime(crawlOverview.nextRunAt)}</p>
            <p className="text-muted-foreground">Geplant als täglicher Snapshot-Lauf</p>
            <p className="text-muted-foreground">Basis für spätere Diff-Generierung</p>
          </CardContent>
        </Card>
        <Card className="bg-card/90">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nächste Phase</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. Prisma-Modelle für CrawlRun, UrlSnapshot und ChangeEvent.</p>
            <p>2. Täglichen Crawl-Job und erste Persistenz anbinden.</p>
            <p>3. Changes-Ansicht von Mock-Daten auf echte Diffs umstellen.</p>
          </CardContent>
        </Card>
      </section>

      <div className="flex justify-end">
        <Button asChild>
          <Link href="/crawl/crawler">
            Zur Crawler-Ansicht
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
