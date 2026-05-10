---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# Design-System (Tokens + shadcn-Basis)

Minimaler Tokens-Satz für v2. Alles was hier nicht steht: shadcn-Defaults.

## Strategie

- **shadcn-Defaults respektieren.** v2 baut auf `dashboard-01` + `sidebar-07` Registry-Blöcken auf. Keine eigenen Theme-Variants in M0.
- **Brand minimal.** Ein Akzent (DeepData-Blau-Familie) für primäre Actions, sonst neutral.
- **Dark-Mode first-class** — v1 hatte Dark-Mode, soll bleiben. Theme-Provider in RootLayout.

## Farben

### Brand-Akzent (`--primary`)

Wird im Modul-Spec konkretisiert (spätester Zeitpunkt: vor M0-Implementierung). Bis dahin: shadcn-Default-Slate-Blau.

### Status-Farben (semantisch)

Für Trends, Diffs, Findings-Prioritäten:

| Token | Hex (Light) | Bedeutung |
|---|---|---|
| `--success` | `#16a34a` (green-600) | Gewinner, positive Diffs, Status `done` |
| `--warning` | `#d97706` (amber-600) | Warnungen, Stale-Banner, Status `in_progress` |
| `--destructive` | `#dc2626` (red-600) | Verlierer, Errors, hohe Priorität |
| `--neutral` | `#71717a` (zinc-500) | Status `dismissed`, Neutral-Diffs |

Dark-Mode-Varianten: shadcn-Konvention (`-foreground`-Suffix, leicht aufgehellt).

## Spacing-Skala

Tailwind-Default: 1, 2, 3, 4, 6, 8, 12, 16. Keine Custom-Werte in v2.

- **Innerhalb** SectionCard: `space-y-4`
- **Zwischen** Bausteinen (Header ↔ FilterBar ↔ StatsRow ↔ SectionCard): `space-y-6`
- **Container**-Padding: `px-4 py-6 md:px-8 md:py-8`

## Typography

Tailwind-Default-Skala. Konvention:

- **Modul-Titel** (h1 in ModulePageHeader): `text-2xl font-semibold tracking-tight`
- **Section-Titel** (Card-Header): `text-base font-medium`
- **Body**: `text-sm`
- **Label**: `text-xs text-muted-foreground`
- **KPI-Wert** (StatsRow): `text-2xl font-semibold tabular-nums`

Fonts: System-Stack (`font-sans` von Tailwind = Inter-fallback). Keine Custom-Fonts in M0.

## Border-Radius

shadcn-Standard. `rounded-md` für Karten, `rounded-sm` für inline Chips, `rounded-full` für Avatare/Status-Dots.

## Charts (Recharts)

- **Theme:** Recharts respektiert kein CSS-Vars out-of-the-box. Wir definieren ein gemeinsames `chartColors`-Objekt in `lib/charts.ts`, das die Status-Farben + 6 neutrale Cluster-Farben liefert.
- **Bubble-Chart-Konvention** (Position vs CTR, Opportunity Matrix): X-Achse links → rechts = besser → schlechter (Position 1 links). Y-Achse unten → oben = niedrig → hoch.
- **Line-Chart-Konvention** (Verlaufs-Charts): X = Zeit (links → rechts), Y = Wert. Position-Charts haben Y invertiert (Position 1 oben), nutzen `reversed`-Prop.

## Lucide-Icons

shadcn-Default-Stil: 16-20px, `stroke-width=1.5`. Konventionen:

- Modul-Icons in der Sidebar: 20px
- Inline-Icons in Buttons: 16px
- Status-Icons in StatsRow-Tiles: 20px

## Was später

- Brand-Color-Refinement (eigene Hue, evtl. Custom-Logo-abgeleitet) — vor M0 zu klären.
- Domain-Avatar-Farben (Hash-basiert? Manuell wählbar?) — mit Domain-Anlage-Spec.
- Print-Styles für Reports — wenn ein Export-Feature kommt.
