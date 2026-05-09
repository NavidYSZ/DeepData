---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# Produkt-Vision: DeepData v2

> _Erstversion auf Basis User-Briefing am 2026-05-09 ("v2 von deepdata/gsc-dashboard, gute Ideen aus SEO11-Agent übernehmen") sowie der getroffenen Architektur-Entscheidungen ([ADR-0002](../decisions/ADR-0002-tech-stack.md), [ADR-0007](../decisions/ADR-0007-domain-as-workspace.md), [ADR-0008](../decisions/ADR-0008-no-chat-in-v2.md), [ADR-0009](../decisions/ADR-0009-sidebar-07.md)). Wird vom User reviewt und iteriert._

## Elevator Pitch

DeepData v2 ist ein **konsistenter, modularer SEO-Arbeitsplatz**. Für jede Domain wird beim Anlegen automatisch eine vollständige Daten- und Analysebasis aufgebaut (Rankings, Crawl, Internal-Links, Content-Struktur, Keyword-Cluster, Traffic). Anschließend arbeitet der User klickbasiert in fokussierten Modulen, sortiert in einer kollabierbaren Sidebar mit klarer Top-Level-Hierarchie. Die UI ist konsequent shadcn-basiert; jedes Modul folgt einem einheitlichen Layout-Pattern. Strategie und Notizen pro Domain werden persistiert, sodass die Arbeit über Sessions hinweg fortsetzbar bleibt.

## Was v2 ändert (gegenüber v1)

