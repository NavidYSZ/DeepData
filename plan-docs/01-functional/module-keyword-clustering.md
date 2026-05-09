---
status: leer
last-updated: 2026-05-09
owner:
---

# Modul: Keyword Clustering (Parent mit Sub-Pages)

Wird in Phase 5 erarbeitet.

**Sidebar-Position:** Workspace
**URL-Routing:** `/d/[id]/clustering` (Default = pre), Sub-Pages

**Zweck:** Keyword-Arbeitsfläche mit drei klar getrennten Modi: erst lexical pre-clustern, dann SERP-basierte Cluster-Runs, dann manuell verfeinern.

**Sub-Pages:**

- **Pre-Cluster (Default)** — Lexical (Snowball-Stemming + char-ngrams + Louvain), Vorbild [`lib/keyword-workspace/precluster.ts`](../../lib/keyword-workspace/precluster.ts). Cards-Ansicht mit Top-5 Keywords pro Cluster.
- **SERP-Cluster** — Zyte-basierte URL-Overlap-Cluster mit Subcluster + Parent-Mapping. Vorbild [`lib/keyword-workspace/serp-cluster.ts`](../../lib/keyword-workspace/serp-cluster.ts) (33 KB — Refactor sinnvoll).
- **Manual-Cluster** — React-Flow Workspace zum Verschieben, Mergen, Splitten von Clustern. Mit Keyword-Drawer + Drag&Drop. UI komplett neu.

**Backend stabil:** [`lib/keyword-workspace/`](../../lib/keyword-workspace/) und Prisma-Modelle (`Precluster`, `Cluster`, `SerpClusterRun`, `SerpSubcluster`, `SerpParentCluster`, `WorkspaceEvent`) sind portierbar.

**v1-UI:** [`app/(dashboard)/keyword-workspace/page.tsx`](../../app/(dashboard)/keyword-workspace/page.tsx) ist eine 73-KB-Single-File — muss in mehrere Komponenten zerlegt und auf das Module-View-Pattern gebracht werden. Vollbild-Modus aus v1 (`isKeywordWorkspace`-Flag) entfällt zugunsten konsistenter Modul-Anatomie.

**Daten-Modell:** `Project` → `Domain` umbenennen (siehe [`../00-product/glossary.md`](../00-product/glossary.md)). Pro Domain ein impliziter Cluster-Workspace; v1's expliziter `KeywordProject` kann entfallen, wenn jede Domain eh genau ein Cluster-Setup hat — zu klären im Modul-Spec.

**v1-Doku:** [`/docs/keyword-workspace/01-architecture.md`](../../docs/keyword-workspace/01-architecture.md) bis `05-external-keyword-import.md`.
