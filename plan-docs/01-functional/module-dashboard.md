---
status: erstversion
last-updated: 2026-05-11
owner: claude (zur Review durch user)
milestone: M1
---

# Modul: Dashboard

**Sidebar-Position:** Überblick (oberste Gruppe, erstes Modul)
**URL-Routing:** `/d/[id]` — Default-Page direkt unter dem Domain-Layout, kein `/dashboard`-Suffix (siehe [`sidebar-07.md`](../04-ux-ui/sidebar-07.md)).
**Build-Reihenfolge:** M1, parallel zu [`module-rankings.md`](module-rankings.md)
**Erbt aus:** [`module-view-pattern.md`](../04-ux-ui/module-view-pattern.md), [`layout-shell.md`](../04-ux-ui/layout-shell.md), [`states.md`](../04-ux-ui/states.md), [`design-system.md`](../04-ux-ui/design-system.md), [ADR-0010](../decisions/ADR-0010-gsc-live-in-m1.md)

## Zweck

Domain-Landing-Page. Zwei Fragen sofort beim Öffnen einer Domain beantworten:

1. **Wie läuft die Domain gerade?** Headline-KPIs Clicks / Impressions / CTR / Ø Position für den gewählten Window.
2. **Wo ändert sich was?** Δ zum Vorperioden-Window auf jedem KPI, Performance-Verlaufschart, Top-10-Queries als Einstieg in Rankings.

Tiefen-Analyse erfolgt in den Spezial-Modulen (Rankings für Query-/URL-Drilldown, Data Explorer für freie GSC-Aggregationen, Strategy/Crawl & Track für Inhalts-Themen). Dashboard ist bewusst kein Allround-View.

Übernimmt das funktionierende v1-Performance-Modul ([`app/(dashboard)/dashboard/page.tsx`](../../app/(dashboard)/dashboard/page.tsx)) und erweitert es um Δ-Werte und Top-Queries als Cross-Reference.

## Anatomie

Folgt [`module-view-pattern.md`](../04-ux-ui/module-view-pattern.md) (PageHeader · FilterBar · StatsRow · SectionCard). Keine SubTabBar (Dashboard ist Single-Page).

```
┌─ ModulePageHeader ─────────────────────────────────────┐
│ Dashboard                                  [Refresh ⟳] │
│ Performance-Überblick der Domain                       │
├─ FilterBar ────────────────────────────────────────────┤
│ [DateRange: Last 90d] [Device: All] [Country: All]  [Reset] │
├─ StatsRow (4 Tiles) ───────────────────────────────────┤
│ ┌───────┬───────┬───────┬───────┐                       │
│ │Clicks │ Impr  │  CTR  │ Ø Pos │                       │
│ │12.345 │234.567│ 5,3 % │  12,4 │                       │
│ │↑+12 % │↑ +8 % │↑+0,4pp│↑ −0,7 │                       │
│ └───────┴───────┴───────┴───────┘                       │
├─ SectionCard: Performance-Verlauf ─────────────────────┤
│ Legend-Toggle: [• Klicks] [• Impressionen] [○ CTR]    │
│ ┌──────────────────────────────────────────────────┐  │
│ │ Multi-Axis LineChart                             │  │
│ │  X = Datum, Y links/rechts je Metrik             │  │
│ └──────────────────────────────────────────────────┘  │
├─ SectionCard: Top-Queries ─────────────────────────────┤
│ Query | Clicks | Impr | CTR | Pos                      │
│ (Top 10 nach Klicks; Klick auf Zeile → Rankings/query) │
│                          [Alle Queries ansehen →]      │
└────────────────────────────────────────────────────────┘
```

## FilterBar

Drei Items, Reihenfolge nach Konvention aus [`module-view-pattern.md`](../04-ux-ui/module-view-pattern.md):

