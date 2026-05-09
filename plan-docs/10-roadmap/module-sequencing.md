---
status: leer
last-updated: 2026-05-09
owner:
---

# Modul-Reihenfolge in der Implementierung

Wird in Phase 1 nach Sidebar-Diskussion erarbeitet. Diese Doc legt die **Build-Order** fest — anders als die [`planning-sequence.md`](planning-sequence.md), die die **Plan-Order** festlegt.

Kriterien für die Reihenfolge:

- **USP-Wert pro Modul** — was zeigt am schnellsten den v2-Wert?
- **Infrastruktur-Lift** — erstes Modul, das Crawler braucht, bürdet die Crawler-Infrastruktur als Sunk-Cost; spätere Module profitieren davon.
- **Daten-Abhängigkeiten** — Module, die Cluster-Mappings konsumieren, müssen nach dem Cluster-Modul kommen (oder mit pfad-basiertem Fallback).
- **Reife der v1-Entsprechung** — Module, deren v1-Backend bereits stabil ist (z.B. Internal-Links-Logik), lassen sich schneller portieren.
