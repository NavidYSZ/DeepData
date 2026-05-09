---
status: erstversion
last-updated: 2026-05-09
owner: claude (Code-Analyse)
---

# v1 — Feature-Inventar

> Alle in der heutigen DeepData-Codebase auffindbaren funktionalen Bereiche, mit Zweck, Datenquellen, Quell-Files und subjektiver Reife (`stabil` / `funktioniert` / `experimentell` / `mock`). Die Bewertungen basieren auf Code-Tiefe und User-Aussagen, nicht auf Tests.

## Sidebar-Module

### Dashboard (`/dashboard`)
- **Zweck:** Übersicht. Top-KPIs, Traffic-Chart, Top-Queries-Tabelle.
- **Datenquellen:** GSC live (`/api/gsc/query`).
- **Files:** [`app/(dashboard)/dashboard/page.tsx`](../../app/(dashboard)/dashboard/page.tsx) (~13 KB), [`components/dashboard/kpi-cards.tsx`](../../components/dashboard/kpi-cards.tsx), [`traffic-chart.tsx`](../../components/dashboard/traffic-chart.tsx), [`queries-table.tsx`](../../components/dashboard/queries-table.tsx).
- **Reife:** funktioniert.

### Keywords / by Query (`/rank-tracker`)
- **Zweck:** Keyword-Verlaufsgraphen aus GSC. Multi-Select-Filter, fixe vs. dynamische Y-Achse, optionaler Trend-Layer, KW-Tabelle.
- **Datenquellen:** GSC live, `dimensions:[query]` und `[date,query]`.
- **Files:** [`app/(dashboard)/rank-tracker/page.tsx`](../../app/(dashboard)/rank-tracker/page.tsx), [`components/dashboard/rank-charts.tsx`](../../components/dashboard/rank-charts.tsx), [`query-multiselect.tsx`](../../components/dashboard/query-multiselect.tsx). Detail-Spec: [`/docs/rank-tracker.md`](../../docs/rank-tracker.md).
- **Reife:** funktioniert; explizit dokumentiert.

### Keywords / by Site (`/url-tracker`)
- **Zweck:** Pendant zu by Query, aber URL-zentriert. Pro URL Verlaufsgraph + Top-Keywords.
- **Datenquellen:** GSC live, `dimensions:[page]` / `[date,page]`.
- **Files:** [`app/(dashboard)/url-tracker/page.tsx`](../../app/(dashboard)/url-tracker/page.tsx) (~25 KB).
- **Reife:** funktioniert; **konzeptionell stark redundant** mit by Query.

### Keywords / Data Explorer (`/data-explorer`)
- **Zweck:** freie Tabellenansicht über GSC-Rohdaten, frei filter-/sortier-/spaltenwählbar.
- **Files:** [`app/(dashboard)/data-explorer/page.tsx`](../../app/(dashboard)/data-explorer/page.tsx) (~15 KB), [`components/dashboard/data-explorer-table.tsx`](../../components/dashboard/data-explorer-table.tsx).
- **Reife:** funktioniert; Power-User-Werkzeug.

### Insights / Position vs CTR (`/seo-bubble`)
- **Zweck:** Bubble-Chart Position × CTR mit Impressions als Größe; Identifikation von „Snippet-/Title-Optimierungs-Kandidaten".
- **Files:** [`app/(dashboard)/seo-bubble/page.tsx`](../../app/(dashboard)/seo-bubble/page.tsx) (~33 KB — sehr großes File, möglicher Refactor-Kandidat).
- **Reife:** funktioniert; UI vermutlich zu groß für ein File.