1. **DateRange** — Picker mit Presets *Last 28 days · Last 90 days **(Default)** · Last 6 months · Last 12 months · Custom*. Search-Params `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Default-Window = `last 90 days` (konsistent mit [`module-rankings.md`](module-rankings.md)).
2. **Device** — Tabs *All / Desktop / Mobile / Tablet*. Default = All. Search-Param `?device=`.
3. **Country** — Combobox mit ISO-Codes (GSC-Format, 3-Letter). Default = nicht gesetzt (alle Länder). Search-Param `?country=`.

Kein Cluster-Filter (Dashboard zeigt Domain-Aggregat; Cluster-Filtern verfälscht die Headline-Sicht — Cluster-Drilldown gehört in [`module-rankings.md`](module-rankings.md)). Kein More…-Dropdown (kein Threshold nötig: Top-10-Queries sind eh die Top-10).

**Reset** setzt alle Search-Params auf Default-Werte zurück.

## Action-Slot (PageHeader, rechts)

- **Refresh** — Icon-Button (Lucide `RefreshCw`). Triggert `swr.mutate()` auf alle Dashboard-Queries. Kein Sync-Job, kein Toast außer bei Fehler (Konsistenz mit [`module-rankings.md`](module-rankings.md) und [ADR-0010](../decisions/ADR-0010-gsc-live-in-m1.md)).

## StatsRow

Vier KPI-Tiles in einer Zeile (mobile: 2×2-Grid). Pro Tile:

- **Label** + Icon (Lucide: `MousePointerClick`, `Search`, `TrendingUp`, `Target`)
- **Value** im aktuellen Window, de-DE-formatiert: Clicks/Impr als Tausender-Punkt, CTR als `5,3 %`, Pos als `12,4`
- **Δ-Indikator** — Pfeil + relative Änderung zum Vorperioden-Window:
  - Clicks/Impressions: `↑ +12 %` / `↓ −8 %`
  - CTR: `↑ +0,4 pp` / `↓ −0,2 pp` (Prozentpunkte)
  - Position: `↑ −0,7` / `↓ +1,2` — bei Position ist *niedriger = besser*. Pfeil-Up bei Verbesserung (Position sinkt). Farbe grün bei Verbesserung, rot bei Verschlechterung — invers zur Vorzeichen-Logik. Drei Signale (Pfeil + Farbe + Vorzeichen) sichern A11y.
- **Δ-Caption**: „ggü. vorherigen 90 Tagen" (oder dem aktiven Window-Label)
- Skeleton-State während Fetch

**Vorperioden-Window** = gleicher Tagesumfang direkt vor dem aktiven Window. Für `last 90 days` heute = `2026-02-10..2026-05-10` ist die Vorperiode `2025-11-12..2026-02-09`. Custom-Ranges analog.

**Position-Berechnung** (Impression-gewichtet, nicht arithmetisch):

```
position = Σ (impressions_i × position_i) / Σ impressions_i
```

GSC liefert Position pro Tag bereits als gewichteter Mittelwert über die Impressions des Tages. Über mehrere Tage zusammenfassen erfordert erneutes Gewichten. Helper `weightedPosition()` aus [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts) liefert die Berechnung (von [`module-rankings.md`](module-rankings.md) bereits verwendet, hier wiederverwenden).

## SectionCard: Performance-Verlauf

Übernimmt v1's Multi-Metric-LineChart (Recharts) funktional 1:1, visuell angepasst:

- **Toggle-Legend statt Toggle-Cards**: v1 hat drei große Toggle-Cards mit Total-Werten oben. In v2 sind die Werte schon in der StatsRow — die Toggle-Karten würden doppeln. Stattdessen: kompakte Pill-Buttons unter dem Card-Header (Farbpunkt + Label + Checkbox-Indikator).
- **Default-Sichtbarkeit**: Klicks **on**, Impressionen **on**, CTR **off**. Mindestens eine Metrik bleibt immer aktiv (Click auf letzte aktive wird ignoriert).
- **Multi-Axis**: bis zu 2 Y-Achsen (links/rechts) auf Desktop; auf Mobile nur die erste aktive Metrik bekommt eine Y-Achse.
- **X-Achse**: numerisch (`dateNum` = ms-Timestamp), formatiert als `DD.MM`. Domain `dataMin..dataMax`.
- **Tooltip**: Datum + alle aktiven Metriken mit korrekter Formatierung (Klicks/Impr als Integer mit `toLocaleString("de-DE")`, CTR als `5,30 %`).
- **Datenauffüllung**: Tage ohne GSC-Daten in der Mitte des Windows = `0`. **Trailing**-Tage ohne Daten (wegen GSC-Latenz von ~2–3 Tagen) werden abgeschnitten — nicht als 0 dargestellt. Logik aus v1's `buildPerformanceSeries`.
- **Loading**: Recharts-Container behält Höhe, innen Skeleton.
- **Höhe**: `h-[260px]` mobile, `h-[360px]` desktop (wie v1).

## SectionCard: Top-Queries

- **Quelle**: GSC-Call mit `dimensions=["query"]`, gesamtes Window aggregiert, `rowLimit=10`. GSC sortiert default nach Clicks descending.
- **Spalten**: Query (links, truncate mit Tooltip bei Overflow) · Clicks (rechtsbündig) · Impressions (rechtsbündig) · CTR (rechtsbündig, `5,3 %`) · Position (rechtsbündig, `12,4`).
- **Klick auf Query-Zeile**: navigiert zu `/d/[id]/rankings/query?q=<encoded>` (vorbefüllter Query-Pre-Select in [`module-rankings.md`](module-rankings.md)).
- **Footer-Link**: „Alle Queries ansehen →" rechtsbündig im Card-Footer, navigiert zu `/d/[id]/rankings` (kombinierte Sicht ohne Pre-Select).
- **Empty-State**: „Keine Query-Daten im gewählten Zeitraum." (passiert bei sehr neuen Domains oder leeren Windows).
- **Skeleton**: 10 Skeleton-Zeilen während Fetch.

## Datenfluss (GSC live, [ADR-0010](../decisions/ADR-0010-gsc-live-in-m1.md))

Drei parallele GSC-Calls beim Initial-Load (`Promise.all`). Alle gehen über das v1-Backend `/api/gsc/query` (Server Action), Token-Refresh via Better Auth (siehe [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md)).

| Fetch | Body | SWR-Cache-Key |
|---|---|---|
| Performance current | `{ siteUrl, startDate, endDate, dimensions: ["date"], rowLimit: 1000 }` | `gsc:perf:{siteUrl}:{from}:{to}:{device}:{country}` |
| Performance previous | wie oben mit `prevFrom`/`prevTo` (gleicher Span, davor) | `gsc:perf:{siteUrl}:{prevFrom}:{prevTo}:{device}:{country}` |
| Top Queries | `{ siteUrl, startDate, endDate, dimensions: ["query"], rowLimit: 10 }` | `gsc:topQueries:{siteUrl}:{from}:{to}:{device}:{country}` |

**KPI-Aggregation client-seitig:**

```ts
totals.current  = sum(currentSeries[*].clicks/impressions)
totals.previous = sum(previousSeries[*].clicks/impressions)
ctr.current     = totals.current.clicks / totals.current.impressions
position.current= sum(impressions × position) / sum(impressions)   // gewichtet
delta.clicks    = (current − previous) / previous   // Prozent
delta.position  = current − previous                // absolut, in Plätzen
```

**SWR-Konfig:**

- `revalidateOnFocus: false` (GSC-Latenz macht häufiges Revalidate sinnlos)
- `dedupingInterval: 60_000` (1 Min)
- `keepPreviousData: true` (smoother Filter-/Range-Wechsel)

## Voraussetzung: GSC-OAuth aktiv

Globale Voraussetzung für **alle** GSC-basierten Module (Dashboard, Rankings, Data Explorer, Ranking-Analysen). Detail-Verhalten und Modal-Spec in [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md), Erst-Verbindungs-Flow in [`../02-user-flows/onboarding.md`](../02-user-flows/onboarding.md).

Wenn die aktive Domain keine GSC-Property verbunden hat, zeigt das Dashboard kein Inhalt — stattdessen blockiert ein App-weites Modal den Modul-Bereich. Sidebar (inkl. Domain-Switcher) bleibt sichtbar, damit Domain-Wechsel ohne OAuth möglich ist.

> **Offene Folge-Frage** (siehe [`feature-inventory.md`](feature-inventory.md)): Das Feature-Inventory beschreibt Crawl & Track und Keyword Clustering als standalone-fähig (Crawl ohne GSC, Cluster aus CSV-Upload). Die „GSC ist Pflicht für jede Domain"-Regel widerspricht dem. Entscheidung wird bei [`module-crawl-track.md`](module-crawl-track.md) und [`module-keyword-clustering.md`](module-keyword-clustering.md) endgültig getroffen — Default für M1 ist die strikte Regel (GSC Pflicht).

## States

Folgt den Konventionen aus [`states.md`](../04-ux-ui/states.md). Modul-spezifische Reasons:

| State | Bedingung | Anzeige |
|---|---|---|
| **GSC-nicht-verbunden** | `/api/gsc/sites` → 401 oder Domain ohne `gsc_property_url` | App-weites Modal (siehe oben), kein Page-Inhalt |
| **Initial-Loading** | Alle 3 Fetches pending | StatsRow-Skeletons + Chart-Skeleton + Table-Skeletons |
| **Refetch / Filter-Wechsel** | SWR mutating, alte Daten da | Alte Daten sichtbar, dezenter Loading-Indikator im Header (rotierender `RefreshCw`) |
| **Empty-Window** | Fetches ok, `clicks=0` und keine Queries | Empty-State pro Card: „Keine Daten im gewählten Zeitraum." + Hinweis „Wähle einen größeren Zeitraum oder warte 48h auf neue GSC-Daten." |
| **Error: GSC-Token expired (401)** | Mind. ein Fetch failed | Affected-Card: „GSC-Verbindung abgelaufen." + CTA „GSC neu verbinden" → OAuth |
| **Error: GSC-Quota (429)** | Mind. ein Fetch failed | Affected-Card: „GSC-Quota erreicht." + CTA „Erneut versuchen" |
| **Error: 5xx** | Mind. ein Fetch failed | Affected-Card: „Server-Fehler." + CTA „Erneut versuchen" |
| **GSC-Latenz-Hinweis** | Window endet ≤ 2 Tage in der Vergangenheit | Subtiler Inline-Hinweis unter StatsRow: „Daten der letzten 48 h können nachreifen." |

**Stale entfällt** in M1 — alle Daten sind live ([ADR-0010](../decisions/ADR-0010-gsc-live-in-m1.md)).

## A11y

- StatsRow-Tiles sind Display-Elemente, kein Klick. Kein `role` nötig.
- Δ-Indikatoren: Farbe (grün/rot) **plus** Pfeil-Icon **plus** Vorzeichen — drei Signale, kein reines Color-Coding.
- Chart-Toggle-Buttons: `aria-pressed` für Toggle-State, tab-fokussierbar.
- Top-Queries-Tabelle: semantisches `<table>`, klickbare Zeilen mit `role="link"` und Keyboard-Aktivierung (Enter/Space).
- DateRangePicker: vollständige Keyboard-Navigation (vorhanden in v1's Picker).

## Telemetry-Events

Events feuern bei den unten gelisteten Triggern. Schema-Details (Property-Conventions, Schema-Validation) folgen in einem dedizierten Telemetry-Doc, sobald eingerichtet (post-M1).

| Event | Trigger | Properties |
|---|---|---|
| `dashboard.viewed` | Page-Mount mit erfolgreicher GSC-Verbindung | `domainId`, `dateRangeDays`, `presetUsed` |
| `dashboard.range_changed` | DateRangePicker-Auswahl | `domainId`, `oldDays`, `newDays`, `preset` |
| `dashboard.filter_changed` | Device-/Country-Wechsel | `domainId`, `filter`, `value` |
| `dashboard.metric_toggled` | Chart-Legend-Toggle | `domainId`, `metric`, `enabled` |
| `dashboard.top_query_clicked` | Klick auf Query in Top-Queries-Tabelle | `domainId`, `position`, `clicks` |
| `dashboard.refresh_clicked` | Refresh-Button | `domainId` |
| `dashboard.gsc_modal_shown` | App-weites Verbindungs-Modal sichtbar | `domainId`, `trigger:"dashboard"` |

## Geteilte Helfer aus v1 (müssen übernommen werden)

- [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts) — `weightedPosition` (für StatsRow-Position).
- [`lib/date-range.ts`](../../lib/date-range.ts) — `formatRange`, `getLastNMonthsRange`, `rangeToIso`.
- v1's Performance-Chart-Komponente (im `app/(dashboard)/dashboard/`-Tree) — wandert zu `components/charts/performance-chart.tsx`, Toggle-Cards entfernt, Legend kompakter.
- [`components/ui/month-preset-range-picker.tsx`](../../components/ui/month-preset-range-picker.tsx) — generisch genug für alle Module, bleibt in `components/ui/`.

## Was aus v1 entfällt

- v1's Performance-Modul-Toggle-Cards (Total-Werte oben) — die Werte sind in v2 schon in der StatsRow.
- `localStorage`-basierter `SiteContext` — Domain ist URL-getrieben ([ADR-0007](../decisions/ADR-0007-domain-as-workspace.md)).

## Erweiterungen post-M1 (Nice-to-have, nicht blockierend)

Geplant für nach M1, additiv:

1. **Crawl-Latest-Card** (post-M2, sobald Crawl & Track live): kleine Card unter Top-Queries mit „Letzter Crawl: vor 2 h, 12 neue Diff-Events." → Klick zu Crawl & Track. Quelle: `/api/crawl/latest?domainId=...`.
2. **Strategy-Highlights-Card** (post-M5): Top 3 offene High-Priority-Findings aus Strategy. → Klick zu Strategy. Quelle: `/api/strategy/findings?domainId=...&priority=high&status=open&limit=3`.
3. **Initial-Analysis-Status-Banner** (post-M6): wenn Initial-Analysis für die Domain noch läuft oder fehlgeschlagen ist, dedizierter Status-Banner oben mit Progress / Retry-CTA.
4. **Top-Mover-Auszug** (optional, post-M7): „Größte Gewinner / Verlierer der letzten 7 Tage" — kondensierte Version des Rankings-Top-Mover-Reports.

Jede Erweiterung wird im jeweiligen Modul-Spec referenziert und im Dashboard-Spec ergänzt, wenn sie tatsächlich gebaut wird.

## Aufwand & Reife (M1)

- Frontend: **~3 Tage** (StatsRow + Δ-Berechnung + Chart-Port + Top-Queries-Tabelle).
- Backend: **0 Tage** — nutzt vorhandene `/api/gsc/query` (mit Better-Auth-Token-Refresh statt v1's NextAuth).
- Risiken niedrig: GSC-Auth-Flow ist v1-erprobt; Recharts und SWR sind eingespielt.
- Hauptrisiko: Impression-gewichtete Position-Berechnung ist im v1-Codepfad nicht im Performance-Modul aktiv — separate Unit-Tests notwendig.

## Akzeptanzkriterien M1

- [ ] Domain ohne GSC-Verbindung → App-weites Verbindungs-Modal blockiert den Modul-Bereich, OAuth-CTA funktioniert.
- [ ] Domain mit GSC → StatsRow zeigt 4 KPIs mit korrekten Δ-Werten (validiert gegen GSC-UI manuell auf 1–2 Test-Domains).
- [ ] DateRange-/Device-/Country-Filter persistieren als URL-Search-Params.
- [ ] Multi-Metric-LineChart toggelt zwischen Klicks / Impressionen / CTR; Daten und Skala korrekt.
- [ ] Top-Queries-Tabelle zeigt Top 10, Klick navigiert mit Pre-Select zu `/d/[id]/rankings/query?q=<keyword>`.
- [ ] Refresh-Button löst Re-Fetch aus, Loading-State sichtbar.
- [ ] Mobile (≤ 767 px): Layout 1-spaltig, Chart kompakt, Tabelle scrollbar.
- [ ] Telemetry-Events feuern korrekt.
- [ ] Lighthouse-Performance ≥ 90 auf der Dashboard-Route.

## Offene Fragen / Folgeentscheidungen

1. **Crawl-/Cluster-Standalone-Workflows ohne GSC** → entscheiden in [`module-crawl-track.md`](module-crawl-track.md) und [`module-keyword-clustering.md`](module-keyword-clustering.md).
2. **Δ-Caption-Sprache** — „ggü. vorherigen 90 Tagen" vs. „vs. last period". Entscheidung im Copy-Sweep, sobald Voice-Guidelines fixiert.
3. **DateRange-Default-Konflikt** — [`module-view-pattern.md`](../04-ux-ui/module-view-pattern.md) nennt Last 28d als Default, [`module-rankings.md`](module-rankings.md) und dieser Spec nutzen Last 90d. Entscheidung: 90d für GSC-basierte Module bleibt (Stabilität, Saisonalität); Pattern-Doc bei Gelegenheit nachziehen.
4. **GSC-Latenz-Hinweis-Schwelle** — wann genau zeigen? Aktuell „Window endet ≤ 2 Tage". Mit Stale-Behavior in `states.md` abgleichen, wenn praktische Erfahrung da ist.
