---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
milestone: M1
---

# Modul: Rankings

**Sidebar-Position:** Daten erkunden
**URL-Routing:** `/d/[id]/rankings` (Default = `combined`), `/d/[id]/rankings/query`, `/d/[id]/rankings/url`
**Build-Reihenfolge:** M1 (zusammen mit GSC-OAuth-Pipeline)
**Erbt aus:** [`module-view-pattern.md`](../04-ux-ui/module-view-pattern.md), [`layout-shell.md`](../04-ux-ui/layout-shell.md), [`states.md`](../04-ux-ui/states.md), [`ADR-0010`](../decisions/ADR-0010-gsc-live-in-m1.md)

## Zweck

GSC-Keyword-Rankings einer Domain aus drei Perspektiven sichtbar machen:

- **kombiniert** — *"Wie ranken wir aktuell?"* Bereinigte Sicht: ein Eintrag pro Keyword, höchstrankende URL gewinnt.
- **per Query** — *"Wie bewegt sich dieses eine Keyword?"* Zeitverlauf-Chart pro Keyword.
- **per URL** — *"Welche Keywords trägt diese eine Seite?"* URL-zentrische Aggregation mit Detail-Drill-Down.

Verschmilzt die v1-Module `rank-tracker` + `url-tracker` und fügt die „kombiniert"-Default-Sicht hinzu.

## Sub-Pages

### Kombiniert (Default) — `/d/[id]/rankings`

**Was zeigt es:**

Eine Tabelle, eine Zeile pro Keyword, die im aktuellen Time-Window mindestens den Impressions-Threshold erreicht. Für jedes Keyword: die *eine* URL, die im Window am besten gerankt hat (impressions-gewichtete Position via [`lib/gsc/aggregate.ts:weightedPosition`](../../lib/gsc/aggregate.ts)).

**Spalten:**

| Spalte | Quelle | Sortierbar | Default-Sort |
|---|---|---|---|
| Keyword | GSC.query | ✓ (asc/desc) | — |
| Pos | weighted avg position pro Keyword im Window | ✓ | asc |
| Δ Pos | Pos current − Pos prev_window | ✓ | — |
| URL | höchstrankende URL pro Keyword | — | — |
| Impr | GSC.impressions summiert | ✓ | desc (alt-default) |
| Δ Impr | Impr current − Impr prev_window | ✓ | — |
| Clicks | GSC.clicks summiert | ✓ | desc |
| Δ Clicks | Clicks current − Clicks prev_window | ✓ | — |
| CTR | clicks / impressions | ✓ | — |

