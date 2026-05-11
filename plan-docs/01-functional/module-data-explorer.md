---
status: erstversion
last-updated: 2026-05-11
owner: claude (zur Review durch user)
milestone: M1
---

# Modul: Data Explorer

**Sidebar-Position:** Daten erkunden (nach Rankings, vor Crawl & Track)
**URL-Routing:** `/d/[id]/data-explorer`
**Build-Reihenfolge:** M1 (zusammen mit Rankings — teilt GSC-Pipeline + Helfer)
**Erbt aus:** [`module-view-pattern.md`](../04-ux-ui/module-view-pattern.md), [`layout-shell.md`](../04-ux-ui/layout-shell.md), [`states.md`](../04-ux-ui/states.md), [`ADR-0010`](../decisions/ADR-0010-gsc-live-in-m1.md)

## Zweck

Freie, schmale Roh-Daten-Sicht auf GSC mit `query × page`-Granularität und scharfen Long-Tail-Filtern. Power-User-Werkzeug für die Fragen:

- *"Welche Long-Tail-Keywords laufen unter dem Radar, und auf welcher URL?"*
- *"Welche URLs ziehen für ein Keyword Traffic neben der best-rankenden Seite?"*
- *"Welche Keywords mit mind. 4 Wörtern, die `kaufen` enthalten, aber `gratis` nicht, bekomme ich über 50 Impressionen?"*

**Klare Abgrenzung zu Rankings/Combined:**

| Aspekt | Rankings/Combined | Data Explorer |
|---|---|---|
| Granularität | 1 Zeile pro **Keyword** (deduped) | 1 Zeile pro **`query × page`** (roh) |
| Δ-Spalten | ja (current vs. prev-Window) | nein (single-Window) |
| Drill-Down | Cross-Ref zu per Query / per URL | inline (Selected-Keyword / Selected-Page Modus) |
| Use-Case | "Wo stehe ich aktuell?" | "Welche Long-Tails kann ich entdecken?" |

Beide nutzen denselben GSC-Call (`dimensions: ["query", "page"]`); SWR-Cache teilt zwischen den Modulen, wenn Filter identisch sind.

## Layout

Single-Page-Modul. Keine Sub-Tab-Bar. Anatomie folgt [`module-view-pattern.md`](../04-ux-ui/module-view-pattern.md):

```
PageHeader (Titel + Action-Slot: Export, Refresh)
FilterBar (eine Zeile; Reihenfolge unten)
StatsRow (badges)
SectionCard → ExplorerTable
```

## Tabelle

**Spalten (fix, 6 Spalten):**

| Spalte | Quelle | Sortierbar | Default-Sort |
|---|---|---|---|
| Keyword | `keys[0]` | — (alphabetisch, kein Use-Case) | — |
| Pos | `position` | ✓ (asc/desc) | — |
| Impr | `impressions` | ✓ (asc/desc/null) | desc (default) |
| Clicks | `clicks` | ✓ (asc/desc/null) | — |
| CTR | `clicks / impressions` | ✓ (asc/desc/null) | — |
| URL | `keys[1]` (kurze slug-Anzeige; voller URL im title-Tooltip) | — | — |

Default-Sort: **Impr desc**, wie v1.

**3-State-Sort-Toggle:** desc → asc → null → desc, über [`components/ui/sortable-header.tsx`](../../components/ui/sortable-header.tsx) (aus v1 portiert).

**Selektion (Inline-Drill-Down):**

Klick auf eine **Keyword-Zelle** → setzt `?focusKeyword=<keyword>`:
- Tabelle filtert auf alle Zeilen mit diesem Keyword.
- Spalten-Header `Keyword` wird ausgeblendet (jede Zeile wäre ja gleich); stattdessen wird die URL-Spalte zur ersten Spalte.
- StatsRow bekommt eine zusätzliche Pill `Filter: <keyword>` mit Schließen-Button (clear-`?focusKeyword`).

Klick auf eine **URL-Zelle** → setzt `?focusPage=<urlEncoded>`:
- Tabelle filtert auf alle Zeilen mit dieser URL.
- Spalten-Header `URL` wird ausgeblendet; Keyword-Spalte bleibt erste Spalte.
- StatsRow bekommt eine Pill `Filter: <url-slug>` mit Schließen-Button.

