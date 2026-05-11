---
adr: 0010
title: M1 nutzt GSC-Live-Daten, keine Postgres-Snapshots
status: accepted
date: 2026-05-09
deciders: claude (auf Anweisung user)
last-updated: 2026-05-09
---

# ADR-0010 — M1 nutzt GSC-Live-Daten, keine Postgres-Snapshots

## Kontext

Jede Modul-Page in v2, die GSC-Daten braucht (Rankings, Ranking-Analysen, Dashboard, Content Gap, Traffic Share, Content Structure), muss eine Architektur-Entscheidung treffen: liest sie GSC live bei jedem Request, oder persistiert ein Daily-Sync-Job die Daten in Postgres und Module lesen aus Postgres?

v1 hat ausschließlich live gelesen — jeder Filter-Wechsel ist ein neuer GSC-API-Call. Das hat Konsequenzen:

- **Pro Live:** immer aktuell, kein Sync-Job, kein Schema, weniger M1-Backend-Aufwand.
- **Pro Snapshot:** Filter-Wechsel ist schnell, GSC-Quota geschont, Verlauf über 16 Monate hinaus möglich, server-side Joins mit Crawl-Daten möglich.

## Entscheidung

**M1 nutzt GSC-Live-Daten ausschließlich.** Kein Sync-Job, kein Snapshot-Schema, keine Postgres-Tabellen für GSC-Metrics. Jede Sub-Page macht ihre eigenen GSC-Calls und nutzt SWR für Client-Side-Caching.

Das gilt zunächst für alle M1–M4-Module mit GSC-Bedarf (Rankings, Ranking-Analysen, Data Explorer, Dashboard).

## Konsequenzen

**Vereinfacht in M1:**

- Kein `gsc_url_metric_daily`-/`gsc_query_metric_daily`-Schema.
- Kein BullMQ-Sync-Job für GSC — die GSC-OAuth-Pipeline (Token-Refresh) bleibt aber.
- Kein Stale-State-Banner für Rankings & Co. — Daten sind immer live.
- Refresh-Action ist `swr.mutate()`, kein Sync-Job-Trigger.

**Limitierungen, die wir akzeptieren:**

- **16-Monats-Limit von GSC** vererbt sich. Module können keine ältere Historie zeigen.
- **Quota-Verbrauch:** Eine Modul-Page mit komplexen Filtern macht 1–2 GSC-Calls pro Öffnen + 1 pro Filter-Wechsel. Bei 10 Modulen × aktive Domains × Filter-Wechseln kann das gegen GSC-Limits gehen. Wir beobachten und reagieren, wenn nötig.
- **Filter-Wechsel ist langsam** (so wie in v1).
- **Δ-Spalten** (z.B. "Position vs 28d davor" in Rankings/kombiniert) brauchen einen zweiten GSC-Call. Quota-Verbrauch verdoppelt sich pro Page.
- **Kein Server-Side-Join mit Crawl-Daten** in M1. Internal Link Analysis (M3) baut sich seine Joins client-side oder per dedizierter API-Route, die zwei Live-Calls bracht und joint.

**Wenn geändert wird:** Sobald ein Modul Server-Side-Joins zwingend braucht (z.B. Internal Links mit Crawl-×-GSC-Aggregation, Content Structure mit Cluster-×-GSC-Aggregation), oder GSC-Quota in der Praxis zum Problem wird, holen wir Snapshots additiv nach. Dann:

- Eigene ADR (ADR-0011) für Snapshot-Schema und Sync-Job.
- Module wechseln einzeln auf „read Postgres, fallback GSC live".
- Bestehende Live-Calls bleiben (für Force-Refresh-Actions).

## Alternativen, die wir verworfen haben

- **Hybrid sofort (Postgres-Snapshots + GSC-Live).** Empfohlen war es, aber User-Entscheidung am 2026-05-09: M1 schlank halten, Snapshots additiv bei Bedarf.
- **„Erstmal Live, Schema-vorbereiten".** Klingt clever, ist aber Halbwerk: Schema ohne Sync-Job ist toter Code. Wir warten bis ein konkretes Modul es zwingend braucht.

## Referenzen

- [`../01-functional/module-rankings.md`](../01-functional/module-rankings.md) — erstes Modul, das nach dieser ADR gebaut wird
- [`../10-roadmap/module-sequencing.md`](../10-roadmap/module-sequencing.md) M1
- v1-Code als Vorbild für Live-Ansatz: [`app/api/gsc/query/route.ts`](../../app/api/gsc/query/route.ts), [`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts)