### Insights / Kannibalisierung (`/kannibalisierung`)
- **Zweck:** mehrere URLs ranken für dasselbe Keyword erkennen.
- **Datenquellen:** GSC live, dedupliziert via [`lib/cannibalization.ts`](../../lib/cannibalization.ts) und [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts) (impressions-gewichtete Position, Toleranzband).
- **Files:** [`app/(dashboard)/kannibalisierung/page.tsx`](../../app/(dashboard)/kannibalisierung/page.tsx), [`components/dashboard/cannibalization-table.tsx`](../../components/dashboard/cannibalization-table.tsx), [`cannibalization-visuals.tsx`](../../components/dashboard/cannibalization-visuals.tsx).
- **Reife:** funktioniert.

### Insights / Top Mover (`/top-mover`)
- **Zweck:** größte Veränderungen (Position/Clicks/Impressions) zwischen zwei Zeiträumen.
- **Files:** [`app/(dashboard)/top-mover/page.tsx`](../../app/(dashboard)/top-mover/page.tsx) (~32 KB).
- **Reife:** funktioniert.

### Insights / Internal Links (`/internal-links`)
- **Zweck:** eigener Crawler erfasst Inlinks/Outlinks; Anchor-Klassifikation; Quick-Win-Score gegen GSC-Position.
- **Datenquellen:** eigener Crawler (`cheerio`, [`lib/internal-links/crawler.ts`](../../lib/internal-links/crawler.ts)) + GSC-Sync ([`gsc-sync.ts`](../../lib/internal-links/gsc-sync.ts)). Persistiert in `CrawlRun` / `UrlSnapshot` / `InternalLink`.
- **Logik:** [`lib/internal-links/anchor-classifier.ts`](../../lib/internal-links/anchor-classifier.ts) (exact/partial/branded/entity/generic/empty/image_no_alt), [`scoring.ts`](../../lib/internal-links/scoring.ts), [`cluster.ts`](../../lib/internal-links/cluster.ts), [`service.ts`](../../lib/internal-links/service.ts).
- **Files-UI:** [`app/(dashboard)/internal-links/page.tsx`](../../app/(dashboard)/internal-links/page.tsx) (sehr klein, ~175 B → fast keine UI), [`components/internal-links/`](../../components/internal-links/).
- **API:** `/api/internal-links/{run,runs,opportunities}`.
- **Reife:** Backend-Logik **stabil und ausgereift**; UI-Seite minimal/unfertig.

### Insights / Chat Agent (`/chat-agent`)
- **Zweck:** LLM-Chat mit Runbooks (quick wins, content decay, cannibalization, top queries/pages, audit).
- **Stack:** OpenAI via `@ai-sdk/openai`; Runbooks in [`lib/agent/runbooks.ts`](../../lib/agent/runbooks.ts), Analysen in [`analysis.ts`](../../lib/agent/analysis.ts), Kontext-Helper in [`context.ts`](../../lib/agent/context.ts).
- **Persistenz:** `ChatSession`, `ChatMessage`, `ChatFile` (Prisma).
- **Files:** [`app/(dashboard)/chat-agent/page.tsx`](../../app/(dashboard)/chat-agent/page.tsx) (~17 KB), `/api/agent/{route,sessions,files}`.
- **Reife:** funktioniert. **In v2 entfällt dieses Modul** ([`../decisions/ADR-0008-no-chat-in-v2.md`](../decisions/ADR-0008-no-chat-in-v2.md)).

