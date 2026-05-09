---
status: erstversion
last-updated: 2026-05-09
owner: claude (Code-Analyse)
---

# v1 — Status Quo

> **Zweck dieser Sektion:** dokumentiert faktisch, was die DeepData-Webapp **heute** im Repo ist (Stand `main` @ 2026-05-09). Das ist die AS-IS-Basis, von der der v2-Rewrite ausgeht. Hier wird **nicht** spekuliert, was sein sollte — nur was ist.

## Inhalte

| Doc | Beschreibung |
|---|---|
| [`01-tech-stack-und-routing.md`](01-tech-stack-und-routing.md) | Next-Version, Bibliotheken, Routing-Layer, Layouts, Sidebar, Auth-Flow, Deploy |
| [`02-feature-inventar.md`](02-feature-inventar.md) | Alle heute existierenden Module mit Funktion, Datenquellen, Quell-Files, Reife |
| [`03-datenmodell.md`](03-datenmodell.md) | Prisma-Schema-Inventar mit Annotation pro Tabelle |

## Quellen

- DeepData `main` @ Commit `ed2d0b4f`
- [`/CLAUDE.md`](../../CLAUDE.md) (v1-Architektur-Notiz)
- [`/docs/`](../../docs/) (rank-tracker, multiuser-notes, keyword-workspace/01-04)
- [`/plan and notes.md`](../../plan%20and%20notes.md) (User-Notizen zu Crawl-v1)

## Was bewusst nicht hier dokumentiert ist

- Architektur-Vorschläge → [`../07-software-architecture/`](../07-software-architecture/)
- Was sich in v2 ändert → [`../00-product/product-vision.md`](../00-product/product-vision.md) und Modul-Specs in [`../01-functional/`](../01-functional/)
- Migrations-Plan v1→v2 → kommt später, wenn Modul-Specs approved
