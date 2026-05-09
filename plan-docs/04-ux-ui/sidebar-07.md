---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# Sidebar (shadcn `sidebar-07`)

> Detail-Spec der Navigations-Shell. Entscheidung: [`../decisions/ADR-0009-sidebar-07.md`](../decisions/ADR-0009-sidebar-07.md). **Top-Level-Struktur am 2026-05-09 finalisiert** (User-Wahl: Vorschlag A nach Aktivität, mit Sub-Pages bei fünf Modulen).

## Anatomie

```
┌─ Header ───────────────┐
│ [Logo]  Domain-Switcher │  ← Combobox aller Domains des Accounts + „+ neue Domain"
│                         │     Im Collapsed-State: nur Logo + Domain-Initial-Avatar
├─ Content (4 Gruppen) ───┤
│ Group-Label             │  ← nur sichtbar im Expanded-State
│   ◦ Modul   [icon]      │  ← Lucide-Icon + Label, im Collapsed nur Icon
│     ◦ Sub-Page          │  ← Sub-Pages eingeklappt per Default; im Collapsed verschwinden sie ganz
│ …                       │
├─ Footer ───────────────┤
│ [Settings]              │  ← Account-Level Settings (/account/settings)
│ [User]   Name           │  ← Dropdown: Sign-out, Theme-Toggle
└───────────────────────┘
```

**Toggle:** Standard-shadcn-Trigger (`Cmd+B`).

**Active-State:** über `usePathname()`. Bei Sub-Pages: Parent **und** Sub-Page bekommen `data-active`. Im Collapsed-State zeigt nur das Parent-Icon den Active-State; der konkrete Sub-Page-Wechsel passiert dann in der Modul-Page selbst (interne Tab/Sub-Nav).

**Sub-Pages-Verhalten:**

- Im **Expanded-State** ist das Parent ein Collapsible (lucide `chevron-right`/`chevron-down`). Klick auf das Parent-Label öffnet die Parent-Default-Page **und** klappt die Sub-Liste auf.
- Im **Collapsed-State** zeigt nur das Parent-Icon. Klick öffnet die Parent-Default-Page; die Wahl der Sub-Page passiert dann in der Modul-Page selbst.
- Mobile: Sidebar als Drawer; Sub-Pages immer ausgeklappt.

## Finale Top-Level-Struktur

```
Überblick
  Dashboard                           → /d/[id]                         (Default beim Domain-Wechsel)

Daten erkunden
  Rankings                            → /d/[id]/rankings                (Default-Sub: kombiniert)
    ◦ per Query                       → /d/[id]/rankings/query
    ◦ per URL                         → /d/[id]/rankings/url
    ◦ kombiniert                      → /d/[id]/rankings
  Data Explorer                       → /d/[id]/data-explorer
  Crawl & Track                       → /d/[id]/crawl-track

Analysen
  Ranking-Analysen                    → /d/[id]/ranking-analysen        (Default: top-mover)
    ◦ Top Mover                       → /d/[id]/ranking-analysen/top-mover
    ◦ Position vs CTR                 → /d/[id]/ranking-analysen/position-ctr
    ◦ Kannibalisierung                → /d/[id]/ranking-analysen/cannibalization
  Internal Link Analysis              → /d/[id]/internal-links          (Default: opportunity-matrix)
    ◦ Opportunity Matrix              → /d/[id]/internal-links/opportunity-matrix
    ◦ URL Inspector                   → /d/[id]/internal-links/url-inspector
  Content Gap                         → /d/[id]/content-gap
  Content Structure & CJ              → /d/[id]/content-structure
  Traffic Share                       → /d/[id]/traffic-share

Workspace
  Keyword Clustering                  → /d/[id]/clustering              (Default: pre)
    ◦ Pre-Cluster                     → /d/[id]/clustering/pre
    ◦ SERP-Cluster                    → /d/[id]/clustering/serp
    ◦ Manual-Cluster                  → /d/[id]/clustering/manual
  Content Writing                     → /d/[id]/content-writing
  Strategy                            → /d/[id]/strategy                (Default: findings)
    ◦ Findings                        → /d/[id]/strategy/findings
    ◦ Notes                           → /d/[id]/strategy/notes
```

**Modul-Zählung:** 10 Top-Level + 14 Sub-Pages = 24 navigierbare Module-Views.

## Default-Modul beim Domain-Wechsel

- `/d/[id]` rendert direkt das Dashboard. Kein Redirect.
- Wechselt der User die Domain im Switcher, springt die App immer zu `/d/[neueId]` — also zurück zum Dashboard. Kein „last-module-per-domain"-Memorierung in M0 (kann später additiv kommen).

## Notes lebt **innerhalb** von Strategy

Keine eigene Sidebar-Position. Notes ist ein Tab/Sub-Page im Strategy-Modul. Praktisch heißt das:

- Datenmodell: `note` als Sub-Entity unter Strategy-Domain-Bezug, **nicht** ein eigenes Tenant-Top-Level-Konzept.
- Cross-Refs: Notizen können auf Modul-Daten verweisen („Notiz zu URL X", „Notiz zu Cluster Y"), genauso wie Findings.
- Konsequenz für Modul-Spec: [`module-strategy.md`](../01-functional/module-strategy.md) deckt beide Sub-Pages ab.

## Footer

- **Settings** → `/account/settings` (Account-Level: Profil, GSC-Connections, Billing-später, evtl. Domain-Liste). **Nicht** Domain-spezifisch.
- **User-Avatar** → Dropdown mit Sign-out, Theme-Toggle.

Domain-Settings (Hostname-Edit, Crawler-Frequenz, GSC-Property-Bindung) sind unter `/d/[id]/settings` und werden über einen Settings-Button im **Modul-Header** erreicht, nicht über den Sidebar-Footer.

## Zukunft (nicht in M0)

- **Domain-spezifischer Account-Switcher**, falls SaaS-Phase mehrere Accounts pro User erlaubt.
- **Recently visited modules** als zusätzliche Quick-Access-Section.
- **Pinned domains** wenn ein User dutzende Domains hat.
- **Last-module-per-domain memorization** (Cookie oder DB-Feld).
