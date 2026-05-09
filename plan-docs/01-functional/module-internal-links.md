---
status: leer
last-updated: 2026-05-09
owner:
---

# Modul: Internal Link Analysis

Wird in Phase 5 erarbeitet. **Kandidat „UI komplett neu, Backend portieren"**: v1-Backend ist stabil ([`lib/internal-links/`](../../lib/internal-links/)), aber UI ist unfertig. v2-UI nach Vorbild der SEO11-Agent-Konzepte: **Opportunity Matrix als Landing** (Bubble-Chart Position-Nähe × Linkdefizit) + **URL Detail Inspector** beim Klick (Anchor-Verteilung, Link-Empfehlungen).

Daten: eigener Crawler (Inlinks/Outlinks/Anchor-Texte), GSC (Position/Impressions/Clicks pro URL), Cluster-Mapping (initial pfad-basiert).

Kern-Berechnung: **Quick-Win-Score** als Funktion aus Position-Nähe, Impressions, Inlink-Defizit relativ zum Cluster-Median, Anteil generischer Anchors.