**Mutex:** `focusKeyword` und `focusPage` sind exklusiv — das Setzen des einen löscht das andere (gleiche Logik wie v1). Beide werden bei `Reset` aus FilterBar gelöscht.

**Cross-Refs ein:**
- `/d/[id]/data-explorer?focusKeyword=<kw>` (z.B. aus Rankings-Combined-Sicht als Sekundär-Aktion "Im Data Explorer untersuchen")
- `/d/[id]/data-explorer?focusPage=<urlEncoded>` (z.B. aus Rankings-per-URL-Drawer)

## FilterBar

Reihenfolge gemäß [`module-view-pattern.md`](../04-ux-ui/module-view-pattern.md):

1. **DateRange** — Picker, Default = **last 90 days**. Search-Param: `?from=YYYY-MM-DD&to=YYYY-MM-DD`. (v1-Default war `getLastNMonthsRange(3)` → normalisiert auf `last 90d`, konsistent mit Rankings.)
2. **Suche** — Input "Keyword suchen" (substring-Match auf Keyword). Search-Param: `?q=<text>`.
3. **Min. Impressions** — Number-Input. Default = `defaultImpressionThreshold(daySpan)` aus [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts). Search-Param: `?minImpr=<n>`. **Wichtig:** wenn User den Default nicht angefasst hat (`minImpr`-Param fehlt in URL), wird der berechnete Default beim DateRange-Wechsel automatisch neu ausgerechnet — wie in v1 mit dem `minImpressionsTouched`-State.
4. **Kannibalis.-Toleranz** — Number-Input, Default = `0`. Search-Param: `?cannibalTol=<n>`. Funktioniert via [`dedupCannibalized()`](../../lib/gsc/aggregate.ts) aus v1 portiert. Tooltip-Text aus v1 übernehmen.
5. **Device** *(neu in v2)* — Tabs: All / Desktop / Mobile / Tablet. Default = All. Search-Param: `?device=`. Filter wird im GSC-Call als `dimensionFilterGroups` durchgereicht.
6. **Country** *(neu in v2)* — Combobox mit GSC-3-Letter-Codes. Default = nicht gesetzt. Search-Param: `?country=`. Hier wie in Rankings: GSC-Format durchreichen, nicht ISO-2.
7. **More…** — Popover (wie v1) mit:
   - **Keyword enthält** — substring. Search-Param: `?contains=<text>`.
   - **Keyword enthält nicht** — substring (negiert). Search-Param: `?notContains=<text>`.
   - **Min. Wortanzahl** — Number-Input. Search-Param: `?minWords=<n>`.
   - Popover-internes "Zurücksetzen" löscht nur diese drei Params, schließt das Popover.
8. **Reset** — setzt alle Search-Params auf Default (inkl. `focusKeyword`, `focusPage`).

**Cluster-Filter** (analog Rankings): **ausgeblendet** bis Keyword Clustering existiert (M5+).

**Filter-Logik (1:1 v1):**
1. Text-/Word-/Page-/Keyword-Filter (alles client-seitig auf den GSC-Rows).
2. Hard-Cutoff: `impressions >= minImpr`. Zählt als `droppedLow` in StatsRow.
3. Kannibalisierungs-Dedup via `dedupCannibalized(rows, tol, q→keys[0], q→position)`. Zählt als `droppedCannibal` in StatsRow.

Stats und Tabelle konsumieren beide den final-gefilterten Stand — d.h. eine ausgefilterte Zeile zählt **nicht** in Ø Position rein. (Wichtig für ehrliche Stats.)

## StatsRow

Badges (alle als shadcn `Badge variant="secondary"`):

