# plan-docs/

Das **persistente Gedächtnis** des Umbaus zu **DeepData v2**.

Hier dokumentieren wir alle Entscheidungen, Specs, Architektur, Datenverträge, Userflows und Änderungen — bevor und während wir bauen. Ziel: keine technischen Schulden durch fehlende Vorabklärung; jede Person (oder jeder Agent), die später in das Projekt einsteigt, soll hier alles finden, was nicht aus dem Code direkt ablesbar ist.

Konventionen für die Pflege dieses Verzeichnisses: siehe [`CLAUDE.md`](../CLAUDE.md) im Repo-Root.

> **Hinweis:** Der Code im Repo (`app/`, `components/`, `lib/`, `prisma/`) entspricht aktuell noch DeepData v1. Die v2-Implementierung beginnt erst, wenn die jeweiligen Plan-Docs `approved` sind. AS-IS-Dokumentation der v1-Codebase liegt unter [`v1-status-quo/`](v1-status-quo/).

---

## Wegweiser nach Anliegen

| Was suchst du? | Wo? |
|---|---|
| Wie sieht DeepData heute (v1) aus? | [`v1-status-quo/`](v1-status-quo/) |
| Was ist das Produkt v2, für wen? | [`00-product/product-vision.md`](00-product/product-vision.md) |
| Begriffsdefinitionen | [`00-product/glossary.md`](00-product/glossary.md) |
| Personas, Jobs-to-be-done | [`00-product/personas-jobs.md`](00-product/personas-jobs.md) |
| Welche Module/Features gibt es in v2? | [`01-functional/feature-inventory.md`](01-functional/feature-inventory.md) |
| Wie nutzt der User das Tool? | [`02-user-flows/`](02-user-flows/) |
| Sitemap, Domain-Modell, URL-Struktur | [`03-information-architecture/`](03-information-architecture/) |
| UI-Anatomie, Design-System, Sidebar-07 | [`04-ux-ui/`](04-ux-ui/) |
| Datenmodelle, API-Verträge | [`05-data-contracts/`](05-data-contracts/) |
| Wie fließen Daten durch das System? | [`06-data-flow/`](06-data-flow/) |
| Tech-Stack, Architektur, Auth, Jobs | [`07-software-architecture/`](07-software-architecture/) |
| Memory-Architektur (Strategy/Notes pro Domain) | [`08-information-management/`](08-information-management/) |
| CI/CD, Environments, Runbooks | [`09-operations/`](09-operations/) |
| Roadmap, Reihenfolge der Planung | [`10-roadmap/`](10-roadmap/) |
| Architektur-Entscheidungen | [`decisions/`](decisions/) (ADRs) |
| Was hat sich wann geändert? | [`changelog.md`](changelog.md) |
| Welche Bugs sind aufgetreten und wie behoben? | [`error-fix-log.md`](error-fix-log.md) |

---

## Status-Tabelle

Legende: 🟢 fertig & approved · 🟡 Erstversion / in Review · 🔲 Skelett / Stub · ⚪ leer / nicht begonnen

### v1-status-quo (faktisch, basierend auf Code-Analyse)
| Doc | Status |
|---|---|
| [`README.md`](v1-status-quo/README.md) | 🟡 Erstversion |
| [`01-tech-stack-und-routing.md`](v1-status-quo/01-tech-stack-und-routing.md) | 🟡 Erstversion |
| [`02-feature-inventar.md`](v1-status-quo/02-feature-inventar.md) | 🟡 Erstversion |
| [`03-datenmodell.md`](v1-status-quo/03-datenmodell.md) | 🟡 Erstversion |

### 00-product
| Doc | Status |
|---|---|
| [`product-vision.md`](00-product/product-vision.md) | 🟡 Erstversion |
| [`glossary.md`](00-product/glossary.md) | 🟡 Erstversion |
| [`personas-jobs.md`](00-product/personas-jobs.md) | ⚪ |

### 01-functional
| Doc | Status |
|---|---|
| [`feature-inventory.md`](01-functional/feature-inventory.md) | ⚪ |
| `module-*.md` (siehe [`10-roadmap/module-sequencing.md`](10-roadmap/module-sequencing.md)) | ⚪ je Modul |

### 02-user-flows · 03-information-architecture · 04-ux-ui
| Bereich | Status |
|---|---|
| [`02-user-flows/`](02-user-flows/) | ⚪ |
| [`03-information-architecture/`](03-information-architecture/) | ⚪ |
| [`04-ux-ui/sidebar-07.md`](04-ux-ui/sidebar-07.md) | 🟡 Erstversion |
| [`04-ux-ui/`](04-ux-ui/) übrige | ⚪ |

### 05-data-contracts · 06-data-flow · 07-software-architecture
| Bereich | Status |
|---|---|
| [`05-data-contracts/`](05-data-contracts/) | ⚪ |
| [`06-data-flow/`](06-data-flow/) | ⚪ |
| [`07-software-architecture/tech-stack.md`](07-software-architecture/tech-stack.md) | 🟡 Erstversion |
| [`07-software-architecture/`](07-software-architecture/) übrige | ⚪ |

### 08-information-management · 09-operations · 10-roadmap
| Bereich | Status |
|---|---|
| [`08-information-management/`](08-information-management/) | ⚪ |
| [`09-operations/`](09-operations/) | ⚪ |
| [`10-roadmap/planning-sequence.md`](10-roadmap/planning-sequence.md) | 🟡 Erstversion |
| [`10-roadmap/module-sequencing.md`](10-roadmap/module-sequencing.md) | ⚪ |
| [`10-roadmap/milestones.md`](10-roadmap/milestones.md) | ⚪ |

### decisions (ADRs)
| ADR | Status |
|---|---|
| [`ADR-0001-doc-language.md`](decisions/ADR-0001-doc-language.md) | 🟢 |
| [`ADR-0002-tech-stack.md`](decisions/ADR-0002-tech-stack.md) | 🟢 |
| [`ADR-0003-hosting-coolify.md`](decisions/ADR-0003-hosting-coolify.md) | 🟢 |
| [`ADR-0004-database-and-orm.md`](decisions/ADR-0004-database-and-orm.md) | 🟢 |
| [`ADR-0005-auth-and-tenancy.md`](decisions/ADR-0005-auth-and-tenancy.md) | 🟢 |
| [`ADR-0006-job-queue.md`](decisions/ADR-0006-job-queue.md) | 🟢 |
| [`ADR-0007-domain-as-workspace.md`](decisions/ADR-0007-domain-as-workspace.md) | 🟢 |
| [`ADR-0008-no-chat-in-v2.md`](decisions/ADR-0008-no-chat-in-v2.md) | 🟢 |
| [`ADR-0009-sidebar-07.md`](decisions/ADR-0009-sidebar-07.md) | 🟢 |

---

## Frontmatter-Konvention

Jede inhaltliche Plan-Doc hat ein YAML-Frontmatter:

```yaml
---
status: leer | erstversion | in-review | approved
last-updated: YYYY-MM-DD
owner: <person/agent>
---
```

Sobald eine Doc `approved` ist, wird sie nur noch über expliziten Spec-Change-Prozess geändert (mit Eintrag in [`changelog.md`](changelog.md)).

## Sprache

- Plan-Docs: Deutsch
- Code, API-Felder, Identifier, Commit-Messages, Inline-Kommentare: Englisch
- Begründung: [`decisions/ADR-0001-doc-language.md`](decisions/ADR-0001-doc-language.md)
