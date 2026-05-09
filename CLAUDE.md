# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A multi-tenant Google Search Console dashboard (Next.js 14 App Router, TypeScript, Prisma + SQLite, NextAuth). Authenticated users connect one or more Google accounts, pick a GSC property, and explore performance data through several analysis views (by Query, by Site, Top Mover, Data Explorer, Kannibalisierung, Internal Links, Keyword Workspace, Chat Agent).

## Commands

```bash
npm run dev          # next dev (uses .env.local; DATABASE_URL=file:./data/sqlite.db)
npm run build        # next build
npm run lint         # next lint
npx tsc --noEmit     # typecheck (no test suite is set up)
npx prisma generate  # regenerate Prisma client after schema changes
```

There is no test runner configured. Validate changes with `npx tsc --noEmit` and `npm run lint`.

### Working with migrations locally

The bare `.env` has `DATABASE_URL=file:/app/data/sqlite.db` (the production Docker path) and `.env.local` has `file:./data/sqlite.db`. `prisma migrate dev` reads `.env`, so it will fail locally with a read-only filesystem error unless you override:

```bash
DATABASE_URL="file:./data/sqlite.db" npx prisma migrate dev --name <name>
```

When this is impractical, hand-write the migration SQL under `prisma/migrations/<TIMESTAMP>_<name>/migration.sql` so it ships and gets applied on deploy.

## Deployment (Coolify on a VPS)

The Dockerfile `CMD` runs `npx prisma migrate deploy && npm run start` on container start. `npm start` itself calls `db:prepare`, which has a **destructive fallback**:

```
prisma migrate deploy || (echo 'Migration failed – resetting DB' && rm -f /app/data/sqlite.db && touch /app/data/sqlite.db && prisma migrate deploy)
```

If a migration fails on deploy, the production SQLite database is wiped. Always back up `/app/data/sqlite.db` (Coolify Terminal: `cp /app/data/sqlite.db /app/data/sqlite.db.backup-<date>`) before pushing schema changes, and watch the deploy log for "Migration failed – resetting DB".

The container image is `node:20-alpine` and does not include `sqlite3`. To inspect the DB on the server, either `apk add --no-cache sqlite` or use `npx prisma migrate status` / a small `node -e` script with the Prisma client.

## Architecture

### Routing

`app/(dashboard)/` is a route group that shares [layout.tsx](app/(dashboard)/layout.tsx) — sidebar, header, and most importantly the `SiteProvider` (see [components/dashboard/site-context.tsx](components/dashboard/site-context.tsx)). The currently selected GSC property is stored in `localStorage` and consumed via `useSite()` everywhere. New dashboard views go inside this group so they get the property picker for free.

`app/api/` is grouped by domain: `gsc/` (sites + searchAnalytics), `agent/` (chat + runbooks), `internal-links/`, `keyword-workspace/`, `accounts/`, `auth/`.

### GSC access flow

A user can connect multiple Google accounts. The cookie `accountId` selects which one a request should use; the helper [lib/gsc-access.ts](lib/gsc-access.ts) takes `(userId, siteUrl, preferredAccountId?)`, finds the right `GscAccount`, decrypts its refresh token (via [lib/crypto.ts](lib/crypto.ts) using `ENCRYPTION_KEY`), refreshes it through [lib/google-oauth.ts](lib/google-oauth.ts), and returns `{ accessToken, accountId, accountEmail }`.

Every server-side GSC call goes through this path:

```
getServerSession(authOptions)          // user
  → cookies().get("accountId")         // optional preference
  → resolveUserSiteAccess(...)         // multi-account fan-out + token refresh
  → searchAnalyticsQuery(token, ...)   // lib/gsc.ts: thin wrapper over the GSC REST API
```

[app/api/gsc/query/route.ts](app/api/gsc/query/route.ts) is the single endpoint dashboard views POST to for raw GSC rows. It validates with Zod and supports pagination via `pageSize` + `startRow`.

### Numbers shared across views — `lib/gsc/aggregate.ts`

GSC's pre-aggregated "average position" is impression-weighted *for the queried period*; do **not** average it again unweighted across rows. Multiple views (Top Mover, Data Explorer, Rank Tracker, Cannibalization, agent analysis) need consistent treatment of:

- `weightedPosition(rows)` — impression-weighted average position
- `defaultImpressionThreshold(daySpan)` — sample-size-aware "ignore noise" threshold
- `dedupCannibalized(rows, tolerance, getGroup, getPosition)` — collapse multi-page rankings for the same keyword to the best-ranking page (with a tolerance band)
- `daySpan(start, end)`, `hasEnoughEvidence(...)`

Always import these helpers rather than recomputing in a view; the noise/cannibalization filters are part of the product's intent, not display polish. See [lib/cannibalization.ts](lib/cannibalization.ts) and [lib/agent/analysis.ts](lib/agent/analysis.ts) for the same impression-weighted pattern applied in their respective contexts.

### Domain modules in `lib/`

- `internal-links/` — owns its own crawler, anchor classifier, scoring, GSC sync, and Prisma persistence (`CrawlRun`, `UrlSnapshot`, `InternalLink`). Service entry point is [lib/internal-links/service.ts](lib/internal-links/service.ts).
- `keyword-workspace/` — keyword import/normalisation/clustering. Persisted via `KeywordProject`, `KeywordSource`, `Keyword`, `Precluster`, `Cluster`, `SerpSnapshot` in the Prisma schema.
- `agent/` — chat-runbook backbone (quick wins, content decay, cannibalization, top queries/pages, audit). Each runbook in [lib/agent/runbooks.ts](lib/agent/runbooks.ts) maps to an analysis function in [lib/agent/analysis.ts](lib/agent/analysis.ts) producing typed `UiBlock`s the chat surface renders.
- `crawl/` — currently mock data only; real crawling lives in `internal-links/crawler.ts`.

### Prisma / data layer

SQLite, accessed via the singleton in [lib/db.ts](lib/db.ts). The schema mixes auth (`User`, `Account`, `Session`, `GscAccount`), chat (`ChatSession`, `ChatMessage`, `ChatFile`), keyword workspace (large group of models), and crawler (`CrawlRun`, `UrlSnapshot`, `InternalLink`). Dashboard analytics views (Top Mover, Data Explorer, Rank Tracker, Dashboard, Kannibalisierung) deliberately have **no** persisted GSC table — they read live from the GSC API on every request. A previous attempt to add a `GscDailyMetric` cache layer was reverted; do not reintroduce it without explicit user confirmation.

### UI conventions

- shadcn-style components under `components/ui/` (Radix primitives + Tailwind).
- Dashboard-specific composites under `components/dashboard/` — notably `page-shell.tsx` (`PageHeader`, `FilterBar`, `SectionCard`, `StatsRow`), `site-context.tsx`, `rank-charts.tsx`, `data-explorer-table.tsx`, `queries-table.tsx`.
- Date ranges are managed via `MonthPresetRangePicker` and converted with `rangeToIso()` from [lib/date-range.ts](lib/date-range.ts).
- Path alias: `@/*` → repo root (see `tsconfig.json`).

## Scope discipline

When the request is "make these numbers look right," prefer client-side filtering/aggregation tweaks (in `lib/gsc/aggregate.ts` and the affected view). Adding new Prisma models, sync/cron mechanisms, derived metrics, or hook-heavy auto-fetch layers requires explicit, specific approval — generic "okay" on a multi-option proposal is not enough.
