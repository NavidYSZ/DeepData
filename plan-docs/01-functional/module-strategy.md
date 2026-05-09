---
status: leer
last-updated: 2026-05-09
owner:
---

# Modul: Strategy

Wird in Phase 5 erarbeitet. **Komplett neu**. Pro Domain ein strukturierter Strategie-Datensatz: Kategorien (initial: `technical` / `content` / `optimize`) mit priorisierten **Findings** (`title`, `description`, `priority`, `status`, `evidence`, `recommendation`).

**Wichtig wegen [ADR-0008](../decisions/ADR-0008-no-chat-in-v2.md):** keine Agent-Befüllung. Findings entstehen entweder regelbasiert aus Modul-Daten, per dediziertem nicht-Chat-LLM-Aufruf (eigenes ADR falls nötig), oder rein manuell. Entscheidung im Modul-Spec.

Der User kann Findings als `done` / `dismissed` markieren, neue manuell hinzufügen.
