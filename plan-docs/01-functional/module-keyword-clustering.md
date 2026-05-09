---
status: leer
last-updated: 2026-05-09
owner:
---

# Modul: Keyword Clustering

Wird in Phase 5 erarbeitet. **Backend stabil aus v1 portieren** ([`lib/keyword-workspace/`](../../lib/keyword-workspace/) ist die ausgereifteste Code-Insel im v1-Repo: Pre-Cluster (lexical + Louvain), SERP-Cluster-Runs mit Zyte, Subcluster + Parent-Mapping). **UI dringend refaktor-bedürftig** (heute monolithische 73-KB-Single-File [`app/(dashboard)/keyword-workspace/page.tsx`](../../app/(dashboard)/keyword-workspace/page.tsx)).

v1-Doku: [`/docs/keyword-workspace/`](../../docs/keyword-workspace/) (4 Detail-Specs).

In v2 evtl. Begriffe neu fassen (vgl. [`../00-product/glossary.md`](../00-product/glossary.md): „Projekt" → „Domain"; eventuell `cluster_workspace` als Sub-Konzept).
