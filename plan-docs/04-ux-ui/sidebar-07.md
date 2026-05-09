---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# Sidebar (shadcn `sidebar-07`)

> Detail-Spec der Navigations-Shell. Entscheidung: [`../decisions/ADR-0009-sidebar-07.md`](../decisions/ADR-0009-sidebar-07.md). **Top-Level-Gruppen sind hier als Vorschlag dokumentiert und stehen offen für User-Review** — die Modul-Sortierung ist der größte nächste Diskussionspunkt.

## Anatomie

```
┌─ Header ──────────────┐
│ [Logo]  Domain-Switcher │  ← Combobox: alle Domains des Accounts + „+ neue Domain"
│                         │     Im Collapsed-State: nur Logo + ein kleiner Domain-Initial-Avatar
├─ Content (Gruppen) ─────┤
│ Group-Label             │  ← nur sichtbar im Expanded-State
│   ◦ Modul A   [icon]   │  ← jedes Modul: Lucide-Icon + Label, im Collapsed nur Icon
│   ◦ Modul B   [icon]   │
│ Group-Label             │
│   ◦ Modul C   [icon]   │
│ …                       │
├─ Footer ───────────────┤
│ [Settings-Icon]         │  ← öffnet /account/settings (Account-Level)
│ [User-Avatar]   Name    │  ← Dropdown: Sign-out, Theme-Toggle
└───────────────────────┘
```

**Toggle:** Standard-shadcn-Trigger (oben rechts außerhalb der Sidebar oder via `Cmd+B`).

**Active-State:** über `usePathname()`, der aktive Modul-Eintrag bekommt `data-active`. Die zugehörige Gruppe wird visuell leicht hervorgehoben (subtler Hintergrund auf dem Group-Label im Expanded-State).

## Routing

- Modul-Eintrag `Internal Links` → `/d/[domainId]/internal-links`
- Modul-Eintrag `Rankings` → `/d/[domainId]/rankings`
- … (URL-Routing-Spec: [`../03-information-architecture/url-routing.md`](../03-information-architecture/url-routing.md))

## Top-Level-Gruppen — **Vorschlag, zu finalisieren**

v1 hatte „Keywords / Insights / Tools / Crawl / Settings" — vermischt Datenquellen (Keywords) mit Erkenntnissen (Insights) mit Tools (was eigentlich auch Insights sind) und Modus-Wechsel (Crawl). Das funktioniert nicht.

Mein Vorschlag basiert auf der Frage „was tut der User, wenn er klickt":

### Vorschlag A — nach „Aktivität" (klassisch SEO-Workflow)

```
Überblick                     [Home-Icon]
  ◦ Dashboard                  → /d/[id]

Daten erkunden                 (Datenquellen anschauen)
  ◦ Rankings                   → /d/[id]/rankings   (verschmilzt v1 by Query + by Site)
  ◦ Data Explorer              → /d/[id]/data-explorer
  ◦ Crawl & Track              → /d/[id]/crawl-track

Analysen                       (algorithmische Insights)
  ◦ Position vs CTR            → /d/[id]/position-ctr   (heute seo-bubble)
  ◦ Top Mover                  → /d/[id]/top-mover
  ◦ Kannibalisierung           → /d/[id]/cannibalization
  ◦ Internal Link Analysis     → /d/[id]/internal-links
  ◦ Content Gap                → /d/[id]/content-gap
  ◦ Content Structure & CJ     → /d/[id]/content-structure
  ◦ Traffic Share              → /d/[id]/traffic-share

Workspace                      (User-Arbeitsflächen)
  ◦ Keyword Clustering         → /d/[id]/clustering
  ◦ Content Writing            → /d/[id]/content-writing
  ◦ Strategy                   → /d/[id]/strategy
  ◦ Notes                      → /d/[id]/notes
```

### Vorschlag B — nach „Output-Typ"

```
Überblick
  ◦ Dashboard

SEO-Analysen                   („was zeigt mir die Daten?")
  ◦ Rankings
  ◦ Position vs CTR
  ◦ Top Mover
  ◦ Kannibalisierung
  ◦ Internal Link Analysis
  ◦ Content Gap
  ◦ Content Structure & CJ
  ◦ Traffic Share
  ◦ Crawl & Track
  ◦ Data Explorer

Arbeit & Output                („was baue ich aktiv?")
  ◦ Keyword Clustering
  ◦ Content Writing
  ◦ Strategy
  ◦ Notes
```

### Vorschlag C — nach „Customer Journey im SEO-Prozess"

```
Sichtbar werden                (Status quo verstehen)
  ◦ Dashboard
  ◦ Rankings
  ◦ Top Mover
  ◦ Position vs CTR
  ◦ Traffic Share

Probleme finden                (was läuft schief?)
  ◦ Kannibalisierung
  ◦ Crawl & Track
  ◦ Internal Link Analysis

Chancen erkennen               (wo wachsen?)
  ◦ Content Gap
  ◦ Content Structure & CJ
  ◦ Keyword Clustering
  ◦ Data Explorer

Umsetzen                       (was tun?)
  ◦ Content Writing
  ◦ Strategy
  ◦ Notes
```

## Offene Fragen für UX-Review

1. **Welcher Vorschlag (A / B / C / Mischung)?** — wir klären das im nächsten Schritt.
2. **Default-Modul beim Domain-Wechsel** — Dashboard? Letzte Modul-Auswahl gemerkt? Rankings als Default?
3. **Sind „Internal Link Analysis", „Content Gap", „Traffic Share", „Content Structure & CJ" wirklich alle gleichwertig in der Sidebar, oder sind einige davon Sub-Module von etwas Größerem?**
4. **Content Writing:** Brief-Generator? Outline? Text-Drafting? — das beeinflusst, ob es ein eigener Sidebar-Eintrag oder eine Aktion *innerhalb* von Content Gap/Structure ist.
5. **Notes / Memory:** als eigener Sidebar-Eintrag oder als Drawer/Sheet, der von jedem Modul aus erreichbar ist?
6. **Account-Level vs. Domain-Level Settings:** Account-Settings (Billing, GSC-Connections) liegen außerhalb von `/d/[domainId]/...`, vermutlich unter `/account/...`. Soll der Footer-Settings-Eintrag dorthin springen, oder gibt es Domain-Settings ebenfalls?

Die Antworten auf diese Fragen entscheiden, welche Modul-Skelette wir in [`../01-functional/`](../01-functional/) als eigenständige Module anlegen — und in welcher Reihenfolge wir sie spec'en.
