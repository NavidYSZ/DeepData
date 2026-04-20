"use client";

import { useState } from "react";
import { CalendarDays, Clock3, FileDiff, History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { crawlChangeEntries, crawlRuns } from "@/lib/crawl/mock-data";
import { cn } from "@/lib/utils";

function toCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "full" }).format(toCalendarDate(value));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function changeTone(type: string) {
  if (type === "new") return "border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300";
  if (type === "removed") return "border-red-200 bg-red-500/10 text-red-700 dark:border-red-900 dark:text-red-300";
  if (type === "issue") return "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300";
  return "border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300";
}

export function CrawlChangesView() {
  const availableDays = Array.from(new Set(crawlChangeEntries.map((entry) => entry.date))).sort((a, b) =>
    a > b ? -1 : 1
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(toCalendarDate(availableDays[0]));

  const selectedKey = selectedDate ? toDateKey(selectedDate) : availableDays[0];
  const selectedEntries = crawlChangeEntries.filter((entry) => entry.date === selectedKey);
  const changedDates = availableDays.map((value) => toCalendarDate(value));
  const changedUrlCount = new Set(selectedEntries.map((entry) => entry.url)).size;
  const latestCompletedRun = crawlRuns.find((run) => run.status === "completed") ?? crawlRuns[0];

  return (
    <div className="space-y-6">
      <Card className="border-amber-200/70 bg-card/90">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge variant="outline" className="w-fit border-amber-200 bg-amber-500/10 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              History Prototype
            </Badge>
            <CardTitle className="text-3xl tracking-tight">Changes</CardTitle>
            <CardDescription className="max-w-3xl text-base leading-7">
              Hier landet später der eigentliche Mehrwert des Produkts: tägliche Website-Snapshots
              mit konkreten Diffs je URL. Der Kalender zeigt, an welchen Tagen überhaupt etwas
              passiert ist, und die Hauptliste erklärt die Änderung.
            </CardDescription>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-background/75 p-4">
              <p className="text-sm text-muted-foreground">Änderungstage</p>
              <p className="mt-2 text-2xl font-semibold">{availableDays.length}</p>
            </div>
            <div className="rounded-2xl border bg-background/75 p-4">
              <p className="text-sm text-muted-foreground">URLs am gewählten Tag</p>
              <p className="mt-2 text-2xl font-semibold">{changedUrlCount}</p>
            </div>
            <div className="rounded-2xl border bg-background/75 p-4">
              <p className="text-sm text-muted-foreground">Einträge am Tag</p>
              <p className="mt-2 text-2xl font-semibold">{selectedEntries.length}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                Change Calendar
              </CardTitle>
              <CardDescription>
                Markierte Tage enthalten erkannte Änderungen aus dem Daily Crawl.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-background/70 p-3">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  modifiers={{ changed: changedDates }}
                  modifiersClassNames={{
                    changed:
                      "border border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                  }}
                  className="w-full"
                />
              </div>
              <div className="rounded-2xl border bg-background/70 p-4 text-sm">
                <p className="font-medium">{formatDateLabel(selectedKey)}</p>
                <p className="mt-1 text-muted-foreground">
                  {selectedEntries.length} Einträge auf {changedUrlCount} URL
                  {changedUrlCount === 1 ? "" : "s"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Clock3 className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                Crawl Rhythmus
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl border bg-background/70 p-4">
                <p className="font-medium">{latestCompletedRun.label}</p>
                <p className="mt-1 text-muted-foreground">
                  Zuletzt abgeschlossen am {formatTimestamp(latestCompletedRun.finishedAt ?? latestCompletedRun.startedAt)}
                </p>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4 text-muted-foreground">
                V1-Entscheidung: ein Daily Crawl produziert genau einen Run pro Tag, damit die
                History-Ansicht kalenderbasiert und verständlich bleibt.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="min-h-[620px] bg-card/90">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <History className="h-5 w-5 text-sky-600 dark:text-sky-300" />
              Change Log
            </CardTitle>
            <CardDescription>
              Hauptliste für den ausgewählten Kalendertag: URL, geändertes Feld und der erkannte
              Vorher/Nachher-Zustand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[520px] pr-4">
              <div className="space-y-3">
                {selectedEntries.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border bg-background/75 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
                              changeTone(entry.type)
                            )}
                          >
                            {entry.type}
                          </span>
                          <span className="text-xs text-muted-foreground">{entry.field}</span>
                        </div>
                        <p className="break-all font-medium">{entry.url}</p>
                        <p className="text-sm text-muted-foreground">{entry.note}</p>
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground">
                        {formatTimestamp(entry.timestamp)}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl border bg-muted/40 p-3">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <FileDiff className="h-3.5 w-3.5" />
                          Vorher
                        </div>
                        <p className="mt-2 text-sm">{entry.before}</p>
                      </div>
                      <div className="rounded-2xl border bg-background p-3">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <FileDiff className="h-3.5 w-3.5" />
                          Nachher
                        </div>
                        <p className="mt-2 text-sm">{entry.after}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
