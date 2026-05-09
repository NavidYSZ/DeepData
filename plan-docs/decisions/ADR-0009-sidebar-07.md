# ADR-0009: shadcn `sidebar-07` als Navigations-Shell

- **Status:** accepted
- **Datum:** 2026-05-09
- **Beteiligt:** user, claude
- **Detail-Spec:** [`../04-ux-ui/sidebar-07.md`](../04-ux-ui/sidebar-07.md)

## Kontext

v1 nutzt eine custom shadcn-style Sidebar ([`components/dashboard/app-sidebar.tsx`](../../components/dashboard/app-sidebar.tsx) + [`components/ui/sidebar.tsx`](../../components/ui/sidebar.tsx)) mit unklarer Top-Level-Struktur:

- Header: Logo + Property-Picker
- Gruppen: „Keywords / Insights / Tools" (vermischen Datenquellen mit Analysearten)
- Footer: Crawl + Settings (Settings ist als Group-Label betitelt, was inkonsistent ist)
- Collapsing nur über manuelle CSS-Klassen
- Property-Picker im Header überlebt das Collapsing nicht sauber

v2 braucht eine Sidebar mit klarer Hierarchie und sauberem Collapsing.

## Entscheidung

- **Block:** shadcn `sidebar-07` („A sidebar that collapses to icons."). Installiert via `npx shadcn@latest add sidebar-07`.
- **Header:** Domain-Switcher (Combobox) + Branding-Logo. Kein zusätzlicher Property-Picker — die Domain *ist* die Property.
- **Footer:** Settings + User-Menu (Avatar + Sign-out).
- **Collapsed-State:** nur Icons sichtbar; aktive Modul-Gruppe leicht hervorgehoben; Hover öffnet Tooltip mit Modul-Name.
- **Top-Level-Gruppen:** wird in [`../04-ux-ui/sidebar-07.md`](../04-ux-ui/sidebar-07.md) gemeinsam mit dem User finalisiert (offene Frage: „wie strukturieren wir den Mischmasch aus SEO-Tools, Analysen, fertigen Auswertungen, Workspace-Settings").
- **Modul-Routing:** jedes Modul = eigener Sidebar-Eintrag mit Lucide-Icon + Label. Active-State über `usePathname()`. Kein interner React-State — URL ist Source of Truth.

## Konsequenzen

- Bestehender [`components/ui/sidebar.tsx`](../../components/ui/sidebar.tsx) wird ersetzt; bestehender [`app-sidebar.tsx`](../../components/dashboard/app-sidebar.tsx) komplett neu geschrieben.
- Property-Picker (heute [`property-menu.tsx`](../../components/dashboard/property-menu.tsx)) entfällt; Domain-Switcher übernimmt seine Rolle.
- Mobile-Verhalten: shadcn-Default (Drawer) — Detail-Spec später, wenn relevant.
- Tailwind 4 ist kompatibel; keine Migrationssorgen für den Block.
- Top-Level-Modul-Sortierung wird in Modul-Reviews evtl. noch verschoben — Sidebar-Spec ist Living-Doc bis M0-Done.

## Verworfen weil

- **v1-Sidebar weiter, nur aufgeräumt:** keine echte Verbesserung; das Collapsing-Problem bleibt.
- **Andere shadcn-Sidebar-Variants (01–06, 08…):** explizite User-Wahl auf 07 — Icon-Collapse ist zentrales UX-Bedürfnis.
- **Custom-Build:** unnötiger Aufwand; shadcn-Block deckt 95% ab.
