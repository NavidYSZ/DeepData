# ADR-0002: Tech-Stack v2

- **Status:** accepted
- **Datum:** 2026-05-09
- **Beteiligt:** user, claude
- **Übersicht:** [`../07-software-architecture/tech-stack.md`](../07-software-architecture/tech-stack.md) (Single Source of Truth)

## Kontext

v1 läuft auf Next 14 + Prisma + SQLite + NextAuth + custom shadcn-Sidebar + AI-SDK-Chat. Daraus sind drei Probleme erwachsen:

1. **SQLite skaliert nicht** für persistente Modul-Snapshots, JSONB-Felder oder mehrere parallele Worker. Initial-Analysis (M1+) braucht beides.
2. **Pragmatisches Schema-Wachstum mit Prisma** funktioniert, aber Drizzle erlaubt feinere Kontrolle über Postgres-Features (jsonb, enums, partielle Indexe), die v2-Module brauchen.
3. **NextAuth + custom Sidebar + assistant-ui** sind drei Welten, die in v2 vereinheitlicht werden sollen.

Der User hat sich nach Optionen-Analyse für einen "Vollen Rewrite (SEO11-Stack)" entschieden — unter expliziter Streichung des Chat-Agenten ([ADR-0008](ADR-0008-no-chat-in-v2.md)).

## Entscheidung

| Bereich | Wahl | Detail-ADR |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) | — |
| Sprache | **TypeScript** strict | — |
| UI-Lib | **shadcn** (Radix + Tailwind 4), `lucide-react` Icons; Sidebar = `sidebar-07` | [ADR-0009](ADR-0009-sidebar-07.md) |
| Hosting | **Coolify** auf eigenem VPS | [ADR-0003](ADR-0003-hosting-coolify.md) |
| DB | **PostgreSQL 16+** | [ADR-0004](ADR-0004-database-and-orm.md) |
| ORM | **Drizzle** + `drizzle-kit` | [ADR-0004](ADR-0004-database-and-orm.md) |
| Auth | **Better Auth** + Drizzle-Adapter | [ADR-0005](ADR-0005-auth-and-tenancy.md) |
| Multi-Tenancy | `account_id`-Scoping + `withAccount`-Wrapper | [ADR-0005](ADR-0005-auth-and-tenancy.md) |
| Job-Queue | **BullMQ** + Redis | [ADR-0006](ADR-0006-job-queue.md) |
| Validation | **Zod** | — |
| Linter/Formatter | **Biome** | — |
| Tests | **Vitest** (Unit/Integration), **Playwright** (E2E) | — |
| Charts | **recharts** (übernehmen aus v1) | — |
| Tabellen | **TanStack Table** v8 (übernehmen aus v1) | — |
| Graph-Vis | **reactflow** (übernehmen aus v1, für Cluster/Internal-Links) | — |
| Datei-I/O | **xlsx**, **csv-parse**, **csv-stringify** (übernehmen aus v1) | — |

**Bewusst nicht im Stack:**

- `@assistant-ui/react`, `@ai-sdk/openai` (entfallen mit [ADR-0008](ADR-0008-no-chat-in-v2.md)).
- LLM-Modell-Routing-Konvention (`MODELS.heavy/routine`) entfällt analog. Kann später zurückkehren, wenn ein Use-Case für LLM-Aufrufe außerhalb von Chat auftritt (z.B. "Strategy-Findings aus Modul-Daten generieren" — dann eigenes ADR).

## Konsequenzen

- Stack-Migration ist nicht trivial: alle v1-Module müssen unter Next 16 / Drizzle / Better Auth neu verdrahtet werden. Detail-Migrations-Plan kommt pro Modul.
- Die ausgereiften v1-Domain-Bibliotheken ([`lib/gsc/aggregate.ts`](../../lib/gsc/aggregate.ts), [`lib/internal-links/`](../../lib/internal-links/), [`lib/keyword-workspace/`](../../lib/keyword-workspace/)) sind grundsätzlich portierbar (sind reine TypeScript-Logik), aber die Persistenz-Adapter (Prisma-Calls) müssen ersetzt werden.
- Postgres + jsonb ermöglicht flexible Modul-Daten-Felder (`UrlSnapshot.topQueriesJson` etc.) ohne Schema-Migrationen.
- BullMQ + Redis ermöglicht echte Initial-Analysis-Pipelines.
- Coolify als Hosting bleibt — aber als Multi-Service-Setup (web + postgres + redis + worker), nicht single-container.
