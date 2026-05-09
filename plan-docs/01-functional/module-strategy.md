---
status: leer
last-updated: 2026-05-09
owner:
---

# Modul: Strategy (Parent mit Sub-Pages: Findings + Notes)

Wird in Phase 5 erarbeitet.

**Sidebar-Position:** Workspace
**URL-Routing:** `/d/[id]/strategy` (Default = findings), Sub-Pages

**Zweck:** Pro Domain ein strukturierter Strategie-Datensatz **plus** ein Notizen-Bereich. Beides zusammen ist die „Gedächtnis-Schicht" der Domain.

**Sub-Pages:**

- **Findings (Default)** — Strukturierte Befunde in Kategorien (initial: `technical` / `content` / `optimize`), priorisiert (high/medium/low), mit Status (`open` / `in_progress` / `done` / `dismissed`), Description, Recommendation und Evidence (Cross-Refs zu Modul-Daten).
- **Notes** — Freie Notizen pro Domain. Kategorisierbar (Fakt, Entscheidung, Notiz, Erinnerung), Volltext-Suche, Cross-Refs zu Modul-Daten („Notiz zu URL X", „Notiz zu Cluster Y"). MVP ohne Vector-Search.

**Wichtig wegen [ADR-0008](../decisions/ADR-0008-no-chat-in-v2.md):** keine Agent-Befüllung. Findings entstehen entweder regelbasiert aus Modul-Daten, per dediziertem nicht-Chat-LLM-Aufruf (eigenes ADR falls nötig), oder rein manuell. Notes sind rein User-geschrieben.

**Datenmodell:**

- `strategy` (eine Row pro Domain, Versionierung TBD)
- `finding` (n pro Strategy, mit `category`, `priority`, `status`, `evidence_json`)
- `note` (n pro Domain, mit `category`, `body`, `cross_refs_json`, `created_at`)

**Cross-Use:** 

- **Dashboard** zeigt Strategy-Snapshot (Anzahl offener High-Priority-Findings)
- **Internal Link Analysis** kann Quick-Wins als `optimize`-Findings vorschlagen
- Jedes Modul kann „Notiz hinzufügen"-Action haben, die einen Note-Eintrag mit Cross-Ref zur aktuellen Modul-Sicht anlegt
