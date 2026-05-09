---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# Tech-Stack v2 (Single Source of Truth)

> **Diese Datei ist autoritativ.** Tech-Annahmen kommen ausschließlich von hier — nicht aus README, alten v1-Docs oder Slack.

## Zusammenfassung

| Bereich | Wahl | Status | Detail-ADR |
|---|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) | accepted | [ADR-0002](../decisions/ADR-0002-tech-stack.md) |
| Sprache | **TypeScript** strict | accepted | [ADR-0002](../decisions/ADR-0002-tech-stack.md) |
| UI-Lib | **shadcn** (Radix + Tailwind 4), `lucide-react` | accepted | [ADR-0002](../decisions/ADR-0002-tech-stack.md) |
| Sidebar | **shadcn `sidebar-07`** (collapses to icons) | accepted | [ADR-0009](../decisions/ADR-0009-sidebar-07.md) |
| Hosting | **Coolify** auf eigenem VPS | accepted | [ADR-0003](../decisions/ADR-0003-hosting-coolify.md) |
| DB | **PostgreSQL 16+** als Coolify-Service | accepted | [ADR-0004](../decisions/ADR-0004-database-and-orm.md) |
| ORM | **Drizzle** + `drizzle-kit` | accepted | [ADR-0004](../decisions/ADR-0004-database-and-orm.md) |
| Auth | **Better Auth** + Drizzle-Adapter | accepted | [ADR-0005](../decisions/ADR-0005-auth-and-tenancy.md) |
| Multi-Tenancy | `account_id`-Scoping + `withAccount`-Wrapper | accepted | [ADR-0005](../decisions/ADR-0005-auth-and-tenancy.md) |
| Job-Queue | **BullMQ** | accepted | [ADR-0006](../decisions/ADR-0006-job-queue.md) |
| Cache / Rate-Limit / Queue-Storage | **Redis** als Coolify-Service | accepted | [ADR-0006](../decisions/ADR-0006-job-queue.md) |
| Validation | **Zod** | accepted | [ADR-0002](../decisions/ADR-0002-tech-stack.md) |
| Tests | **Vitest** (Unit/Integration), **Playwright** (E2E) | accepted | [ADR-0002](../decisions/ADR-0002-tech-stack.md) |
| Linter/Formatter | **Biome** | accepted | [ADR-0002](../decisions/ADR-0002-tech-stack.md) |
| Charts | **recharts** (übernehmen aus v1) | accepted | — |
| Tabellen | **TanStack Table** v8 | accepted | — |
| Graph-Vis | **reactflow** + **dagre** (Cluster, Internal-Links) | accepted | — |
| Datei-I/O | **xlsx**, **csv-parse**, **csv-stringify**, **iconv-lite** | accepted | — |
| HTML-Parsing | **cheerio** (Crawler) | accepted | — |
| Concurrency | **p-limit** | accepted | — |
| Cluster-Math | **graphology** + **graphology-communities-louvain**, **ml-distance**, **natural** (Stemming) | accepted | — |
| Date | **date-fns** | accepted | — |
| Toast | **sonner** | accepted | — |
| Theme | **next-themes** | accepted | — |

## Coolify-Service-Topologie

Vier Services im selben Docker-Netz, drei davon **kein Public-Endpoint**:

```
┌────────────────────────────────────────────────┐
│           Coolify auf VPS                     │
│                                                │
│   ┌───────────┐   ┌────────────┐   ┌──────┐   │
│   │   web     │──▶│  postgres  │◄──│ worker│   │
│   │ (Next.js) │   │   :5432    │   │ BullMQ│   │
│   │           │──▶┌────────────┐   │consumer│ │
│   │           │   │   redis    │◄──│        │ │
│   └───────────┘   │   :6379    │   └────────┘ │
│         ▲         └────────────┘                  │
│         │                                       │
│  Public Domain (TLS via Coolify+Let's Encrypt)│
└───────────────────────────────────────────────────┘
```

- `web`: Next.js Server (öffentlich via Coolify-Proxy, Let's Encrypt)
- `worker`: gleiche Codebase wie `web`, anderer Entry-Point (BullMQ-Consumer)
- `postgres`: Coolify-Service, intern auf 5432, persistentes Volume
- `redis`: Coolify-Service, intern auf 6379, AOF-Persistenz aktiviert (siehe Runbook)

## Bewusst nicht im Stack

- **`@assistant-ui/react`, `@ai-sdk/openai`** — entfallen mit [ADR-0008](../decisions/ADR-0008-no-chat-in-v2.md). Kein Chat in v2.
- **LLM-Modell-Routing-Konvention** (`MODELS.heavy/routine`) — entfällt analog. Kann später zurückkehren, wenn LLM-Aufrufe außerhalb von Chat nötig werden (z.B. Strategy-Findings-Generierung) — dann eigenes ADR.
- **NextAuth, Prisma, SQLite, AES-Token-Encryption** (alles v1, in v2 abgelöst).

## Bewusst aufgeschoben (entscheiden mit dem jeweiligen Modul)

- **SERP-API-Provider** (Content Gap, Keyword Clustering) — v1 nutzt Zyte; ob v2 dabei bleibt, ist Modul-Spec.
- **Crawler:** v1 hat eigenen `cheerio`-Crawler. v2 muss entscheiden ob bleiben oder extern (z.B. Apify) — ADR mit dem Crawl-&-Track-Modul.
- **Vector-DB für Notes-Suche:** vermutlich `pgvector` als Postgres-Extension, falls Notes-Modul semantische Suche braucht.
- **Email-Versand** (Auth-Flows): kommt mit User-Onboarding-Spec.

## Versions-Disziplin

- Diese Doc wird mit **jedem** ADR aktualisiert, der eine Stack-Zeile betrifft.
- Bei Stack-Änderungen: **erst** ADR schreiben, **dann** diese Tabelle anpassen, **dann** Code anfassen.
- Status `erstversion` → wird nach Implementierung-Start des ersten Slices auf `approved` gehoben (sofern keine Anpassung mehr nötig).
