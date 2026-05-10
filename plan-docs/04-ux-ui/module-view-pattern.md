---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# Module-View-Pattern

Universelle Anatomie für **jede** Modul-Page in v2. Alle Modul-Specs in [`../01-functional/`](../01-functional/) verweisen darauf.

## Warum ein Pattern?

v1 hat keine konsistente Modul-Anatomie. Jede Page hat ihren eigenen Header, ihre eigenen Filter-Layout, ihre eigene Empty-State-Sprache, ihren eigenen Sub-Nav. Konsequenz: jeder neue View muss UI-Details neu erfinden, und der User muss bei jedem Modul-Wechsel die Sprache der UI neu lernen.

v2 hat **eine** Modul-Anatomie. Jede Modul-Page setzt sie zusammen aus den gleichen Bausteinen.

## Anatomie

```
┌─ ModulePageHeader ────────────────────────────────────────┐
│ Modul-Titel                                       [Action-Slot] │
│ Subtext (optional, max 1 Zeile)                                 │
├─ SubTabBar (NUR wenn das Modul Sub-Pages hat) ───────────────┤
│ [Sub-A] [Sub-B] [Sub-C]                                          │
├─ FilterBar ────────────────────────────────────────┤
│ [DateRange] [Cluster] [Device] [Country]   [More ⋯] [Reset]      │
├─ StatsRow (optional, max 1 Zeile, 3-6 Tiles) ───────────────┤
│ [Tile A]   [Tile B]   [Tile C]   [Tile D]                       │
├─ SectionCard (Haupt-Arbeitsbereich) ────────────────────┤
│ Card-Header (kontextueller Subtext, optionaler Card-Action-Slot)│
│ ————————————————————————————————————————————————————│
│ Primär-Visual: Tabelle, Chart, Bubble-Chart, Liste…             │
└─ (optional weitere SectionCards, gleiche Anatomie) ───────────┘
┌─ LegendDrawer (rechts ausklappbar, kontextuell) ────────────┐
│ [?]                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Bausteine im Detail

### `ModulePageHeader`

- **Titel** — H1, eindeutiger Modul-Name. Identisch zum Sidebar-Label.
- **Subtext** (optional) — max 1 Zeile, erklärt das Modul in einem Satz. Beispiel: *„GSC-Keyword-Rankings, kombiniert oder gesplittet nach Query/URL."*
- **Action-Slot** rechts — modul-spezifische Top-Actions. Beispiele: Refresh-Button, Sync-Now, Domain-Settings-Icon (wenn Domain-spezifisch konfigurierbar), Export-Button.

Nicht-Verhandelbar: Der Header ist **immer** da, auch wenn Subtext und Action-Slot leer sind. So bekommt jede Page denselben vertikalen Rhythmus.

### `SubTabBar` (nur für Module mit Sub-Pages)

Direkt unter dem Header. Horizontale Tab-Leiste, URL-getrieben.

- Active-State per `usePathname()`.
- Klick wechselt URL ohne Page-Reload (Next.js Link).
- Sub-Tab „kombiniert" bei Rankings ist die Default-Sub-Page (URL = Parent ohne Sub-Suffix).
- Sub-Tabs erben die FilterBar des Parents — jede Sub-Page rendert nur ihre eigene SectionCard.

Gilt für (gemäß Sidebar-07):

- Rankings (per Query / per URL / kombiniert)
- Ranking-Analysen (Top Mover / Position vs CTR / Kannibalisierung)
- Internal Link Analysis (Opportunity Matrix / URL Inspector)
- Keyword Clustering (Pre / SERP / Manual)
- Strategy (Findings / Notes)

### `FilterBar`

Eine Zeile mit modul-relevanten Filtern. **Reihenfolge fix nach Konvention** (von links):

1. **DateRange** (immer Last-28d/Last-90d/Last-180d/Custom; Default Last-28d gemäß GSC-Konvention)
2. **Cluster-Picker** (wo zutreffend; ohne Auswahl = alle)
3. **Device** (Desktop / Mobile / Both)
4. **Country**
5. **More…** — ein Dropdown mit weiteren Modul-spezifischen Filtern (z.B. „Position-Threshold", „Impressions-Mindest")
6. **Reset** — setzt alle Filter auf Default

Filter-State liegt in der URL (Search-Params), damit der Stand teilbar ist.

Nicht jedes Modul braucht alle Filter (Strategy z.B. braucht keinen DateRange). Aber wenn ein Filter auftritt, dann an dieser Position.

### `StatsRow` (optional)

KPI-Kacheln in einer Zeile, max 6, mobile umbrechend. Gleiche Anatomie:

- Label (klein, oben)
- Value (groß, mittig)
- Delta (klein, unten, mit Trend-Pfeil; grün/rot/neutral)

Nicht jedes Modul braucht eine StatsRow (Workspace-Module wie Strategy/Notes nicht). Aber wo sie da ist, ist sie der zweite Bestandteil nach FilterBar.

### `SectionCard`

Der Haupt-Arbeitsbereich. Card mit `border` + `rounded-md` + `p-4`.

- **Card-Header** (optional): kontextueller Untertitel (z.B. „147 Quick Wins, 3 davon mit hoher Priorität") + optionaler Card-Action-Slot rechts (z.B. View-Switch Tabelle↔Chart, Filter-Reset auf Card-Ebene).
- **Body**: das primäre Visual.

Manche Module haben mehrere SectionCards untereinander (z.B. Dashboard mit StatsRow + Top-3-Findings + GSC-Snapshot-Chart + Crawl-Activity-Card). Die Karten haben eine Vertical-Gap (siehe Spacing).

### `LegendDrawer` (optional)

Rechts oben in der SectionCard ein `?`-Icon öffnet einen Sheet-Drawer mit Erklärungen zur aktuellen Sicht. Beispiel: bei der Opportunity Matrix erklärt der Drawer die vier Quadranten und den Quick-Win-Score.

Konsistenz wichtiger als Vollständigkeit: lieber ein Drawer pro Modul mit klaren Begriffen als jede Karte einzeln annotiert.

## Spacing

- Container: `max-w-screen-2xl mx-auto px-4 py-6 md:px-8 md:py-8`
- Vertikaler Abstand zwischen Bausteinen: `space-y-6`
- Innerhalb SectionCard: `space-y-4`

Unabhängig von der Sidebar-Breite haben alle Module dieselbe Container-Logik. Auf breiten Screens entsteht ein Whitespace-Rand — das ist okay, weil viele Module Tabellen mit fester Spaltenbreite haben.

## Quer-Verlinkungen zwischen Modulen

Jede Tabellen-Zeile, jede Bubble, jeder Cluster-Chip kann anklickbar sein und einen anderen Modul-View mit vorbefüllten Filtern öffnen.

**Konvention:**

- Klick auf eine **URL** → öffnet `Rankings/per URL` mit der URL als Filter.
- Klick auf einen **Cluster** → öffnet `Keyword Clustering/Manual` mit dem Cluster fokussiert.
- Klick auf eine **Bubble** in der Opportunity Matrix → öffnet `Internal Links/URL Inspector` mit dieser URL.
- Klick auf ein **Finding** in Strategy → öffnet das Quell-Modul mit den Evidence-Filtern aktiv.

Die spezifischen Cross-Refs werden pro Modul im Modul-Spec festgehalten.

## Was hier **nicht** dazu gehört

- **Sidebar-Anatomie** → [`sidebar-07.md`](sidebar-07.md)
- **States (Empty/Loading/Error/Stale)** → [`states.md`](states.md)
- **Layout-Hierarchie (RootLayout, DomainLayout)** → [`layout-shell.md`](layout-shell.md)
- **Tokens (Farben, Spacing-Skala, Typography)** → [`design-system.md`](design-system.md)
