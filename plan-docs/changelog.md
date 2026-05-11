# Changelog

Proaktiv geführtes Logbuch aller substantiellen Änderungen an Code, Plan-Docs und Architektur. Jeder Eintrag: Datum, Modul/Bereich, Was, Warum, Refs.

Format:

```
## YYYY-MM-DD — <Bereich>
- **Was:** kurze Beschreibung
- **Warum:** Begründung
- **Refs:** Plan-Doc / ADR / Issue / Commit
```

---

## 2026-05-11 — Modul-Spec Data Explorer (M1)
- **Was:** [`01-functional/module-data-explorer.md`](01-functional/module-data-explorer.md) vollständig geschrieben (Stub ersetzt). Single-Page-Modul, keine Sub-Tab-Bar. Spalten-Set wie v1 + CTR (6 Spalten: Keyword, Pos, Impr, Clicks, CTR, URL); keine Δ-Spalten (klare Trennung zu Rankings/Combined). Dimensionen fix bei `query × page`; Device + Country als FilterBar-Items, nicht als Dimensionen. Inline-Drill-Down wie v1, mit URL-Param-Persistenz (`?focusKeyword=`, `?focusPage=`, mutex). FilterBar 1:1 aus v1 portiert (Suche, Min-Impr, Kannibal-Toleranz, More…-Popover mit Contains/Not-Contains/Min-Wortanzahl) plus Device/Country neu. StatsRow mit `Ø Position` impression-gewichtet + `Ø CTR` als clicks-summe/impressions-summe (v1-Konvention bewahrt). SWR-Cache geteilt mit Rankings/Combined — gleicher GSC-Call, bei identischem Filter-Stand instant zwischen den Modulen.
- **Warum:** Data Explorer ist der schnellste M1-Spec, weil v1 direkt portierbar ist. Klare Abgrenzung zu Rankings/Combined (Roh-`query × page`-Sicht mit Long-Tail-Filtern vs. deduplizierter Keyword-Sicht mit Δ-Spalten) verhindert Redundanz. Mit Spec ist klargestellt, dass die im Feature-Inventory genannte „frei spaltenwählbare Sicht" eine v1-Ungenauigkeit war — v1 hat fixe 5 Spalten und liefert Power-User-Wert über Filter-Logik, nicht Spalten-Konfiguration.
- **Refs:** [`01-functional/module-data-explorer.md`](01-functional/module-data-explorer.md), AskUserQuestion-Antworten am 2026-05-11 (Spalten = wie v1 + CTR; Dimensionen fix; Inline-Drill-Down).

## 2026-05-09 — Modul-Spec Crawl & Track (M2) + Postgres-Schema
- **Was:** [`01-functional/module-crawl-track.md`](01-functional/module-crawl-track.md) vollständig geschrieben (Stub ersetzt). 3 Sub-Pages: Übersicht (Default, Status-Banner + KPIs + letzte Änderungen), Runs (Run-Tabelle + Snapshot-Drilldown via Slide-In-Drawer), Changes (Kalender + Diff-Log). Daily-Cron + manueller Adhoc-Run mit `kind`-Markierung; Kalender nur Daily, Diff-Log filterbar nach Run-Art. Sitemap.xml-zuerst-Discovery mit BFS-Fallback und robots.txt-Respect. Diff-Erkennung über 8 change_kinds: status_code, title, h1, canonical, meta_description, indexability, outbound_links, body_hash (Body-Hash-Boilerplate-Noise als TBD-Risiko dokumentiert). Crawler aus v1's [`lib/internal-links/crawler.ts`](../lib/internal-links/crawler.ts) wird nach `lib/crawl/crawler.ts` portiert und erweitert. BullMQ-Queue `crawl-runs` + `crawl-diff` als asynchrone Jobs. Partial-Unique-Index `(domain_id, date(started_at)) WHERE kind='daily'` stellt 1-Daily-pro-Tag sicher.
- **Was (zusätzlich):** [`05-data-contracts/crawl-schema.md`](05-data-contracts/crawl-schema.md) als detailliertes Datenmodell-Doc mit CREATE-TABLE-Statements für `crawl_run`, `crawl_url_snapshot`, `crawl_url_link`, `crawl_change_event`. Diff-Phase-Algorithmus als Pseudo-Code. Hinweis auf `internal_link`-Erweiterung in M3.
- **Warum:** Crawl & Track ist M2-Foundation — Voraussetzung für Internal Link Analysis (M3), Content Structure (M6+) und Change-Marker im Rankings-per-URL-Chart. Datenmodell-Doc ist explizit getrennt, weil M3 dasselbe Schema additiv erweitert und beide Module sich darauf beziehen werden.
- **Refs:** [`01-functional/module-crawl-track.md`](01-functional/module-crawl-track.md), [`05-data-contracts/crawl-schema.md`](05-data-contracts/crawl-schema.md), AskUserQuestion-Antworten am 2026-05-09 (3 Sub-Pages, SEO-Meta + Outbound-Links + Body-Hash, Daily+Adhoc, Sitemap+BFS-Fallback).

