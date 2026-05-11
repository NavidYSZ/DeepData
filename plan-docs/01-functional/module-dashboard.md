---
status: spec
last-updated: 2026-05-11
owner:
related:
  - ../00-product/feature-inventory.md
  - ../00-product/v1-bestand-inventar.md
  - ../00-product/v2-architecture-decisions.md
  - ./onboarding-flow.md
  - ./module-rankings.md
  - ./module-strategy.md
  - ./module-crawl-track.md
---

# Modul: Dashboard

Default-Modul beim Domain-Wechsel. Route: `/d/[domainId]` (= `/d/[domainId]/dashboard`, auflösen siehe `routing-and-shell.md`).

Übernimmt das funktionierende v1-Performance-Modul ([`app/(dashboard)/dashboard/page.tsx`](../../app/(dashboard)/dashboard/page.tsx)) und erweitert es zu einer vollwertigen Domain-Landing-Page mit Δ-KPIs und Top-Queries-Tabelle.

## Zweck

Zwei Fragen sofort beim Öffnen einer Domain beantworten:

1. **Wie läuft die Domain gerade?** — Headline-KPIs Clicks / Impressions / CTR / Ø Position für den gewählten Window.
2. **Wo ändert sich was?** — Δ zum Vorperioden-Window auf jedem KPI, Performance-Verlaufschart, Top-10-Queries.

Tiefen-Analyse erfolgt in den Spezial-Modulen (Rankings für Query-Drilldown, Data Explorer für freie GSC-Aggregationen, Strategy/Crawl & Track für Inhalts-Themen). Das Dashboard ist bewusst keine eierlegende Wollmilchsau.

## Voraussetzung: GSC-OAuth

**Globale Voraussetzung.** Eine Domain ohne aktive GSC-Verbindung kann das Dashboard nicht anzeigen — und auch keines der anderen Module. App-weites Verbindungs-Modal:

- Title: „Google Search Console verbinden"
- Body: „Diese Domain ist noch nicht mit GSC verbunden. Verbinde GSC, um Rankings, Performance, Strategy-Findings und Crawl-Daten dieser Domain zu nutzen."
- CTA: „Mit Google verbinden" → `/api/auth/google` (v1-Flow)
- Sekundär-CTA: „Andere Domain wählen" → DomainSwitcher öffnen

Modal blockiert die ganze Shell (kein Modul-Inhalt sichtbar), Topbar bleibt sichtbar damit Domain-Wechsel funktioniert.

→ Siehe `auth-and-permissions.md` (Permission-Modell) und `onboarding-flow.md` (Erst-Verbindung beim Domain-Add).

> **Offene Folge-Frage** (siehe `feature-inventory.md`): Das Feature-Inventory beschreibt Crawl & Track und Keyword Clustering als standalone-fähig (Crawl ohne GSC, Cluster aus CSV-Upload). Die hier festgelegte „GSC ist Pflicht für jede Domain"-Regel widerspricht dem. Auflösung beim Spec von `module-crawl-track.md` und `module-keyword-clustering.md`: Entweder Crawl-only-Domains explizit erlauben (Modal nur „weicher" Hinweis, Crawl/Cluster bleiben zugänglich) oder bewusst die strikte Regel halten und Standalone-Workflows streichen. Default für M1 ist die strikte Regel; Revision möglich.

## Layout

