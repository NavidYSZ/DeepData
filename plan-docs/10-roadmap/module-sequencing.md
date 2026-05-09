---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# Modul-Reihenfolge in der Implementierung

Diese Doc legt die **Build-Order** fest — anders als die [`planning-sequence.md`](planning-sequence.md), die die **Plan-Order** der Docs festlegt.

Die **Spec-Order** (in welcher Reihenfolge wir die Modul-Plan-Docs gemeinsam ausarbeiten) folgt im Wesentlichen der Build-Order, weil spätere Module sich auf frühere stützen.

## Kriterien

- **Infrastruktur-Lift:** das erste Modul, das eine Datenquelle braucht, muss die Pipeline mit etablieren. Spätere Module profitieren davon.
- **Daten-Abhängigkeiten:** Module, die Cluster-Mappings konsumieren, müssen nach Cluster kommen (oder mit pfad-basiertem Fallback).
- **Reife der v1-Entsprechung:** Module mit stabilem v1-Backend lassen sich schneller portieren.
- **USP-Wert:** was zeigt am schnellsten den v2-Mehrwert (saubere UX, konsistente Module)?

## Vorläufige Reihenfolge (zur User-Review)

### M0 — Foundation
- Stack-Setup (Next 16, Drizzle, Postgres, Redis, Better Auth, Coolify-Multi-Service)
- Tenancy (Account, User, `withAccount`)
- Domain-Modell (Anlage, Switcher)
- `sidebar-07` Layout-Shell mit allen 10 Top-Level + 14 Sub-Pages als leere Module-Stubs
- Welcome-Flow (0 Domains → Add-Domain-Form)

### M1 — GSC-Pipeline + Rankings
- GSC-OAuth via Better Auth (Provider-Setup, Scope `webmasters.readonly`)
- GSC-Sync-Worker (BullMQ-Job: pulls keyword/url-Metrics in Postgres)
- Modul **Rankings** (Parent + 3 Sub-Pages) als erstes echtes Modul
- Etabliert: `lib/gsc/aggregate.ts` portieren, GSC-Cache-Schicht, Rankings-Verlauf-Snapshots
- **Begründung:** GSC ist die Daten-Hauptader, Rankings ist v1's stabilstes Modul mit klarem Refactor-Plan (by Query + by Site → ein Parent).

### M2 — Crawler-Pipeline + Crawl & Track
- Crawler-Worker (cheerio, p-limit) als BullMQ-Job
- Modul **Crawl & Track** mit echten Crawls + Diff-Erkennung
- Etabliert: Crawl-Run-Snapshots, Diff-Logik, Kalender-View
- **Begründung:** Crawler-Infrastruktur ist Vorbedingung für Internal Links + Content Structure.

### M3 — Internal Link Analysis
- Modul **Internal Link Analysis** (Parent + 2 Sub-Pages) mit Opportunity Matrix + URL Inspector
- Etabliert: Anchor-Klassifikation, Quick-Win-Score, GSC × Crawl Cross-Joins
- **Begründung:** Vom User explizit als Priorität genannt; größter sichtbarer USP-Wert; nutzt GSC-Pipeline (M1) + Crawler-Pipeline (M2).

### M4 — Ranking-Analysen + Data Explorer + Dashboard
- Modul **Ranking-Analysen** (3 Sub-Pages, alle aus v1 portierbar)
- Modul **Data Explorer** (übernehmen)
- Modul **Dashboard** überarbeiten mit Live-Ableitungen aus M1/M2/M3
- **Begründung:** alle drei verbrauchen nur GSC + leichten Cluster-Fallback; geringer Inkrementalaufwand.

### M5 — Keyword Clustering
- Modul **Keyword Clustering** (Parent + 3 Sub-Pages) portieren aus v1, UI komplett neu auf Module-View-Pattern.
- SERP-API-ADR (Zyte vs. Alternativen)
- **Begründung:** Cluster-Mapping wird Voraussetzung für Content Gap, Content Structure, Traffic Share. v1-Backend stabil, also Aufwand primär UI.

### M6 — Strategy + Notes
- Modul **Strategy** (Findings + Notes Sub-Pages)
- Findings können jetzt Cross-Refs in alle bisher gebauten Module setzen.
- **Begründung:** sinnvoll erst nach Modul-Daten, sonst hätte Strategy keine Evidence.

### M7 — Content Gap + Traffic Share + Content Structure
- Drei Module, die Cluster-Mapping (M5) + GSC (M1) + SERP-API (M5) konsumieren.
- **Begründung:** verbrauchen alles vorherige.

### M8 — Content Writing
- Modul **Content Writing** (Scope kommt mit Modul-Spec)
- Konsumiert Content Gap (M7) + Keyword Clustering (M5).
- **Begründung:** zuletzt, weil Scope am offensten und am stärksten von vorgelagerten Modulen abhängig.

### Mn+ — SaaS-Hardening
- Billing, Quotas, Self-Signup, n:m-Tenancy.

## Spec-Konversations-Reihenfolge

Wir besprechen die Modul-Specs in obiger Build-Reihenfolge — also:

1. Rankings
2. Crawl & Track
3. Internal Link Analysis
4. Ranking-Analysen
5. Data Explorer
6. Dashboard
7. Keyword Clustering
8. Strategy
9. Content Gap
10. Traffic Share
11. Content Structure & CJ
12. Content Writing

**Vor M0-Implementierung** klar: Layout-Shell, Module-View-Pattern, States-Sprache, Design-System (Phase 2 der [`planning-sequence.md`](planning-sequence.md)).