- `Zeitraum: <formatRange>`
- `Keywords: <count>` (filtered.length)
- `Impressions: <de-DE-locale>`
- `Clicks: <de-DE-locale>`
- `Ø Position: <0.1>` — **impression-gewichteter** Durchschnitt, nicht arithmetisch. Tooltip-Text aus v1: "ein Keyword mit 10.000 Impressionen zählt 100× mehr als eines mit 100".
- `Ø CTR: <0.1>%` — `clicks_total / impressions_total × 100`. **Nicht** Mittelwert der CTRs (v1-Konvention, bleibt).
- `< Min. Impr.: <droppedLow>` — nur wenn > 0. Tooltip beschreibt, was rausgefiltert wurde.
- `Kannibalisiert: <droppedCannibal>` — nur wenn > 0 und `cannibalTol > 0`. Tooltip beschreibt, was als Kannibalisierung gewertet wurde.
- `Filter: <focusKeyword|focusPage>` — nur wenn aktiv. Klickbar zum Aufheben.

## Datenfluss (GSC live, ADR-0010)

**Single GSC-Call:**

```ts
const data = await gscQuery({
  siteUrl, startDate, endDate,
  dimensions: ["query", "page"],
  dimensionFilterGroups: filtersFromUrl(device, country),
  rowLimit: 25000
});
```

**SWR-Cache-Key:** `["/api/gsc/query", siteUrl, startDate, endDate, dimensions, device, country]`. Filter-Wechsel auf `q/contains/notContains/minWords/minImpr/cannibalTol/focusKeyword/focusPage` triggern **keinen** GSC-Re-Fetch — das ist alles client-seitige Filterung der bestehenden 25k Rows. Nur Zeitraum-, Device- und Country-Wechsel lösen einen neuen Call aus.

**Cache-Teilung mit Rankings:** Rankings/Combined nutzt denselben Cache-Key (mit prev-Window-Call als zweitem Key). Wenn der User von Rankings/Combined zu Data Explorer wechselt und der DateRange identisch ist, kommt die current-Window-Antwort **instant** aus dem Cache.

## Action-Slot im PageHeader

- **Export (Excel/CSV)** — übernommen aus v1's `exportCsv()`. UTF-8-BOM + komma-getrennt; Header `Query, Position, Impressions, Clicks, Page`. **In v2 ergänzen:** CTR-Spalte; Date-Range im Filename (`data-explorer-2026-02-11-bis-2026-05-11.csv`).
- **Refresh** — `swr.mutate()`. Toast bei Erfolg/Fehler.
- *Später (post-M1):* Export Google-Sheet (gleiche Auth, hängt an Google-OAuth-Refresh).

## URL-Search-Params (vollständig)

| Param | Default | Zweck |
|---|---|---|
| `from`, `to` | `last 90d` | DateRange |
| `q` | leer | Keyword-Suche (substring) |
| `contains` | leer | Keyword enthält (substring) |
| `notContains` | leer | Keyword enthält nicht (substring) |
| `minWords` | leer | Mindest-Wortanzahl im Keyword |
| `minImpr` | berechnet aus `daySpan` | Hard-Cutoff Impressions |
| `cannibalTol` | `0` | Kannibalisierungs-Toleranz |
| `device` | leer (= All) | GSC-Filter |
| `country` | leer (= alle) | GSC-Filter |
| `focusKeyword` | leer | Inline-Drill-Down auf ein Keyword |
| `focusPage` | leer | Inline-Drill-Down auf eine URL |
| `sort` | `impr` | Sort-Spalte |
| `dir` | `desc` | Sort-Richtung |

**`focusKeyword` und `focusPage` sind mutex** — das Setzen des einen entfernt den anderen aus der URL.

## States (siehe [`states.md`](../04-ux-ui/states.md))

| State | Wann | UI |
|---|---|---|
| Loading | Erst-Fetch und Filter-Wechsel (Zeitraum/Device/Country) | Skeleton matched (StatsRow-Placeholder + Tabellen-Skeleton h-[500px]) |
| Empty | Filter-Stand erzeugt 0 Zeilen über Threshold | EmptyState mit "Filter zurücksetzen"-Button (clear all Search-Params) |
| No-Data-Yet | GSC-OAuth noch nicht abgeschlossen | EmptyState "GSC verbinden" mit OAuth-Button (gleiche Komponente wie Rankings) |
| Error | GSC-Token expired, 401 | ErrorState "GSC-Verbindung abgelaufen", CTA "GSC neu verbinden" |
| Error | GSC-Rate-Limit, 429 | ErrorState "GSC-Quota erreicht", CTA "Erneut versuchen" |
| Error | 5xx / Netzwerk | generischer ErrorState mit Retry |