## 2026-05-09 — Modul-Spec Rankings (M1) + ADR-0010 GSC-Live-only
- **Was:** [`01-functional/module-rankings.md`](01-functional/module-rankings.md) als erster vollständiger Modul-Spec geschrieben — dient als Vorbild für alle folgenden. Drei Sub-Pages: `kombiniert` (Default, bereinigte Sicht mit Δ-Spalten), `per Query` (übernimmt v1 rank-tracker), `per URL` (übernimmt v1 url-tracker, refactored, FullscreenOverlay → Slide-In-Drawer). Default-DateRange last 90 days. Threshold-Filter sichtbar gemacht. Cluster-Filter ausgeblendet bis M5. Cross-Refs zwischen Sub-Pages über URL-Params. v1-Helfer (`lib/gsc/aggregate.ts`, `lib/date-range.ts`, mehrere Components) explizit als portierbar markiert. [`decisions/ADR-0010-gsc-live-in-m1.md`](decisions/ADR-0010-gsc-live-in-m1.md) verankert: M1 nutzt GSC-Live, kein Postgres-Snapshot-Layer; Snapshots additiv bei Bedarf in M2+.
- **Warum:** Rankings ist erstes M1-Modul. Modul-Spec konkretisiert die Foundation-Docs (Module-View-Pattern, Layout-Shell, States, Design-System) zum ersten Mal und schafft das Spec-Template für die folgenden 11 Modul-Specs. GSC-Live-only-Entscheidung betrifft jedes Modul mit GSC-Daten und gehört deshalb in eine eigene ADR.
- **Refs:** [`01-functional/module-rankings.md`](01-functional/module-rankings.md), [`decisions/ADR-0010-gsc-live-in-m1.md`](decisions/ADR-0010-gsc-live-in-m1.md), AskUserQuestion-Antworten am 2026-05-09 (GSC-Live only, Bereinigte Sicht, Last 90 days).

## 2026-05-09 — UX-Foundation: Module-View-Pattern + Layout-Shell + States + Design-System
- **Was:** Phase 2 der Planning-Sequence finalisiert. [`04-ux-ui/module-view-pattern.md`](04-ux-ui/module-view-pattern.md) als universelle Anatomie für jede Modul-Page (PageHeader / SubTabBar / FilterBar / StatsRow / SectionCard / LegendDrawer). [`04-ux-ui/layout-shell.md`](04-ux-ui/layout-shell.md) mit Hierarchie RootLayout → DomainLayout → ModulPage, Top-Level-Routes (`/`, `/sign-in`, `/welcome`, `/account/settings`, `/d/[id]/...`), DomainHeader (SidebarTrigger + Breadcrumb + globaler Action-Slot), Welcome-Layout für 0-Domains-Zustand. [`04-ux-ui/states.md`](04-ux-ui/states.md) mit Loading / Empty / No-Data-Yet / Error / Stale-Sprache und Toast-Konventionen. [`04-ux-ui/design-system.md`](04-ux-ui/design-system.md) als Tokens-Minimal-Satz (shadcn-Defaults respektieren, Status-Farben, Spacing-Skala, Typography, Recharts-Konvention).
- **Warum:** Diese vier Docs sind Voraussetzung für jede Modul-Spec. Ohne universelle Anatomie + States-Sprache muss jeder Modul-Spec UI-Details neu erfinden, und die Modul-Pages divergieren wieder wie in v1. Mit dieser Foundation kann jeder Modul-Spec direkt auf die Bausteine verweisen und nur das Modul-Spezifische festhalten.
- **Refs:** [`04-ux-ui/`](04-ux-ui/), AskUserQuestion-Antwort am 2026-05-09 „Phase 2 UX-Foundation jetzt".

