# ADR-0006: BullMQ + Redis als Job-Queue

- **Status:** accepted
- **Datum:** 2026-05-09
- **Beteiligt:** user, claude

## Kontext

v2-Module brauchen asynchrone Verarbeitung:

- Initial Analysis: pro Domain je Modul ein Job, parallel/staggered
- Crawl & Track: zeitintensive Site-Crawls
- SERP-Cluster-Runs: Zyte-Calls in Wellen, mit Reuse-Cache
- Wiederkehrende Refresh-Jobs (z.B. tägliche GSC-Aktualisierung)

Next.js Route-Handler haben Vercel-typische Timeout-Limits, und auf Coolify wären lange synchrone Requests trotzdem schlecht (blockieren den Web-Worker, machen UI-Polling lahm). Wir brauchen einen separaten Worker-Prozess.

## Entscheidung

- **Queue-Library:** BullMQ.
- **Storage:** Redis (Coolify-Service, intern auf 6379, kein Public-Endpoint).
- **Worker-Service:** eigener Coolify-Service `worker`, gleiche Codebase wie `web`, anderer Entry-Point (`node worker.ts` o.ä.).
- **Job-Patterns:**
  - **Single-shot Jobs** — Initial Analysis Trigger, Crawl-Run, SERP-Cluster-Run. Status über `analysis_run.status` plus BullMQ-Job-State.
  - **Recurring Jobs** — tägliche/wöchentliche Refresh-Cycles via BullMQ-Repeat-Patterns.
  - **Job-Dependencies** — z.B. „Rankings-Refresh nach Crawl-Refresh" via BullMQ Flow oder explizites Enqueue im Completion-Hook.
- **Konvention:** Job-Handler liegen in `lib/jobs/<modul>/<job>.ts`. Job-Schemata mit Zod validiert. Job-Namen sind konstante Strings in einem Enum.
- **Observability:** Job-Status-Inspector (lokal: BullMQ-UI / Redis-Insight; Prod: minimaler Status-Endpoint im Admin-Bereich oder Bull-Board hinter Auth).

## Konsequenzen

- Multi-Service-Setup (web + worker + postgres + redis) — docker-compose-Komplexität steigt, aber Coolify trivialisiert das.
- Redis hat kein Persistence-by-Default; für Job-Loss-Resilienz aktivieren wir AOF / RDB Snapshots (Runbook).
- Wir müssen pro Job entscheiden: idempotent? retryable? Backoff? — als Konvention pro Modul-Spec dokumentieren.
- BullMQ kann komplexe Flows (Job-Trees, Job-Dependencies) — wir nutzen das initial sparsam, weil es Debug-Komplexität bringt.

## Verworfen weil

- **Postgres als Queue (z.B. via `pg-boss`):** spart Redis, aber BullMQ ist reifer + flexibler + besser dokumentiert.
- **Inngest / Trigger.dev:** managed, aber Vendor-Lock-in und kostenpflichtig ab Skala.
- **Cron in Next.js / Vercel-Cron:** geht nicht ohne Vercel; Coolify-Cron würde funktionieren, aber decked nicht den Single-shot-Job-Fall ab.
- **Synchron im Route-Handler:** UI-Friere bei langen Jobs, Coolify-Worker blockiert.