v1 („gsc-dashboard") war ein gewachsener Daten-Browser mit inkonsistenter UX, fragiler Sidebar-Hierarchie und unfertigen Modulen. v2 räumt das auf:

1. **Hierarchie:** Account → Domain → Module. Eine Domain ist Property + Arbeitsbereich in einem; jedes Modul lebt unter `/d/[domainId]/<modul>`. Keine `localStorage`-State-Bindung mehr, keine zufällige Session-Reihenfolge ([ADR-0007](../decisions/ADR-0007-domain-as-workspace.md)).
2. **Sidebar:** shadcn `sidebar-07` (kollabiert auf Icons), klare Top-Level-Gruppen statt der heutigen „Keywords / Insights / Tools / Crawl / Settings"-Mischmasch ([ADR-0009](../decisions/ADR-0009-sidebar-07.md), [`../04-ux-ui/sidebar-07.md`](../04-ux-ui/sidebar-07.md)).
3. **Modul-Konsistenz:** ein `module-view-pattern` (PageHeader / FilterBar / SectionCard / StatsRow / standardisierte Empty/Loading/Error/Stale-States). Kein Modul mehr, das sein eigenes Layout neu erfindet.
4. **Stack:** Next.js 16 + Drizzle + Postgres + Better Auth + BullMQ/Redis + Coolify ([ADR-0002](../decisions/ADR-0002-tech-stack.md)). Erlaubt persistente Snapshots für Initial-Analysis, JSONB für flexible Modul-Daten, echte Job-Queues für Crawl/SERP-Runs.
5. **Kein Chat-Agent in v2** ([ADR-0008](../decisions/ADR-0008-no-chat-in-v2.md)). Bewusst zurückgestellt, um den Scope zu verkleinern und das Produkt zuerst als sauberes Tool fertigzubauen. Der Agent kann später additiv kommen, weil Modul-Daten dann persistent vorliegen.
6. **Initial Analysis pro Domain:** beim Hinzufugen einer Domain läuft je Modul ein automatischer Erstanalyse-Job. Daraus entsteht eine sofort befragbare Datenbasis.

## Zielgruppe

**Primär (Solo-Phase):** der User selbst — als Solo-SEO oder kleine Agentur, die mehrere Kundendomains betreut.

**Mittelfristig (SaaS-Phase):** Inhouse-SEO/Content-Manager mittlerer Unternehmen ohne Tech-Skills; kleinere SEO-/Content-Agenturen, die ihren Output skalieren wollen; Marketing-Generalisten in Startups, die SEO ohne Spezialisten betreiben.

**Bewusst nicht primär:** Enterprise-SEO-Teams mit eigenen Data-Engineers (haben eigene Pipelines).

## Module (Bestand + Neu)

Aus dem v1-Code erbbar (siehe [`../v1-status-quo/02-feature-inventar.md`](../v1-status-quo/02-feature-inventar.md)):

- **Rankings** (in v1: by Query + by Site getrennt; in v2 zusammenfuhren, Daten bereinigen — nur höchstrankende URL pro Keyword)
- **Top Mover** (period-vs-period Vergleich)
- **Data Explorer** (freie GSC-Tabellenansicht)
- **Position vs CTR** (heute `seo-bubble`, in v2 als Standard-Insight-View)
- **Kannibalisierung** (gleiches Keyword, mehrere URLs)
- **Internal Link Analysis** (Backend reift, **UI wird neu gebaut** — Opportunity Matrix + URL Detail Inspector)
- **Keyword Clustering** (`keyword-workspace`, sehr ausgereiftes Backend, **UI muss aufgeräumt** werden — monolithische 73-KB-Datei zerlegen)
- **Crawl & Track** (in v1 nur Mock-Phase-1, in v2 ausbauen mit echten Crawls + Diff-Erkennung; Cross-Use mit Rankings)

Neu in v2 (vom User explizit genannt + aus SEO11-Agent-Vision):

- **Content Writing** (komplett neu)
- **Strategy** (strukturierte Findings pro Domain in Kategorien `technical` / `content` / `optimize`)
- **Content Gap** (vs. Konkurrenz auf Basis von SERP-Daten)
- **Content Structure & Customer Journey** (Pillar/Hub-Analyse + CJ-Mapping)
- **Traffic Share** (Anteil am Traffic im Topic-Cluster)
- **Memory / Notes** (kuratierte Notizen pro Domain, persistent — *ohne* Agent erstmal als reines Notizen-Modul)

Die Modul-Sortierung in der Sidebar (SEO Tools vs. Analysen vs. fertige Auswertungen vs. Workspace-Settings) ist explizit ein **offener Designpunkt**, der über [`../04-ux-ui/sidebar-07.md`](../04-ux-ui/sidebar-07.md) und [`../03-information-architecture/navigation-map.md`](../03-information-architecture/navigation-map.md) gemeinsam erarbeitet wird.

## Nicht-Ziele für v2

- Chat-Agent (siehe ADR-0008)
- Backlink-Datenbank, eigene Konkurrenz-Tracking-Datenbank
- Werbe-/Paid-Search-Daten
- Page-Experience / Core Web Vitals als zentrales Modul (später optional)
- Mobile-First-Design (zuerst Desktop, mobile als Sidekick)

## Erfolgskriterien (Konkretisierung in [`../10-roadmap/milestones.md`](../10-roadmap/milestones.md))

- Konsistente UX: jedes Modul folgt dem gleichen Layout-Pattern; keine 73-KB-Single-File-Views mehr.
- Eine neue Domain ist nach <X Minuten in allen Modulen mit echten Daten gefüllt (Initial Analysis läuft als BullMQ-Pipeline).
- v2 deckt mindestens das Funktions-Set v1 ab und fügt Internal Links UI / Content Writing / Strategy / Content Gap / Content Structure / Traffic Share hinzu.
- v2 deployt auf demselben Coolify-VPS, Postgres als verwalteter Service.

## Offene Fragen für Vision-Review

1. **Solo-Sicht:** Bleibt der User in v2 erstmal Single-Tenant (eine Account-Row, mehrere Domains), oder sofort SaaS-tauglich (n:m Account/User mit Rollen)? Empfehlung: Single-Tenant + `account_id`-Scoping technisch sauber, n:m-Ausbau später ([ADR-0005](../decisions/ADR-0005-auth-and-tenancy.md)).
2. **Sidebar-Top-Level-Gruppen:** Wie unterteilen wir den Tool-Mischmasch? Vorschlag in [`../04-ux-ui/sidebar-07.md`](../04-ux-ui/sidebar-07.md), gemeinsam zu finalisieren.
3. **Initial Analysis Scope:** Läuft beim Domain-Anlegen wirklich *jedes* Modul, oder nur ein Foundation-Set (Rankings + Crawl)? Frage entscheidet über Job-Queue-Komplexität in M1.
4. **GSC-Pflicht:** Ist GSC zwingend für eine Domain, oder darf eine Domain auch ohne GSC angelegt werden (mit reduziertem Funktionsumfang)?
5. **Migrations-Strategie v1→v2:** Sollen User-Daten (KeywordProjects, CrawlRuns) aus v1 migriert werden, oder ist v2 ein leeres neues System? Falls Migration: nur für den User selbst oder als generische Pipeline?
6. **„Content Writing" Scope:** Brief-Generator? Outline-Tool? Volltext-Drafting? Externe LLMs nutzen oder eigene Pipeline? Wird im Modul-Spec geklärt.