### Tools / Clustering (`/keyword-workspace`)
- **Zweck:** Vollständiges Keyword-Workspace mit Import (CSV/Excel/GSC), Normalisierung, Pre-Clustering (lexical + Louvain) und SERP-Cluster-Runs (Zyte → URL-Overlap → Subcluster → Parent-Cluster via LLM).
- **Datenmodell:** `KeywordProject`, `KeywordSource`, `Keyword`, `KeywordSourceMetric`, `KeywordDemand`, `Precluster` + `PreclusterMember`, `Cluster` + `ClusterMember`, `WorkspaceEvent`, plus `SerpSnapshot`, `SerpClusterRun`, `SerpSubcluster` + `SerpSubclusterMember`, `SerpParentCluster` + `SerpParentToSubcluster`.
- **Logik:** [`lib/keyword-workspace/`](../../lib/keyword-workspace/) → `file-parse.ts`, `normalize.ts`, `precluster.ts`, `serp-cluster.ts` (~33 KB!), `service.ts`.
- **UI:** **monolithische** [`app/(dashboard)/keyword-workspace/page.tsx`](../../app/(dashboard)/keyword-workspace/page.tsx) (~73 KB — größte Single-File-View im Repo). Eigener Vollbild-Layout-Modus.
- **API:** `/api/keyword-workspace/{current,imports,projects}`.
- **Doku:** [`/docs/keyword-workspace/01-architecture.md`](../../docs/keyword-workspace/01-architecture.md), `02-data-contracts-models.md`, `03-user-flow-ux-ui.md`, `04-preclustering-spec.md`, `05-external-keyword-import.md`.
- **Reife:** Backend-Logik sehr ausgereift; UI-File aber dringend refaktor-bedürftig.

### Footer / Crawl (`/crawl`)
- **Zweck:** „Screaming-Frog-Klon" — eigene Fullscreen-App mit drei Routen: Dashboard, Crawler, Changes (Kalender + Diff-Log).
- **Datenquellen:** aktuell nur Mock-Daten; geplante Modelle `CrawlRun`/`CrawlUrlSnapshot`/`CrawlChangeEvent` noch nicht persistiert. Echter Crawl-Code lebt zur Zeit nur unter `lib/internal-links/crawler.ts`.
- **Files:** [`app/crawl/`](../../app/crawl/), [`components/crawl/`](../../components/crawl/), [`lib/crawl/`](../../lib/crawl/).
- **Doku:** [`/plan and notes.md`](../../plan%20and%20notes.md) → Phasenplan.
- **Reife:** **mock / Phase 1 (UI-Prototyp)**.

### Footer / Settings (`/settings`)
- **Zweck:** Account- und Property-Verwaltung.
- **Files:** [`app/(dashboard)/settings/page.tsx`](../../app/(dashboard)/settings/page.tsx).
- **Reife:** funktioniert minimal.

## Querschnitt-Bibliotheken

- [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts) — `weightedPosition`, `defaultImpressionThreshold`, `dedupCannibalized`, `daySpan`, `hasEnoughEvidence`. **Diese Helfer müssen in v2 erhalten bleiben** (impression-gewichtete Position ist eine zentrale Produkteigenschaft).
- [`lib/gsc-access.ts`](../../lib/gsc-access.ts) — Multi-Account-Resolver mit Token-Refresh.
- [`lib/agent/`](../../lib/agent/) — entfällt in v2 (kein Chat).
- [`components/dashboard/page-shell.tsx`](../../components/dashboard/page-shell.tsx) — `PageHeader`, `FilterBar`, `SectionCard`, `StatsRow`. **Konzept übernehmen** in v2 (Universal-Modul-Layout).
- [`components/dashboard/site-context.tsx`](../../components/dashboard/site-context.tsx) — wird in v2 ersetzt durch URL-getriebene Domain-Auswahl ([`../decisions/ADR-0007-domain-as-workspace.md`](../decisions/ADR-0007-domain-as-workspace.md)).

## Module, die der User für v2 explizit als neu/umbau genannt hat

- **Internal Link Analysis** (komplett neu in der UI; Backend kann teilweise wiederverwendet werden)
- **Content Writing** (komplett neu)
- **Strategy** (komplett neu)
- Plus implizit über die SEO11-Agent-Vision: **Content Gap, Content Structure & Customer Journey, Traffic Share, Memory** (alle neu)
- by Query + by Site **zusammenführen** und Daten bereinigen (User-Aussage in [`../inital-vague-info-quoted.md`](../v1-status-quo/01-tech-stack-und-routing.md) — siehe SEO11-Agent-Quellmaterial)

Konkrete Modul-Specs für v2 entstehen in [`../01-functional/module-*.md`](../01-functional/) — eines nach dem anderen, gemeinsam mit dem User.
