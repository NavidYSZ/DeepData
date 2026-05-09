---
status: leer
last-updated: 2026-05-09
owner:
---

# Modul: Internal Link Analysis (Parent mit Sub-Pages)

Wird in Phase 5 erarbeitet.

**Sidebar-Position:** Analysen
**URL-Routing:** `/d/[id]/internal-links` (Default = opportunity-matrix), Sub-Pages

**Zweck:** Quick Wins für interne Verlinkung finden. Welche Seiten ranken bereits nahe Top-Positionen, sind aber intern schwach unterstützt? Wo liegen die größten Hebel?

**Sub-Pages:**

- **Opportunity Matrix (Default)** — Bubble-Chart Position-Nähe × Linkdefizit, Bubble-Größe = Impressions, vier Quadranten (Quick Wins / Linkaufbau prüfen / Low Priority / Content/Snippet prüfen). Filter: Cluster, Device.
- **URL Inspector** — Beim Klick auf eine Bubble: Detail-View mit Inlinks/Outlinks, Anchor-Verteilung, Quick-Win-Score, konkrete Link-Empfehlungen (Quelle-URL, Anchor-Vorschlag, Priorität).

**Backend (größtenteils übernehmbar aus v1):** [`lib/internal-links/`](../../lib/internal-links/) — `crawler.ts`, `anchor-classifier.ts`, `gsc-sync.ts`, `scoring.ts`, `cluster.ts`, `service.ts`.

**v1-UI:** [`app/(dashboard)/internal-links/page.tsx`](../../app/(dashboard)/internal-links/page.tsx) (~175 B, fast leer) → wird komplett neu gebaut.

**Datenquellen:** eigener Crawler (Inlinks/Outlinks/Anchor-Texte/Placement), GSC (Position/Impressions/Clicks pro URL), Cluster-Mapping (initial pfad-basiert, später aus Keyword Clustering).

**Abhängigkeit:** Crawl & Track muss bereits gelaufen sein.
