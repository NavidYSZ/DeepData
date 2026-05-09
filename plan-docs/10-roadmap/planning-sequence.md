---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# Reihenfolge der Detail-Planung

Diese Doc legt fest, in welcher Reihenfolge wir die einzelnen Plan-Docs gemeinsam erarbeiten — bevor implementiert wird. Jede Phase wird abgeschlossen, bevor die nächste beginnt; jede Doc wird vom User reviewt und approved.

## Leitprinzip

Von **außen nach innen**: Erst klären, *was* das Produkt für *wen* tut (Vision, Userflows, IA), dann *wie es aussehen* soll (UX), dann *wie es technisch funktioniert* (Architektur, Daten, Module). Das verhindert, dass Tech-Entscheidungen Produktentscheidungen vorgreifen.

## Phasen

### Phase 0 — Bootstrap (✅ erledigt 2026-05-09)
- Plan-Docs-Skelett angelegt
- v1-Status quo dokumentiert
- Stack-/Architektur-Grundsatzentscheidungen als ADRs (0001–0009)

### Phase 1 — Produkt- und UX-Fundament (nächste Schritte)
1. **Sidebar-Top-Level-Gruppen finalisieren** → [`../04-ux-ui/sidebar-07.md`](../04-ux-ui/sidebar-07.md). Wahl zwischen Vorschlag A / B / C / Mix. **Erst danach** ist die finale Modul-Liste klar.
2. **Feature-Inventory v2 finalisieren** → [`../01-functional/feature-inventory.md`](../01-functional/feature-inventory.md). Welche Module übernehmen wir aus v1, welche bauen wir neu, welche entfallen.
3. **Module-Sequencing** → [`module-sequencing.md`](module-sequencing.md). In welcher Reihenfolge spec'en (und später implementieren) wir die Module.
4. **Personas + Jobs-to-be-done** → [`../00-product/personas-jobs.md`](../00-product/personas-jobs.md).

### Phase 2 — UX-Foundation
5. [`../04-ux-ui/design-system.md`](../04-ux-ui/design-system.md)
6. [`../04-ux-ui/layout-shell.md`](../04-ux-ui/layout-shell.md)
7. [`../04-ux-ui/module-view-pattern.md`](../04-ux-ui/module-view-pattern.md) — universelle Modulseite-Anatomie (PageHeader / FilterBar / SectionCard / StatsRow + State-Sprache)
8. [`../04-ux-ui/states.md`](../04-ux-ui/states.md) — Empty/Loading/Error/Stale

### Phase 3 — Information Architecture & Userflows
9. [`../03-information-architecture/navigation-map.md`](../03-information-architecture/navigation-map.md)
10. [`../03-information-architecture/url-routing.md`](../03-information-architecture/url-routing.md)
11. [`../03-information-architecture/domain-model.md`](../03-information-architecture/domain-model.md)
12. [`../02-user-flows/`](../02-user-flows/) — Onboarding, Domain-Anlage, Initial Analysis, modulübergreifende Cross-Use-Flows

### Phase 4 — Daten- und Schnittstellen-Verträge
13. [`../05-data-contracts/domain-entities.md`](../05-data-contracts/domain-entities.md)
14. [`../05-data-contracts/module-data-shapes.md`](../05-data-contracts/module-data-shapes.md)
15. [`../05-data-contracts/api-contracts.md`](../05-data-contracts/api-contracts.md)
16. [`../05-data-contracts/event-contracts.md`](../05-data-contracts/event-contracts.md)
17. [`../06-data-flow/`](../06-data-flow/) — Ingestion, Analysis-Pipeline, Caching/Staleness

### Phase 5 — Modul-Specs (Modul-für-Modul)
Pro Modul eine eigene Konversation, eigene Spec, eigene Approval. Reihenfolge gemäß [`module-sequencing.md`](module-sequencing.md). Jede Modul-Spec enthält: Zweck, User-Flow, UI-Skizze, Datenmodell, Service-Layer, Job-Pipeline, Cross-Use-Verknüpfungen, Abhängigkeiten, offene Fragen.

### Phase 6 — Operations & Roadmap
18. [`../09-operations/`](../09-operations/) — Environments, CI/CD, Runbooks
19. [`milestones.md`](milestones.md) — M0/M1/M2 mit Definition of Done

### Phase 7 — Implementierung
Beginnt frühestens **nach Phase 4** für Foundation-Bausteine (DB-Schema, Auth, Domain-Modell). Modul-Implementierung **erst nach approved Modul-Spec**.

## Was diese Reihenfolge bewusst nicht tut

- Sie verhindert, dass wir uns vorzeitig in Modul-Details verlieren, ohne das Tech-Fundament zu kennen.
- Sie verhindert, dass wir Tech-Entscheidungen treffen, ohne zu wissen, was die Module brauchen.
- Sie verhindert horizontales Halbfertig-Bauen („ein bisschen Rankings, ein bisschen Crawl") — Module werden vertikal komplett, eines nach dem anderen.
