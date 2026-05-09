---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# Feature-Inventory v2

Master-Liste aller Module v2, gemäß finalisierter Sidebar-Struktur ([`../04-ux-ui/sidebar-07.md`](../04-ux-ui/sidebar-07.md)).

Legende:
- **Status:** übernommen-aus-v1 / refaktor / neu
- **Backend:** wo der größte Code-Aufwand sitzt
- **Datenquellen:** woher die Daten stammen
- **Abhängigkeiten:** welche anderen Module/Daten müssen vor diesem da sein

## Überblick

| Modul | Status | Backend | Datenquellen | Abhängigkeiten |
|---|---|---|---|---|
| **Dashboard** ([spec](module-dashboard.md)) | übernommen-aus-v1 | leicht | GSC live + Strategy + Crawl-Latest | Strategy, Crawl & Track |

## Daten erkunden

| Modul | Status | Backend | Datenquellen | Abhängigkeiten |
|---|---|---|---|---|
| **Rankings** ([spec](module-rankings.md)) | refaktor (v1 by Query + by Site verschmelzen) | mittel | GSC | — |
|  · per Query (Sub) | refaktor | leicht | GSC | — |
|  · per URL (Sub) | refaktor | leicht | GSC | — |
|  · kombiniert (Sub) | neu (Default-Sub) | mittel | GSC | — |
| **Data Explorer** ([spec](module-data-explorer.md)) | übernommen-aus-v1 | leicht | GSC | — |
| **Crawl & Track** ([spec](module-crawl-track.md)) | refaktor (v1 nur Mock) | groß | eigener Crawler | — |

## Analysen

| Modul | Status | Backend | Datenquellen | Abhängigkeiten |
|---|---|---|---|---|
| **Ranking-Analysen** ([spec](module-ranking-analysen.md)) | refaktor (v1 hatte 3 separate Module) | mittel | GSC | Rankings |
|  · Top Mover (Sub) | übernommen-aus-v1 | mittel | GSC | — |
|  · Position vs CTR (Sub) | refaktor (33 KB v1-File zerlegen) | mittel | GSC | — |
|  · Kannibalisierung (Sub) | übernommen-aus-v1 | mittel | GSC | — |
| **Internal Link Analysis** ([spec](module-internal-links.md)) | refaktor (Backend stabil, UI neu) | groß | eigener Crawler + GSC | Crawl & Track |
|  · Opportunity Matrix (Sub) | neu | mittel | s.o. | — |
|  · URL Inspector (Sub) | neu | mittel | s.o. | — |
| **Content Gap** ([spec](module-content-gap.md)) | neu | groß | SERP-API + Konkurrenten-Crawl | Keyword Clustering (Topic-Mapping) |
| **Content Structure & CJ** ([spec](module-content-structure.md)) | neu | groß | eigener Crawler + Cluster-Mapping | Crawl & Track, Keyword Clustering |
| **Traffic Share** ([spec](module-traffic-share.md)) | neu | mittel | GSC + SERP-API + Cluster-Mapping | Keyword Clustering |

## Workspace

| Modul | Status | Backend | Datenquellen | Abhängigkeiten |
|---|---|---|---|---|
| **Keyword Clustering** ([spec](module-keyword-clustering.md)) | refaktor (Backend stabil, UI 73-KB-File zerlegen) | groß | Upload + GSC + SERP-API (Zyte) | — |
|  · Pre-Cluster (Sub) | übernommen-aus-v1 | mittel | s.o. | — |
|  · SERP-Cluster (Sub) | übernommen-aus-v1 | groß | s.o. | — |
|  · Manual-Cluster (Sub) | refaktor (UI neu) | mittel | s.o. | — |
| **Content Writing** ([spec](module-content-writing.md)) | neu | groß (Scope offen) | TBD | Content Gap, Keyword Clustering |
| **Strategy** ([spec](module-strategy.md)) | neu | mittel | alle Modul-Daten als Evidence | alle Module |
|  · Findings (Sub) | neu | s.o. | s.o. | — |
|  · Notes (Sub) | neu | leicht | User-Eingabe + Cross-Refs | — |

## Was aus v1 entfällt

- **Chat Agent** ([ADR-0008](../decisions/ADR-0008-no-chat-in-v2.md)) — keine Portierung von [`app/(dashboard)/chat-agent/`](../../app/(dashboard)/chat-agent/), [`app/api/agent/`](../../app/api/agent/), [`lib/agent/`](../../lib/agent/), Prisma `ChatSession`/`ChatMessage`/`ChatFile`.
- **Property-Picker** im Sidebar-Header — ersetzt durch Domain-Switcher.
- **`SiteContext` / `localStorage`** — ersetzt durch URL-getriebene Domain-Auswahl ([ADR-0007](../decisions/ADR-0007-domain-as-workspace.md)).
- **NextAuth + Prisma + SQLite + custom Sidebar** — Stack-Wechsel ([ADR-0002](../decisions/ADR-0002-tech-stack.md)).

## Was zusätzlich diskutiert werden muss (offene Modul-Frage)

- **Content Writing-Scope:** Brief-Generator? Outline? Volltext-Drafting? — entscheidet über Backend-Aufwand.
- **Strategy-Findings-Generierung:** regelbasiert / dedizierter LLM-Aufruf (außerhalb Chat) / rein manuell?
- **GSC-Pflicht pro Domain:** kann eine Domain ohne GSC angelegt werden (z.B. wenn User nur uploadbasiert mit Konkurrenz-Daten arbeitet)?
- **Initial Analysis Scope:** läuft beim Domain-Anlegen *jedes* Modul, oder nur Foundation (Rankings + Crawl)? Antwort definiert M1-Scope.

## Nächster Schritt

Mit dieser Modul-Liste als Basis: Module-Sequencing in [`../10-roadmap/module-sequencing.md`](../10-roadmap/module-sequencing.md). Welches Modul wird *zuerst* gebaut, weil es die meiste Infrastruktur etabliert? Welches *zuletzt*, weil es alle anderen verbraucht?
