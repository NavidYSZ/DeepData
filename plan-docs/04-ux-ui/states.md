---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# States: Empty / Loading / Error / Stale / No-Data-Yet

Konsistente UI-Sprache für nicht-Happy-Path-Zustände. Jeder Modul-Spec referenziert dieses Doc — spezifiziert wird im Modul-Spec nur, **welche** States dort auftreten und mit welchen Texten.

## Loading

Wenn Daten gerade geladen werden.

- **Skeleton-Komponenten** matched zur Modul-Anatomie:
  - `<Skeleton className="h-6 w-32" />` für Header-Titel
  - StatsRow: 4 × `<Skeleton className="h-24" />`
  - Tabellen: `<Skeleton className="h-10" />` pro Zeile, 5–7 Zeilen
  - Charts: `<Skeleton className="h-80" />` als Block
- **Kein Spinner** als alleiniger Loading-State für ganze Pages. Spinner nur für Inline-Actions (Re-Sync-Button etc.).
- **Filter-Wechsel:** SectionCard-Body wird Skeleton, FilterBar bleibt interaktiv.

## Empty (kein Match für aktuelle Filter)

Daten sind da, aber der Filter-Stand erzeugt 0 Treffer.

```
┌─ SectionCard ────────────────────────────┐
│                                              │
│        [icon Search-X / Filter-X]            │
│        Keine Treffer                         │
│        Mit den aktuellen Filtern hat keine   │
│        URL/kein Cluster... Treffer.          │
│                                              │
│        [Filter zurücksetzen]                 │
│                                              │
└──────────────────────────────────────────┘
```

- Icon: Lucide `search-x` / `filter-x`
- Headline: „Keine Treffer"
- Subtext: was eingestellt ist („in den letzten 28 Tagen, Cluster X, Mobile")
- CTA: „Filter zurücksetzen" (setzt Filter auf Default)

## No-Data-Yet (Modul wartet auf erstmaligen Sync)

Fundamental anders als Empty: Hier ist die **Pipeline noch nie gelaufen**.

```
┌─ SectionCard ────────────────────────────┐
│                                              │
│        [icon Loader-Circle / Hourglass]      │
│        Daten werden gesammelt                │
│        Wir holen die ersten GSC-Daten für    │
│        diese Domain. In der Regel ~5 Min.    │
│                                              │
│        [Status anschauen]  oder              │
│        [Sync jetzt erzwingen]                │
│                                              │
└──────────────────────────────────────────┘
```

- Icon: Lucide `loader-circle` (animate) oder `hourglass`
- Headline: „Daten werden gesammelt"
- Subtext: was läuft, Erwartungszeit
- CTAs: Status anschauen (öffnet Sync-Dashboard oder Domain-Settings), Sync erzwingen.

Gilt v.a. für Module wie Crawl & Track (initial Crawl läuft), Internal Links (wartet auf Crawl-Ergebnis), Rankings (wartet auf GSC-Sync).

## Error

Daten konnten nicht geladen werden.

```
┌─ SectionCard ────────────────────────────┐
│                                              │
│        [icon Triangle-Alert]                 │
│        Konnte nicht laden                    │
│        <Reason>                               │
│                                              │
│        [Erneut versuchen]                    │
│                                              │
└──────────────────────────────────────────┘
```

- Icon: Lucide `triangle-alert`
- Headline: „Konnte nicht laden"
- **Reason** — ist konkret, aber nicht-technisch. Zum Beispiel:
  - „GSC-Verbindung abgelaufen." (CTA: „GSC neu verbinden" → OAuth)
  - „Crawler-Job ist fehlgeschlagen." (CTA: „Erneut versuchen")
  - „Unerwarteter Server-Fehler." (CTA: „Erneut versuchen")
- Für User unlösbare Fehler: zusätzlich „Fehler-ID kopieren" + Hinweis auf Support

## Stale

Daten sind da, aber alt.

```
┌─ oberhalb der SectionCard ────────────────────┐
│ ⚠ Zuletzt aktualisiert vor 9 Tagen.  [Sync] │
└──────────────────────────────────────────────────────────┘
```

- Subtle Banner (warning-yellow) oberhalb der SectionCard, **nicht** statt der Daten.
- Threshold pro Modul (im Modul-Spec festgehalten):
  - GSC-Daten: stale > 3 Tage seit letztem Sync
  - Crawl-Daten: stale > 7 Tage seit letztem Crawl
- CTA: „Sync" (triggert sofort einen Sync; UI wechselt in Loading-State der entsprechenden Sektion).

## Toast-Sprache

Für nicht-blockierende Erfolg/Misserfolg-Signale: shadcn-Toaster.

- **Success-Toast** bei erfolgreichen Aktionen (Sync gestartet, Strategy-Finding gespeichert, Cluster gemerged).
- **Error-Toast** bei Fehlern, die die Page nicht ganz blockieren (Save-Konflikt, Validation-Error). Mit „Details" aufklappbar.
- **Kein Toast** für Loading-Start (das ist Skeleton-Aufgabe).

## States im Modul-Spec festhalten

Im Modul-Spec wird angegeben:

- Welche States das Modul kennt (üblicherweise alle außer Stale wenn live-Daten)
- Spezifische Reasons im Error-State
- Stale-Threshold (wenn abweichend)
- Spezifische Empty-Texte (was war eingestellt)