Default-Sort: **Impr desc** (das wächst in der Praxis als „Welche Keywords tragen am meisten?").

**Δ-Berechnung:**

- `prev_window` = unmittelbar davor liegender, gleich langer Zeitraum. Bei DateRange = last 90d ist prev_window = vorhergehende 90d.
- Zweiter GSC-Call mit den prev-Window-Daten, parallel zum current-Window-Call (siehe Datenfluss).
- Wenn ein Keyword in prev_window nicht gerankt hat: `Δ Pos = neu`, `Δ Impr/Clicks` zeigen den absoluten Wert.
- Pos-Δ < 0 („Position besser") ist grün, > 0 („schlechter") ist rot. Für Impr/Clicks umgekehrt.

**Aggregations-Logik:**

1. GSC-Call mit `dimensions: ["query", "page"]`, rowLimit 25000.
2. Group by `query` — für jedes Keyword: alle URLs anschauen, die `weightedPosition` (über impressions-gewichteten Calls) liefert.
3. Pro Keyword: wähle die URL mit der besten Position (kleinster Wert).
4. Impressions und Clicks pro Keyword: **Summe über alle URLs** (nicht nur die Top-URL). Begründung: die Frage ist „wieviel Traffic bringt mir dieses Keyword?", nicht „wieviel Traffic bringt mir genau diese URL?".
5. Threshold-Filter: `defaultImpressionThreshold(daySpan)` aus [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts) — Keywords unter dem Threshold fallen raus.
6. Toggle „Show Cannibalized": wenn aktiv, zeige zusätzlich pro Keyword die 2./3.-besten URLs als verschachtelte Sub-Rows mit visueller Einrückung. Default: off.

**Filter:** siehe "FilterBar" unten.

**Cross-Refs:**

- Klick auf **Keyword-Zelle** → `/d/[id]/rankings/query?q=<keyword>` (springt in per Query mit fokussiertem Keyword).
- Klick auf **URL-Zelle** → `/d/[id]/rankings/url?u=<urlEncoded>` (springt in per URL mit fokussierter URL).
- Klick auf **expand-Icon einer Cannibalized-Sub-Row** → `/d/[id]/ranking-analysen/cannibalization?q=<keyword>` (springt direkt ins Kannibalisierungs-Modul mit dem Keyword).

### per Query — `/d/[id]/rankings/query`

**Quelle in v1:** [`app/(dashboard)/rank-tracker/page.tsx`](../../app/(dashboard)/rank-tracker/page.tsx). Layout-Anatomie 1:1 übernehmen.

**Was bleibt aus v1:**

- Layout: `PageHeader / FilterBar / StatsRow / SectionCard` (das ist v2's Module-View-Pattern).
- Charts: zwei `LineChart`-Instanzen aus [`components/dashboard/rank-charts.tsx`](../../components/dashboard/rank-charts.tsx) (fixed axis 1–100, dynamic axis nebeneinander).
- Charts cappen auf Top-15 Keywords (nach Impressions des Selection-Pools). Tabelle zeigt alle.
- Trend-Toggle, Y-Axis-Toggle (fixed/dynamic).
- Queries-Tabelle aus [`components/dashboard/queries-table.tsx`](../../components/dashboard/queries-table.tsx) (sortierbar).
- Initial: alle Queries vorausgewählt, User kann `QueryMultiSelect` reduzieren.

**Was ändert sich in v2:**

- **Threshold-Filter wird sichtbar** in `More…`-Dropdown (in v1 unsichtbar). Default = `defaultImpressionThreshold(daySpan)`, User kann überschreiben.
- **Cluster-Filter** in FilterBar (M5+, sobald Keyword Clustering existiert; bis dahin: ausgeblendet).
- **Device** und **Country** als FilterBar-Items von Anfang an (GSC liefert das out-of-the-box).
- **Pre-Select-Query über URL-Param `?q=<keyword>`** (kommt aus Cross-Ref der kombinierten Sicht): startet mit nur diesem Keyword selektiert.
- **Default-DateRange = last 90 days** (wie v1).
- **Trend-Toggle Default = ON** (in v1 OFF, aber neue UX-Konvention: Trend ist sinnvoller Default-State, wenn man auf eine Modul-Page kommt).
- Charts wandern in `components/charts/rank-charts.tsx` ohne `"dashboard"`-Subfolder (Modul-View-Pattern macht den Folder überflüssig).

**Filter-Spec siehe „FilterBar" unten.**

### per URL — `/d/[id]/rankings/url`

**Quelle in v1:** [`app/(dashboard)/url-tracker/page.tsx`](../../app/(dashboard)/url-tracker/page.tsx). 580-LOC-Single-File — **wird auf Komponenten zerlegt**.

**Was bleibt aus v1:**

- Tabelle mit 8 sortierbaren Spalten: URL, Impr, Clicks, CTR, Ø Pos, #KW, Top-Keyword, Traffic %.
- Client-side Aggregation aus `[page, query]`-Cross-Product (M1: bleibt client-side, da wir live lesen).
- Suche (URL/Keyword), Min-Impr, Min-Clicks, Top-N-Switcher.
- Detail-Sicht für eine URL: Verlaufschart + Keyword-Tabelle + MultiSelect-Filter.

**Was ändert sich in v2:**

- **Detail-Sicht in einem Slide-In-Drawer rechts** (max 60% Viewport-Breite, schließbar). Ersetzt v1's `FullscreenOverlay`. Drawer = shadcn `Sheet`.
- **URL-Param `?u=<urlEncoded>`** öffnet den Drawer initial mit dieser URL fokussiert.
- **Komponenten-Aufteilung:**
  - `components/rankings/url-table.tsx` (Haupt-Tabelle, sortierbar)
  - `components/rankings/url-detail-drawer.tsx` (Drawer-Container)
  - `components/rankings/url-detail-chart.tsx` (Verlaufschart innerhalb Drawer)
  - `components/rankings/url-detail-keywords.tsx` (Keyword-Tabelle innerhalb Drawer)
- **Threshold-Filter sichtbar** wie in per Query.
- **Sort-Logik aus v1 übernehmen** (3-State-Toggle: desc → asc → null).

## FilterBar (alle Sub-Pages teilen sich denselben Filter-State über URL-Search-Params)

Reihenfolge gemäß [`module-view-pattern.md`](../04-ux-ui/module-view-pattern.md):

1. **DateRange** — Picker, Default = last 90 days. Search-Param: `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Bei Wechsel: SWR triggered Re-Fetch.
2. **Cluster** — Multi-Picker, ausgeblendet bis Keyword Clustering existiert (M5+). Search-Param: `?cluster=<id>`.
3. **Device** — Tabs: All / Desktop / Mobile / Tablet. Default = All. Search-Param: `?device=`.
4. **Country** — Combobox mit ISO-Codes. Default = nicht gesetzt (= alle). Search-Param: `?country=`.
5. **More…** — Dropdown mit:
   - Min Impressions (Default = `defaultImpressionThreshold(daySpan)`)
   - Min Clicks (Default = 0)
   - Show Cannibalized (nur in `kombiniert`; Default = off)
   - Top N (nur in `per URL`; 200/500/all; Default = all)
6. **Reset** — setzt alle Search-Params auf Default-Werte.

**Wichtig:** FilterBar wird auf Parent-Modul-Ebene gerendert; alle Sub-Pages teilen denselben Filter-State über URL-Params. Wechsel zwischen Sub-Pages behalten Filter (außer sub-spezifische wie `Show Cannibalized`).

## Datenfluss (GSC live, ADR-0010)

**Single Source:** `/api/gsc/query` (Server Action oder API-Route), die GSC.SearchAnalytics.query proxied. Token-Handling via Better Auth (siehe M1-Spec).

**Kombinierte Sicht** macht **2 parallele Calls** (`Promise.all`):

```ts
// current-window
const current = gscQuery({
  siteUrl, startDate, endDate,
  dimensions: ["query", "page"], dimensionFilterGroups: [...filters],
  rowLimit: 25000
});
// prev-window (gleicher span, davor liegend)
const prev = gscQuery({
  siteUrl,
  startDate: shiftDate(startDate, -daySpan(startDate, endDate)),
  endDate: shiftDate(startDate, -1),
  dimensions: ["query", "page"], dimensionFilterGroups: [...filters],
  rowLimit: 25000
});
const [currentData, prevData] = await Promise.all([current, prev]);
// Aggregation client-side
```

**per Query, per URL** machen je einen Call:

- per Query: übernimmt v1 (`dimensions: ["query"]` + `dimensions: ["date", "query"]` für Series).
- per URL: übernimmt v1 (`dimensions: ["page", "query"]` für Tabelle, plus `dimensions: ["date", "query"]` + page-Filter im Detail-Drawer).

**SWR-Cache-Keys** identifizieren GSC-Calls durch `[siteUrl, startDate, endDate, dimensions, filters]`. Filter-Wechsel = cache miss = neuer Call. Sub-Page-Wechsel innerhalb desselben Filters = cache hit (instant).

## Action-Slot im PageHeader

- **Refresh** — `swr.mutate()` revalidiert die aktuellen Daten. Loading-State während, Toast bei Erfolg/Fehler. (Kein eigener Sync-Job in M1, da live.)
- *Später:* Export als CSV/Google-Sheet (Post-M1).

## States (siehe [`states.md`](../04-ux-ui/states.md))

| State | Wann | UI |
|---|---|---|
| Loading | Erst-Fetch und Filter-Wechsel | Skeleton matched (StatsRow + Tabelle/Chart) |
| Empty | Filter-Stand erzeugt 0 Keywords über Threshold | EmptyState mit „Filter zurücksetzen" |
| No-Data-Yet | GSC-OAuth noch nicht abgeschlossen | EmptyState „GSC verbinden" mit OAuth-Button |
| Error | GSC-Token expired, 401 | ErrorState „GSC-Verbindung abgelaufen", CTA „GSC neu verbinden" |
| Error | GSC-Rate-Limit, 429 | ErrorState „GSC-Quota erreicht", CTA „Erneut versuchen" |
| Error | 5xx | generischer ErrorState mit Retry |

**Stale** entfällt in M1 — alle Daten sind live.

## Geteilte Helfer aus v1 (müssen übernommen werden)

- [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts) — 1:1 portieren (`weightedPosition`, `defaultImpressionThreshold`, `daySpan`, `hasEnoughEvidence`, `dedupCannibalized`).
- [`lib/date-range.ts`](../../lib/date-range.ts) — `formatRange`, `getLastNMonthsRange`, `rangeToIso`.
- [`components/dashboard/queries-table.tsx`](../../components/dashboard/queries-table.tsx) — wandert zu `components/rankings/queries-table.tsx`, sonst unverändert.
- [`components/dashboard/rank-charts.tsx`](../../components/dashboard/rank-charts.tsx) — wandert zu `components/charts/rank-charts.tsx`.
- [`components/dashboard/query-multiselect.tsx`](../../components/dashboard/query-multiselect.tsx) — wandert zu `components/rankings/query-multiselect.tsx`.
- [`components/ui/month-preset-range-picker.tsx`](../../components/ui/month-preset-range-picker.tsx) — generisch genug für alle Module, bleibt in `components/ui/`.
- [`components/dashboard/sortable-header.tsx`](../../components/dashboard/sortable-header.tsx) — wandert zu `components/ui/sortable-header.tsx` (mehrere Module brauchen es).

## Was aus v1 entfällt

- `components/dashboard/page-shell.tsx` — wird obsolet, ersetzt durch generischen Module-View-Layout-Wrapper im `app/d/[id]/layout.tsx`.
- `components/dashboard/site-context.tsx` — entfällt, Domain ist URL-getrieben (ADR-0007).
- `components/dashboard/property-menu.tsx` — entfällt, Domain-Switcher ist im Sidebar-Header.
- `components/ui/fullscreen-overlay.tsx` — entfällt (in per URL durch Slide-In-Drawer ersetzt).
- v1's getrennte Routes `/rank-tracker` und `/url-tracker` — konsolidiert in `/d/[id]/rankings/{query,url}`.

## Offen / TBD (vor Implementierung klären)

- **Cross-Modul-Filter-Sharing:** wenn User in `Ranking-Analysen/Top Mover` ist und einen Filter-Stand hält, dann zu `Rankings` wechselt — übertragen wir die Filter? Vermutlich ja (URL-Params sind ja shared, wenn Param-Namen übereinstimmen). Klare Konvention im nächsten Modul-Spec (Ranking-Analysen).
- **Country-Code-Quelle:** ISO-3166-Alpha-2 oder GSC-Format (3-Letter)? GSC nutzt 3-Letter. Wir konvertieren oder übernehmen 3-Letter? → übernehmen GSC-Format, da Filter direkt durchgereicht wird.
- **rowLimit-Strategie:** GSC erlaubt bis 25000. Bei sehr großen Sites könnte das nicht reichen. Paginierung mit `startRow` einbauen oder erst hochziehen wenn ein Real-User es triggert?
- **Pre-Window-Verschiebung um GSC-Reporting-Lag (~2–3 Tage):** wenn `endDate = today`, hat current-Window noch unvollständige Daten. Sollte sich `endDate` automatisch um 3 Tage zurück verschieben? GSC liefert häufig „unfinished"-Markierungen — v1 ignoriert das. v2: erstmal so lassen, später zu klären.
- **Cluster-Filter-Verhalten in M1:** vor Keyword Clustering existiert kein Cluster-Mapping. Filter komplett ausblenden oder als disabled mit Tooltip „Clustering noch nicht aktiv"? → ausblenden.
- **Action-Slot-Stale-Indikator:** ohne Snapshots ist Stale nicht definiert. „zuletzt geladen vor X min" basiert auf SWR-Cache-Timestamp — will wir das zeigen? Eher nicht.