## 2026-05-09 — Sidebar-Top-Level finalisiert + Modul-Liste festgelegt
- **Was:** [`04-ux-ui/sidebar-07.md`](04-ux-ui/sidebar-07.md) auf finale Vorschlag-A-Struktur angehoben (Überblick / Daten erkunden / Analysen / Workspace). Sub-Pages bei Rankings, Internal Link Analysis, Keyword Clustering, Strategy. Top Mover + Position vs CTR + Kannibalisierung als Sub-Pages eines neuen Parent-Moduls „Ranking-Analysen". Notes lebt innerhalb Strategy. Dashboard ist Default beim Domain-Wechsel. [`01-functional/feature-inventory.md`](01-functional/feature-inventory.md) als Master-Liste mit 10 Top-Level + 14 Sub-Modulen geschrieben. [`10-roadmap/module-sequencing.md`](10-roadmap/module-sequencing.md) mit M0…M8 + Spec-Reihenfolge befüllt. Modul-Stubs in [`01-functional/`](01-functional/) angepasst (Parent-Stubs, Sub-Stubs, `module-notes.md` als deprecated-Pointer auf Strategy).
- **Warum:** ohne diese Knoten lässt sich keine sinnvolle Modul-Spec schreiben. Sidebar-Top-Level + Modul-Hierarchie ist die Basis aller folgenden URL-Routing-, Layout- und Datenverträge-Specs.
- **Refs:** [`04-ux-ui/sidebar-07.md`](04-ux-ui/sidebar-07.md), [`01-functional/feature-inventory.md`](01-functional/feature-inventory.md), [`10-roadmap/module-sequencing.md`](10-roadmap/module-sequencing.md), AskUserQuestion-Antworten am 2026-05-09.

## 2026-05-09 — Stack- und Architektur-Grundsatzentscheidungen
- **Was:** Neun ADRs angelegt: Doc-Sprache, Tech-Stack, Hosting (Coolify), DB+ORM (Postgres+Drizzle), Auth+Tenancy (Better Auth + `account_id`-Scoping), Job-Queue (BullMQ+Redis), Domain-als-Workspace, **kein Chat in v2**, Sidebar-07.
- **Warum:** Diese Entscheidungen tragen sämtliche Modul-Specs; sie zuerst zu fixieren verhindert, dass Modul-Diskussionen Stack-Annahmen heimlich vorwegnehmen.
- **Refs:** [`decisions/`](decisions/), [`07-software-architecture/tech-stack.md`](07-software-architecture/tech-stack.md), [`04-ux-ui/sidebar-07.md`](04-ux-ui/sidebar-07.md)

## 2026-05-09 — Bootstrap der v2-Planung
- **Was:** plan-docs/-Architektur in DeepData angelegt (Sektionen 00-product … 10-roadmap, decisions/, v1-status-quo/, changelog, error-fix-log). Übernimmt die Struktur aus dem Schwesterrepo `seo11-agent` und befüllt sie mit DeepData-spezifischen Inhalten.
- **Warum:** v2-Rewrite wird vorbereitet; persistentes Projektgedächtnis ist Pflichtbedingung, damit weder User noch nachfolgende Claude-Sessions Kontext verlieren.
- **Refs:** [`README.md`](README.md), [`v1-status-quo/`](v1-status-quo/), CLAUDE.md (Update)
