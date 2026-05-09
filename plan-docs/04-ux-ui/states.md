---
status: leer
last-updated: 2026-05-09
owner:
---

# Empty / Loading / Error / Stale States

Wird in Phase 2 erarbeitet. Eine konsistente State-Sprache für alle Module:

- **Empty:** „Noch keine Daten" (vor erster Initial Analysis) vs. „keine Treffer in dieser Filterung"
- **Loading:** Skeleton-Pattern (TanStack-Table-Row-Skeletons, Chart-Skeletons)
- **Error:** Inline-Card mit Retry, fehler-spezifisch (Auth/Quota/Server)
- **Stale:** „Daten sind X Stunden alt — jetzt aktualisieren?" mit Refresh-Action
