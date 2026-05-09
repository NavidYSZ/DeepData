# ADR-0003: Hosting auf Coolify (eigener VPS)

- **Status:** accepted
- **Datum:** 2026-05-09
- **Beteiligt:** user, claude

## Kontext

v1 läuft bereits auf Coolify (single-container, SQLite-Volume). v2 braucht zusätzlich Postgres + Redis + Worker. Frage: Coolify weiter, Vercel (managed), oder Bare-Docker auf VPS.

## Entscheidung

Coolify bleibt. v2 wird als **Multi-Service** auf demselben VPS gehostet:

```
Coolify-VPS
├── web      — Next.js (Public via Coolify Proxy + Let's Encrypt)
├── worker   — BullMQ-Consumer (intern, gleiche Codebase wie web)
├── postgres — Coolify-Service, intern auf 5432
└── redis    — Coolify-Service, intern auf 6379
```

Nur `web` ist public, alle anderen Services nur im Docker-Netz erreichbar.

## Konsequenzen

- Selbe Hosting-Toolchain wie v1 → keine Lernkurve, kein neuer Provider-Lock-in.
- DB-Backup-Routine (heute manuell `cp sqlite.db`) wird durch `pg_dump`-Cron ersetzt; Runbook in [`../09-operations/runbooks.md`](../09-operations/runbooks.md).
- DNS-/TLS-Verwaltung bleibt Coolify (Let's Encrypt automatisch).
- Kostenkontrolle: ein VPS reicht initial für Solo-Phase. SaaS-Skalierung kann später Coolify-Multi-Server oder Move auf managed Postgres bedeuten — dann eigenes ADR.

## Verworfen weil

- **Vercel:** Vendor-Lock-in, teurer ab Worker/Cron, kein einfacher Multi-Service-Platzieren von Postgres+Redis ohne Drittanbieter.
- **Bare-Docker / docker-compose ohne Coolify:** verlangsamt Deploy-Cycle, kein integriertes TLS.
