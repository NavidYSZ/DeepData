# ADR-0004: PostgreSQL + Drizzle

- **Status:** accepted
- **Datum:** 2026-05-09
- **Beteiligt:** user, claude

## Kontext

v1 nutzt SQLite + Prisma. v2 benötigt:

- Mehrere parallele Schreiber (Web + BullMQ-Worker)
- jsonb-Felder für Modul-Daten (heute via JSON-Strings in SQLite simuliert)
- Postgres-spezifische Features (partielle Indexe, GIN, evtl. pgvector für semantische Suche)
- Sauberen Migrations-Workflow ohne destruktiven Fallback (siehe v1-`db:prepare`-Risiko)

## Entscheidung

- **DB:** PostgreSQL 16+ als Coolify-Service, intern erreichbar.
- **ORM:** Drizzle + `drizzle-kit` für Schema-Definition und Migrations.
- **JSON-Felder:** wo passend `jsonb` (z.B. `UrlSnapshot.topQueries`, Modul-Konfig-Blobs).
- **Enums:** als Drizzle-pgEnum, nicht als Free-Text-Spalten (entgegen v1).
- **Migrations:** SQL-First (`drizzle-kit generate` → reviewable SQL → `drizzle-kit migrate` auf Deploy). **Kein destruktiver Fallback.**

## Konsequenzen

- Klare Trennung Schema-Code (`lib/db/schema/*.ts`) vs. Query-Code.
- Migrations sind reviewbar bevor sie deployt werden.
- Postgres-spezifische Features stehen offen.
- pgvector kann später additiv eingeführt werden, wenn Memory/Notes Embedding-Suche braucht (eigenes ADR, wenn relevant).
- Backup: `pg_dump`-Cron via Coolify (Runbook).

## Verworfen weil

- **SQLite weiter:** kein paralleler Schreibzugriff (Worker würde lock-loopen), keine jsonb-Operatoren, nicht horizontal skalierbar.
- **Prisma weiter:** funktioniert grundsätzlich, aber Drizzle ist näher am SQL und passt besser zu komplexen Modul-Queries (Joins über Cluster/SubcCluster/Members aus dem Keyword-Workspace).
- **Supabase / managed Postgres:** unnötiger Anbieter-Lock-in, wenn Coolify schon Postgres als Service kann.
- **MongoDB:** Modul-Daten sind relational (Domains ↔ Module ↔ Runs — viele Joins), kein NoSQL-Vorteil.
