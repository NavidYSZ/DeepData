---
status: leer
last-updated: 2026-05-09
owner:
---

# Modul: Ranking-Analysen (Parent mit Sub-Pages)

Wird in Phase 5 erarbeitet.

**Sidebar-Position:** Analysen
**URL-Routing:** `/d/[id]/ranking-analysen` (Default = top-mover), Sub-Pages

**Zweck:** Bündelt drei algorithmische Insight-Sichten, die alle dieselben GSC-Daten konsumieren, aber unterschiedliche Fragen beantworten.

**Sub-Pages:**

- **Top Mover** ([details](module-top-mover.md)) — Period-vs-Period-Vergleich. Übernommen aus v1.
- **Position vs CTR** ([details](module-position-vs-ctr.md)) — Bubble-Chart für Snippet-/Title-Optimierungs-Kandidaten. Refaktor (33 KB v1-File zerlegen).
- **Kannibalisierung** ([details](module-cannibalisation.md)) — Mehrere URLs ranken für ein Keyword. Übernommen aus v1.

**Geteilte Bibliothek:** [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts), [`lib/cannibalization.ts`](../../lib/cannibalization.ts) müssen erhalten bleiben.

**Default-Sub-Page:** Top Mover (größter Action-Wert: „was hat sich gerade verändert?").
