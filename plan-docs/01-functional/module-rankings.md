---
status: leer
last-updated: 2026-05-09
owner:
---

# Modul: Rankings (Parent mit Sub-Pages)

Wird in Phase 5 erarbeitet.

**Sidebar-Position:** Daten erkunden
**URL-Routing:** `/d/[id]/rankings` (Default = kombiniert), `/d/[id]/rankings/query`, `/d/[id]/rankings/url`

**Zweck:** GSC-Keyword-Rankings dargestellt aus zwei Perspektiven (per Query, per URL) plus eine kombinierte/bereinigte Default-Sicht. **Verschmilzt v1 by Query + by Site** in ein Modul mit drei Sub-Pages.

**Sub-Pages:**

- **per Query** — übernommen aus v1 [`app/(dashboard)/rank-tracker/page.tsx`](../../app/(dashboard)/rank-tracker/page.tsx). Doku: [`/docs/rank-tracker.md`](../../docs/rank-tracker.md).
- **per URL** — übernommen aus v1 [`app/(dashboard)/url-tracker/page.tsx`](../../app/(dashboard)/url-tracker/page.tsx).
- **kombiniert (Default)** — *neu*. Bereinigte Sicht: nur höchstrankende URL pro Keyword (User-Wunsch aus Vague-Info-Briefing). Toggle für Rohdaten.

**Datenquellen:** GSC live + Postgres-Snapshots für Verlauf.

**Cross-Use:** Im Verlaufsgraph einer URL optionaler Marker bei „Crawl & Track erkannte Änderung" — Klick springt in `/d/[id]/crawl-track` zum Diff.

**Geteilte Helfer aus v1:** [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts) (impressions-gewichtete Position) muss erhalten bleiben.
