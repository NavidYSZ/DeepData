---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# Layout-Shell

Layout-Hierarchie auf Next.js App-Router-Ebene. Zeigt, **welche Schicht was rendert** und wie Module darin eingebettet sind.

## Hierarchie

```
RootLayout                                                  app/layout.tsx
└─ ThemeProvider, Toaster, fonts, viewport, analytics
   └─ (root)Layout                                         app/(root)/layout.tsx
   │  └─ keine Sidebar; rendert /, /sign-in, /sign-up, /welcome
   │
   └─ (account)Layout                                      app/(account)/layout.tsx
   │  └─ simple Header, keine Sidebar; rendert /account/settings
   │
   └─ DomainLayout                                         app/d/[id]/layout.tsx
      └─ SidebarProvider, Sidebar (sidebar-07), DomainHeader
         └─ ModulePage                                     app/d/[id]/<modul>/page.tsx
            └─ ModulePageHeader, FilterBar, StatsRow, SectionCard...
```

## Top-Level-Routes

| Route | Layout | Was passiert |
|---|---|---|
| `/` | (root) | nicht eingeloggt: Redirect `/sign-in`. Eingeloggt + 0 Domains: Redirect `/welcome`. Eingeloggt + n Domains: Redirect `/d/[ersteDomain]`. |
| `/sign-in`, `/sign-up` | (root) | Better-Auth-Forms. Keine Sidebar. |
| `/welcome` | (root) | 0-Domains-Onboarding. Hostname-Eingabe + GSC-OAuth-Flow. |
| `/account/settings` | (account) | Account-Level: Profil, GSC-Connections, Domains-Liste, Billing-Stub (Phase 2 SaaS). |
| `/d/[id]` | DomainLayout | Dashboard — Default-Modul. |
| `/d/[id]/<modul>` | DomainLayout | Modul-Pages. URL-Schema: `/d/[id]/<modul>` und `/d/[id]/<modul>/<sub>` (siehe [`sidebar-07.md`](sidebar-07.md)). |
| `/d/[id]/settings` | DomainLayout | Domain-Settings: Hostname-Edit, GSC-Property-Bindung, Crawler-Frequenz, Re-Sync-Trigger. |

## DomainLayout: was es rendert

```
┌─────────────┐┌─ DomainHeader ──────────────────────────────────┐
│           ││ [☰] Domain › Modul › Sub-Page    [Action-Slot] │
│  Sidebar  │├─ ModulePage ────────────────────────────────┤
│  (07)     ││  ModulePageHeader                                  │
│           ││  SubTabBar (optional)                              │
│           ││  FilterBar                                         │
│           ││  StatsRow (optional)                               │
│           ││  SectionCard…                                      │
└───────────┘└────────────────────────────────────────────────┘
```

### DomainHeader (oberhalb der ModulePage, **nicht** Teil der ModulePage)

- **SidebarTrigger** (`Cmd+B`) — standardisiertes shadcn-Icon links.
- **Breadcrumb** — Domain-Hostname › Modul-Name › optional Sub-Page-Name. Domain ist klickbar (springt zu Dashboard), Modul-Name ist klickbar (springt zu Modul-Default-Sub).
- **Action-Slot** rechts — globale Page-Actions, die nicht modul-spezifisch sind. Zum Beispiel:
  - Sync-Status-Indikator („GSC zuletzt synced vor 2h")
  - Notification-Bell
  - Domain-Settings-Icon (öffnet `/d/[id]/settings`)

Der DomainHeader ist sticky (`sticky top-0 z-10 bg-background border-b`). Modul-spezifische Actions liegen im **ModulePageHeader-Action-Slot** weiter unten, nicht hier.

## Welcome-Layout (0-Domains-Zustand)

Wenn ein User keine Domains angelegt hat: `/welcome` rendert ohne Sidebar. Single-Column, zentriert.

```
┌─ (root)Layout (kein DomainLayout, weil keine Domain gewählt) ─┐
│ Logo  Account-Avatar                                       │
├────────────────────────────────────────────────────────────────┤
│                                                            │
│         Willkommen bei DeepData                            │
│         Lege deine erste Domain an, um zu beginnen.        │
│                                                            │
│         [Domain anlegen]                                   │
│         (öffnet Hostname-Form + GSC-OAuth)                 │
│                                                            │
└────────────────────────────────────────────────────────────────┘
```

Nach erfolgreichem Anlegen der ersten Domain: Redirect zu `/d/[neueDomain]` (Dashboard).

## URL-Schema-Entscheidung: `/d/[id]/...`

- **`/d/`** statt `/domains/` — kurz, häufig getippt. Konsistent mit der Konvention vieler Tools (Linear: `/team/`, Vercel: `/[team]/`).
- **`[id]`** ist die Domain-ID (UUID oder ULID, **nicht** der Hostname). Der Hostname kann sich ändern, ohne URLs zu brechen. Ableitung im Modul-Header zeigt aber den Hostnamen.
- **`/d/[id]/<modul>/<sub>`** — zwei Sub-Ebenen reichen (kein `/d/[id]/<modul>/<sub>/<detail>` als Page; Detail-Ansichten in einem Modul öffnen Drawer/Modal oder navigieren in andere Module über Cross-Refs).

## Was hier **nicht** dazu gehört

- **Modul-Anatomie** (PageHeader, FilterBar, SectionCard) → [`module-view-pattern.md`](module-view-pattern.md)
- **Sidebar-Inhalt** (Gruppen, Items, Sub-Pages) → [`sidebar-07.md`](sidebar-07.md)
- **States** (Loading, Empty, Error) → [`states.md`](states.md)
