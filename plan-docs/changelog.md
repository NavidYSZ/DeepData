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
