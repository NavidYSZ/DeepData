---
status: leer
last-updated: 2026-05-09
owner:
---

# Modul: Crawl & Track

Wird in Phase 5 erarbeitet. v1 hat das Modul nur als Mock-Phase-1 ([`app/crawl/`](../../app/crawl/), [`/plan and notes.md`](../../plan%20and%20notes.md)). v2 muss echten Crawl-Job, Diff-Erkennung pro URL, Kalender-View für Änderungen liefern.

Cross-Use mit Rankings: Klick auf eine URL-Änderung springt in den Rankings-Verlauf der URL und zeigt einen Marker zum Change-Datum.

Wiederverwendung: Crawler-Code aus [`lib/internal-links/crawler.ts`](../../lib/internal-links/crawler.ts), Modelle aus geplanten v1-Tabellen (`CrawlRun`/`CrawlUrlSnapshot`/`CrawlChangeEvent`).

Frequenz: täglich (genau ein Crawl pro Tag laut User-Notiz, damit Kalender lesbar bleibt).