```
┌───────────────────────────────────────────────────────┐
│ PageHeader: „Dashboard" + Description                  │
│ Action-Slot: DateRangePicker (Default: last 90 days)   │
│              + Refresh-Button                          │
├───────────────────────────────────────────────────────┤
│ StatsRow (4 Cards, responsive grid 2×2 / 1×4)         │
│ ┌──────────┬──────────┬──────────┬──────────┐        │
│ │ Clicks   │ Impr.    │ CTR      │ Ø Pos    │        │
│ │ 12.345   │ 234.567  │ 5.3 %    │ 12.4     │        │
│ │ ↑ +12 %  │ ↑ +8 %   │ ↑ +0.4pp │ ↓ −0.7   │        │
│ │ ggü. Vorp│ ggü. Vorp│ ggü. Vorp│ ggü. Vorp│        │
│ └──────────┴──────────┴──────────┴──────────┘        │
├───────────────────────────────────────────────────────┤
│ Performance-Chart-Card                                 │
│ Legend: ☑ Klicks  ☑ Impressionen  ☐ CTR              │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Multi-Axis-LineChart (toggle-bar)                 │ │
│ │  └ X = Datum (numerisch), Y links/rechts je Metrik│ │
│ └───────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────┤
│ Top-Queries-Card                                       │
│ Title: „Top-Queries (90 Tage)"                         │
│ Table: Query | Clicks | Impr. | CTR | Pos             │
│ Top 10 nach Klicks; Klick auf Query → Rankings        │
│ Footer: „Alle Queries ansehen →" → Rankings           │
└───────────────────────────────────────────────────────┘
```

## Komponenten

### Header & Action-Slot

- **DateRangePicker** (`MonthPresetRangePicker` aus v1, in v2 als `DateRangePresetPicker` in `components/ui/`): Last 28 days · Last 90 days **(Default)** · Last 6 months · Last 12 months · Custom. Persistiert Range im URL-Query (`?from=YYYY-MM-DD&to=YYYY-MM-DD`); leerer Param = Default.
- **Refresh-Button**: Icon-Only (Lucide `RefreshCw`). Triggert SWR `mutate()` auf alle Dashboard-Queries. Kein eigener API-Endpoint nötig — Cache-Invalidate reicht, GSC-Daten sind seit-letzter-Latenz aktuell.

### StatsRow

Reusable `StatsRow`-Component aus `design-system-and-tokens.md`. Vier Cards: Clicks · Impressions · CTR · Avg Position.

Pro Card:
- **Label** + Icon (Lucide: `MousePointerClick`, `Search`, `TrendingUp`, `Target`)
- **Value** im aktuellen Window (de-DE-formatiert: Clicks/Impr als Tausender-Punkt, CTR als `5,3 %`, Pos als `12,4`)
- **Δ-Indikator**: Pfeil + relative Änderung zum Vorperioden-Window
  - Clicks/Impressions: `↑ +12 %` / `↓ −8 %`
  - CTR: `↑ +0,4 pp` / `↓ −0,2 pp` (Prozentpunkte)
  - Position: `↑ −0,7` (Achtung: bessere Position = niedriger; Pfeil-Up bei Verbesserung). Farbe grün bei Verbesserung, rot bei Verschlechterung — auch bei Position invers.
- **Δ-Caption**: „ggü. vorherigen 90 Tagen" (oder dem aktiven Window-Label)
- Skeleton-State während Fetch.

**Vorperioden-Window** = gleicher Tagesumfang direkt vor dem aktiven Window. Für `last 90 days` heute = `2026-02-10..2026-05-10` ist die Vorperiode `2025-11-12..2026-02-09`. Custom-Ranges analog: Vorperiode = gleiche Länge, direkt davor.

### Performance-Chart

Übernimmt v1's `LineChart` (Recharts) **funktional** 1:1, **visuell** angepasst:

- **Toggle-Legend statt Toggle-Cards**: v1 hat drei große Toggle-Cards mit Total-Werten oben. In v2 sind die Werte schon in der StatsRow — die Toggle-Karten würden doppeln. Stattdessen: kompakte Legend-Buttons unter dem Card-Header (Pill-Style mit Farbpunkt + Label + Checkbox-Indikator), wie in v1 nur kleiner.
- **Default-Sichtbarkeit**: Klicks **on**, Impressionen **on**, CTR **off**. Mindestens eine Metrik muss aktiv bleiben (Click auf einzige aktive Metrik wird ignoriert).
- **Multi-Axis**: bis zu 2 Y-Achsen (links/rechts) bei Desktop; auf Mobile nur die erste aktive Metrik bekommt eine Y-Achse.
- **X-Achse**: numerisch (`dateNum` = ms-Timestamp), formatiert als `DD.MM`. Domain `dataMin..dataMax`.
- **Tooltip**: Datum + alle aktiven Metriken mit korrekter Formatierung (Klicks/Impr Integer mit `toLocaleString("de-DE")`, CTR als `5,30 %`).
- **Datenauffüllung**: Tage ohne GSC-Daten in der Mitte des Windows = `0`. **Trailing**-Tage ohne Daten (am Ende des Windows, wegen GSC-Latenz) werden abgeschnitten — nicht als 0 dargestellt. Logik wie in v1's `buildPerformanceSeries`.
- **Loading**: Recharts-Container behält Höhe, innen Skeleton.
- **Höhe**: `h-[260px]` mobile, `h-[360px]` desktop (wie v1).