**Stale** entfällt in M1 — alle Daten sind live.

## Geteilte Helfer aus v1 (müssen übernommen werden)

- [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts) — `defaultImpressionThreshold`, `daySpan`, `dedupCannibalized`. **Schon in Rankings-Spec als Pflicht markiert.**
- [`lib/date-range.ts`](../../lib/date-range.ts) — `formatRange`, `rangeToIso`, `getLastNMonthsRange`. **Schon in Rankings-Spec.**
- [`components/dashboard/data-explorer-table.tsx`](../../components/dashboard/data-explorer-table.tsx) — wandert zu `components/data-explorer/explorer-table.tsx`. Refactor:
  - Spalten-Set erweitern um CTR.
  - `selectedPage`/`selectedKeyword` aus React-State entfernt — URL-Param-driven.
  - `useSite()` raus, `siteUrl` kommt aus dem `/d/[id]/`-Context.
  - CSV-Export-Funktion bleibt, plus CTR-Spalte + Date im Filename.
- [`components/ui/sortable-header.tsx`](../../components/ui/sortable-header.tsx) — generisch, wandert zu `components/ui/`. **Schon in Rankings-Spec.**
- [`components/ui/month-preset-range-picker.tsx`](../../components/ui/month-preset-range-picker.tsx) — bleibt in `components/ui/`. **Schon in Rankings-Spec.**

## Was aus v1 entfällt

- `useSite()`, `SiteContext` — URL-getrieben über `/d/[id]/...` (ADR-0007).
- React-State für Filter (`search`, `contains`, `notContains`, `minWords`, `selectedPage`, `selectedKeyword`, `minImpressions`, `cannibalTolerance`) — alles in URL-Params.
- `toasted.current`-Ref für OAuth-Hinweis — OAuth-Hinweis ist eine globale Layout-Shell-Sache, nicht modulspezifisch.
- `components/dashboard/page-shell.tsx` (PageHeader/FilterBar/SectionCard/StatsRow) — ersetzt durch das Module-View-Pattern.
- Inline-`fetcher` und manuelle `useEffect`-Fetches — ersetzt durch SWR (wie Rankings).

## Offen / TBD

- **URL-Filter (contains / not-contains auf der `page`-Dimension):** symmetrisch zur Keyword-Suche wäre sinnvoll, in v1 nicht vorhanden. Nicht in M1, in M2-Review.
- **Min/Max-Wortanzahl:** v1 hat nur Min. Max wäre symmetrisch ("Brand-Keywords ausblenden = max 1 Wort weg"). Nicht in M1.
- **Saved Views (Filter-Presets):** Power-User-Feature. Ist eher ein Strategy-Modul-Konstrukt (gespeicherte Findings). Nicht in M1.
- **Spalten-Hide/Reorder:** v1 hatte das nicht, der Feature-Inventory-Eintrag suggeriert es — das ist eine Ungenauigkeit, die jetzt mit diesem Spec aufgelöst ist. Falls Bedarf entsteht, M2+.
- **CTR-Spalten-Hervorhebung:** Zeilen mit hoher Position und niedriger CTR sind Snippet-Optimierungs-Kandidaten (das ist genau Position-vs-CTR-Modul). Brauchen wir hier eine Spalten-Markierung oder einen Quick-Sort-Preset "Snippet-Kandidaten"? → vermutlich nicht; Position-vs-CTR ist dafür da. Trotzdem im UX-Review prüfen.
- **Cross-Refs raus aus Data Explorer:** Klick auf Keyword/URL bleibt inline. Eine Sekundär-Action "Öffne in Rankings-per-Query/per-URL" könnte nützlich sein (Context-Menu rechts-klick oder Icon-Button). → M2-Review.
- **GSC-Reporting-Lag (~2–3 Tage):** wenn `endDate = today`, hat current-Window unvollständige Daten. v1 ignoriert das. Konsistent zu Rankings-Spec: erstmal so lassen.
- **rowLimit-Strategie:** identisch zu Rankings — GSC erlaubt bis 25000, Paginierung mit `startRow` erst wenn ein realer User es triggert.
