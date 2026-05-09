---
status: leer
last-updated: 2026-05-09
owner:
---

# Sub-Modul: Kannibalisierung

Wird in Phase 5 erarbeitet als Sub-Page von [`module-ranking-analysen.md`](module-ranking-analysen.md).

**URL:** `/d/[id]/ranking-analysen/cannibalization`
**v1-Vorbild:** [`app/(dashboard)/kannibalisierung/page.tsx`](../../app/(dashboard)/kannibalisierung/page.tsx).

Mehrere URLs ranken für dasselbe Keyword. Logik aus [`lib/cannibalization.ts`](../../lib/cannibalization.ts) und [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts) (impressions-gewichtete Position, Toleranzband, Dedup) bleibt; UI in das Module-View-Pattern überführen.