### Top-Queries-Tabelle

- **Quelle**: GSC `query` mit `dimensions=["query"]`, gesamtes Window aggregiert, `rowLimit=10`, sortiert nach Klicks descending (GSC's Default).
- **Spalten**: Query (links, truncate mit Tooltip bei Overflow) · Clicks (rechtsbündig) · Impressions (rechtsbündig) · CTR (rechtsbündig, `5,3 %`) · Position (rechtsbündig, `12,4`).
- **Klick auf Query-Zeile**: navigiert zu `/d/[domainId]/rankings?query=<encoded>` und vorselektiert die Query im Rankings-Modul (Detail-Pane öffnet automatisch).
- **Footer-Link**: „Alle Queries ansehen →" rechtsbündig im Card-Footer, navigiert zu `/d/[domainId]/rankings` ohne Query-Pre-Select.
- **Empty-State**: „Keine Query-Daten im gewählten Zeitraum." (passiert bei sehr neuen Domains oder leeren Windows).
- **Skeleton**: 10 Skeleton-Zeilen während Fetch.

## Datenquellen & Fetches

Alle Fetches client-seitig via SWR über das vorhandene v1-Backend (`/api/gsc/query`). **Keine neuen API-Routen für M1** — Dashboard ist reiner BFF-Konsument.

| Fetch | Endpoint | Body | Cache-Key |
|---|---|---|---|
| **Performance current** | `POST /api/gsc/query` | `{siteUrl, startDate, endDate, dimensions:["date"], rowLimit:1000}` | `gsc:perf:{siteUrl}:{from}:{to}` |
| **Performance previous** | `POST /api/gsc/query` | `{siteUrl, startDate:prevFrom, endDate:prevTo, dimensions:["date"], rowLimit:1000}` | `gsc:perf:{siteUrl}:{prevFrom}:{prevTo}` |
| **Top Queries** | `POST /api/gsc/query` | `{siteUrl, startDate, endDate, dimensions:["query"], rowLimit:10}` | `gsc:topQueries:{siteUrl}:{from}:{to}` |

Drei parallele Requests beim Initial-Load. SWR-Konfig:
- `revalidateOnFocus: false` (GSC-Latenz macht häufiges Revalidate sinnlos)
- `dedupingInterval: 60_000` (1 Min)
- `keepPreviousData: true` (smoother Date-Range-Wechsel)

KPI-Werte und Δ werden client-seitig aus den beiden Performance-Series berechnet:

```
totals.current     = sum(currentSeries[*].clicks/impressions)
totals.previous    = sum(previousSeries[*].clicks/impressions)
ctr.current        = totals.current.clicks / totals.current.impressions
position.current   = sum(impressions × position) / sum(impressions)   // gewichtet
delta.clicks       = (current − previous) / previous   // Prozent
delta.position     = current − previous                // absolut, in Plätzen
```

> **Achtung** Position: GSC liefert Position pro Tag bereits als gewichteter Mittelwert über alle Impressions des Tages. Über mehrere Tage zusammenfassen = Impression-gewichtetes Mittel (siehe Formel oben), **nicht** arithmetisch. v1 nutzt diese Komponente bisher nicht; in M1 zum ersten Mal.

## States

| State | Bedingung | Anzeige |
|---|---|---|
| **GSC-nicht-verbunden** | `/api/gsc/sites` → 401 | Globales Modal (siehe oben), kein Page-Inhalt |
| **Site-loading** | `useSite()` noch leer | „Property wird geladen..." (kurzlebig) |
| **Initial-loading** | Alle 3 Fetches pending | StatsRow-Skeletons + Chart-Skeleton + Table-Skeletons |
| **Refetch / Range-Wechsel** | SWR mutating, alte Daten da | Alte Daten sichtbar, dezenter Loading-Indikator im Header (rotierender RefreshCw) |
| **Empty-Domain** | Fetches ok, aber `clicks=0` und keine Queries | Empty-State pro Card: „Keine Daten im gewählten Zeitraum." + Hinweis „Wähle einen größeren Zeitraum oder warte 48h auf neue GSC-Daten." |
| **Fetch-Error** | Mind. ein Fetch failed | Affected-Card zeigt Error-State mit Retry-Button (`mutate()`); andere Cards bleiben funktional |
| **GSC-Latenz-Hinweis** | Window endet ≤ 2 Tage in der Vergangenheit | Subtiler Inline-Hinweis unter StatsRow: „Daten der letzten 48 h können nachreifen." |

## Routing & URL-State

- Path: `/d/[domainId]/dashboard` (Alias: `/d/[domainId]` → redirect zu `/dashboard`)
- Query-Params:
  - `from=YYYY-MM-DD`, `to=YYYY-MM-DD` (optional; leer = Default last 90 days)
- Keine Body-State (kein Drilldown-Pane).
- Modul-Wechsel mit gleichem `?from&to` propagiert in alle GSC-basierten Module (Rankings, Data Explorer) — siehe `routing-and-shell.md` für die DateRange-Persistenz-Regel.

## Performance-Budget

- **Initial Render**: < 1.5 s bis StatsRow-Skeletons sichtbar.
- **Time-to-First-KPI**: < 3 s (limitiert durch GSC-API-Latenz, nicht durch Frontend).
- **Bundle**: Recharts ist bereits im v1-Bundle. Keine zusätzlichen Heavy-Deps.
- **Re-Render-Strategie**: StatsRow, Chart und Top-Queries als getrennte Components mit eigenen SWR-Hooks → Range-Wechsel triggert nur die nötigen Re-Fetches (Cache-Hit auf Vorperioden-Daten möglich, wenn das Window später wieder gewählt wird).

## A11y

- StatsRow-Cards sind reine Display-Elemente, kein Klick (anders als v1's Toggle-Karten). Kein `role` nötig.
- Δ-Indikatoren: Farbe (grün/rot) **plus** Pfeil-Icon (`ArrowUp`/`ArrowDown`) **plus** Vorzeichen im Text — drei Signale, kein reines Color-Coding.
- Chart-Toggle-Buttons: `aria-pressed` für Toggle-State (wie v1), tab-fokussierbar.
- Top-Queries-Tabelle: semantisches `<table>`, klickbare Zeilen mit `role="link"` und Keyboard-Aktivierung (Enter/Space).
- DateRangePicker: vollständige Keyboard-Navigation (vorhanden in v1's Picker).

## Telemetry

| Event | Trigger | Properties |
|---|---|---|
| `dashboard.viewed` | Page-Mount mit erfolgreicher GSC-Verbindung | `domainId`, `dateRangeDays`, `presetUsed` |
| `dashboard.range_changed` | DateRangePicker-Auswahl | `domainId`, `oldDays`, `newDays`, `preset` |
| `dashboard.metric_toggled` | Chart-Legend-Toggle | `domainId`, `metric`, `enabled` |
| `dashboard.top_query_clicked` | Klick auf Query in Top-Queries-Tabelle | `domainId`, `position`, `clicks` |
| `dashboard.refresh_clicked` | Refresh-Button | `domainId` |
| `dashboard.gsc_modal_shown` | Globales Verbindungs-Modal sichtbar | `domainId`, `trigger:"dashboard"` |

→ Schema-Details in `telemetry-and-feature-flags.md` (Phase 3).

## Erweiterungen post-M1 (Nice-to-have, nicht blockierend)

Geplant für nach M1, additiv:

1. **Crawl-Latest-Card** (post-M2, sobald Crawl & Track live): kleine Card unter Top-Queries mit „Letzter Crawl: vor 2 h, 12 neue Diff-Events." → Klick zu Crawl & Track. Quelle: `/api/crawl/latest?domainId=...`.
2. **Strategy-Highlights-Card** (post-M5): Top 3 offene High-Priority-Findings aus Strategy. → Klick zu Strategy. Quelle: `/api/strategy/findings?domainId=...&priority=high&status=open&limit=3`.
3. **Initial-Analysis-Status-Banner** (post-M6, mit Initial-Analysis): Wenn Initial-Analysis für die Domain noch läuft oder fehlgeschlagen ist, oben ein dedizierter Status-Banner mit Progress / Retry-CTA.
4. **Top-Mover-Auszug** (optional, post-M7): „Größte Gewinner / Verlierer der letzten 7 Tage" — kondensierte Version des Rankings-Top-Mover-Reports.
5. **Saved-Views** (sehr spät, ggf. nie nötig): Custom-Date-Range + Metric-Selection als benannter Preset speichern.

Jede Erweiterung wird im jeweiligen Modul-Spec referenziert und im Dashboard-Spec ergänzt, wenn sie tatsächlich gebaut wird.

## Aufwand & Reife (M1)

- Frontend: **~3 Tage** (StatsRow + Δ-Berechnung + Chart-Übernahme + Top-Queries-Tabelle).
- Backend: **0 Tage** — nutzt vorhandene `/api/gsc/query` und `/api/gsc/sites`.
- Risiken niedrig: GSC-Auth-Flow ist v1-erprobt; Recharts und SWR sind eingespielt.
- Hauptrisiko: Position-Mittelwert-Formel (Impression-gewichtet) nicht im v1-Codepfad — separate Unit-Tests notwendig.

## Akzeptanzkriterien M1

- [ ] Domain ohne GSC-Verbindung → Globales Verbindungs-Modal blockiert die App, OAuth-CTA funktioniert.
- [ ] Domain mit GSC → StatsRow zeigt 4 KPIs mit korrekten Δ-Werten (validiert gegen GSC-UI manuell auf 1–2 Test-Domains).
- [ ] DateRangePicker mit Presets funktioniert; URL-Query persistiert.
- [ ] Multi-Metric-LineChart toggelt zwischen Klicks / Impressionen / CTR; Daten und Skala korrekt.
- [ ] Top-Queries-Tabelle zeigt Top 10, Klick navigiert mit Pre-Select zu Rankings.
- [ ] Refresh-Button löst Re-Fetch aus, Loading-State sichtbar.
- [ ] Mobile (≤ 767 px): Layout 1-spaltig, Chart kompakt, Tabelle scrollbar.
- [ ] Telemetry-Events feuern korrekt.
- [ ] Lighthouse-Performance ≥ 90 auf der Dashboard-Route.

## Offene Fragen / Folgeentscheidungen

1. **Crawl-/Cluster-Standalone-Workflows ohne GSC** → entscheiden in `module-crawl-track.md` und `module-keyword-clustering.md` (siehe Hinweis oben).
2. **Position-Berechnung Impression-gewichtet** → in `data-model.md` als formale Definition aufnehmen, damit Rankings/Data-Explorer dieselbe Formel nutzen.
3. **DateRange-Propagation zwischen Modulen** → in `routing-and-shell.md` festlegen: Behält Modul-Wechsel die Range bei (vermutlich ja) und wenn ja, persistiert sie auch domain-übergreifend (vermutlich nein)?
4. **Δ-Caption-Sprache** → „ggü. vorherigen 90 Tagen" vs. „vs. last period" — Entscheidung im Copy-Sweep, sobald `design-system-and-tokens.md` die Voice-Guidelines fixiert.
