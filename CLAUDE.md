# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Wichtig (Stand 2026-05-09):** Es läuft eine **v2-Planungsphase**. Code im Repo ist weiterhin v1. Die v2-Vision, Architektur, Modul-Specs und ADRs leben in **[`plan-docs/`](plan-docs/)**. Bei Aufgaben, die v2 betreffen (neue Module, Sidebar-Umbau, Architektur-Änderungen), gelten ausschließlich die plan-docs-Konventionen unten. Bei reinen v1-Bugfixes weiter wie bisher (Abschnitte „Architecture", „Scope discipline" gelten dafür unverändert).

## What this project is (v1)

A multi-tenant Google Search Console dashboard (Next.js 14 App Router, TypeScript, Prisma + SQLite, NextAuth). Authenticated users connect one or more Google accounts, pick a GSC property, and explore performance data through several analysis views (by Query, by Site, Top Mover, Data Explorer, Kannibalisierung, Internal Links, Keyword Workspace, Chat Agent).

## What v2 will be

Siehe [`plan-docs/00-product/product-vision.md`](plan-docs/00-product/product-vision.md). Stack-Wechsel auf Next 16 + Drizzle + Postgres + Better Auth (siehe ADRs in [`plan-docs/decisions/`](plan-docs/decisions/)). Die heutige v1-Codebase wird Modul-für-Modul abgelöst.

## Commands (v1, weiterhin gültig solange v1-Code im Repo lebt)

```bash
npm run dev          # next dev (uses .env.local; DATABASE_URL=file:./data/sqlite.db)
npm run build        # next build
npm run lint         # next lint
npx tsc --noEmit     # typecheck (no test suite is set up)
npx prisma generate  # regenerate Prisma client after schema changes
```

There is no test runner configured. Validate v1-Änderungen mit `npx tsc --noEmit` und `npm run lint`.

### Working with migrations locally (v1)

The bare `.env` has `DATABASE_URL=file:/app/data/sqlite.db` (the production Docker path) and `.env.local` has `file:./data/sqlite.db`. `prisma migrate dev` reads `.env`, so it will fail locally with a read-only filesystem error unless you override:

```bash
DATABASE_URL="file:./data/sqlite.db" npx prisma migrate dev --name <name>
```

When this is impractical, hand-write the migration SQL under `prisma/migrations/<TIMESTAMP>_<name>/migration.sql` so it ships and gets applied on deploy.

## Deployment (v1, Coolify auf VPS)

The Dockerfile `CMD` runs `npx prisma migrate deploy && npm run start` on container start. `npm start` itself calls `db:prepare`, which has a **destructive fallback**:

```
prisma migrate deploy || (echo 'Migration failed – resetting DB' && rm -f /app/data/sqlite.db && touch /app/data/sqlite.db && prisma migrate deploy)
```

If a migration fails on deploy, the production SQLite database is wiped. Always back up `/app/data/sqlite.db` (Coolify Terminal: `cp /app/data/sqlite.db /app/data/sqlite.db.backup-<date>`) before pushing schema changes, and watch the deploy log for "Migration failed – resetting DB".

The container image is `node:20-alpine` and does not include `sqlite3`. To inspect the DB on the server, either `apk add --no-cache sqlite` or use `npx prisma migrate status` / a small `node -e` script with the Prisma client.

## Architecture (v1, Kurzfassung)

Detail-Inventar in [`plan-docs/v1-status-quo/`](plan-docs/v1-status-quo/). Hier nur das Notwendigste:

- `app/(dashboard)/` ist eine Route-Group mit gemeinsamen Layout (Sidebar + Header + `SiteProvider`). Site-Auswahl in `localStorage`.
- `app/api/` gruppiert nach Domäne: `gsc/` (sites + searchAnalytics), `agent/`, `internal-links/`, `keyword-workspace/`, `accounts/`, `auth/`.
- GSC-Zugriff geht immer durch [`lib/gsc-access.ts`](lib/gsc-access.ts) → Multi-Account-Resolver + Token-Refresh + [`lib/gsc.ts`](lib/gsc.ts).
- Geteilte Aggregationslogik in [`lib/gsc/aggregate.ts`](lib/gsc/aggregate.ts) (impression-gewichtete Position, Sample-Size-Threshold, Cannibalization-Dedup) — **diese Helfer sind Produkt-Intent, nicht Display-Polish**, immer wiederverwenden.
- Domain-Module unter `lib/`: `internal-links/`, `keyword-workspace/`, `agent/`, `crawl/` (mock).
- Prisma-Schema mischt Auth, Chat, Keyword-Workspace, Crawler — siehe [`plan-docs/v1-status-quo/03-datenmodell.md`](plan-docs/v1-status-quo/03-datenmodell.md) für annotierte Übersicht.
- UI-Konventionen: shadcn-style unter `components/ui/`, Dashboard-Composites unter `components/dashboard/` (insbesondere `page-shell.tsx` mit `PageHeader`, `FilterBar`, `SectionCard`, `StatsRow`).
- Pfad-Alias: `@/*` → Repo-Root.

## Scope discipline (v1-Bugfixes)

When the request is "make these numbers look right," prefer client-side filtering/aggregation tweaks (in `lib/gsc/aggregate.ts` and the affected view). Adding new Prisma models, sync/cron mechanisms, derived metrics, or hook-heavy auto-fetch layers requires explicit, specific approval — generic "okay" on a multi-option proposal is not enough.

## v2 — `plan-docs/` ist das persistente Projektgedächtnis

`plan-docs/` ist die **Single Source of Truth** für alles, was nicht direkt im Code steht: Vision, Architektur, Specs, Entscheidungen, Bug-Historie. Es ist **kein Archiv** — es ist eine lebende Dokumentation, die kontinuierlich gepflegt wird.

Einstiegspunkt: [`plan-docs/README.md`](plan-docs/README.md).

### Lese-Pflicht (vor jeder v2-Aufgabe)

- **Allgemeine v2-Frage** → [`plan-docs/00-product/product-vision.md`](plan-docs/00-product/product-vision.md) + [`glossary.md`](plan-docs/00-product/glossary.md)
- **Modul-Arbeit** → `plan-docs/01-functional/module-<name>.md` + zugehörige `02-user-flows/*` + `05-data-contracts/*`
- **Architektur-Frage** → `plan-docs/07-software-architecture/*` + relevante ADRs in [`plan-docs/decisions/`](plan-docs/decisions/)
- **Daten-/API-Frage** → `plan-docs/05-data-contracts/*` + `06-data-flow/*`
- **UI-/UX-Frage** → `plan-docs/04-ux-ui/*` (insbes. [`sidebar-07.md`](plan-docs/04-ux-ui/sidebar-07.md))

Arbeite bei v2-Aufgaben **nie aus Erinnerung allein** — verifiziere immer im aktuellen Stand der Plan-Docs.

### Schreib-Pflicht (automatisch, ohne Aufforderung)

Aktualisiere `plan-docs/` proaktiv, sobald einer dieser Trigger eintritt:

| Trigger | Aktion |
|---------|--------|
| Architektur- oder Produkt-Entscheidung getroffen | Neuer ADR in [`plan-docs/decisions/`](plan-docs/decisions/) (Template: [`_template.md`](plan-docs/decisions/_template.md)) |
| Code-Änderung umgesetzt | Eintrag in [`plan-docs/changelog.md`](plan-docs/changelog.md) (Datum, Modul, Was, Warum, Refs) |
| Bug gefunden + behoben | Eintrag in [`plan-docs/error-fix-log.md`](plan-docs/error-fix-log.md) (Symptom, Root Cause, Fix, Prävention) |
| Spec geändert / präzisiert | Update der betroffenen Plan-Doc + Verweis im Changelog |
| Neuer Begriff eingeführt | Ergänzung in [`plan-docs/00-product/glossary.md`](plan-docs/00-product/glossary.md) |
| Tech-Stack-Änderung | ADR + Update von [`plan-docs/07-software-architecture/tech-stack.md`](plan-docs/07-software-architecture/tech-stack.md) |

Diese Updates sind **Teil der jeweiligen Aufgabe**, nicht optional und nicht für später.

### Workflow-Regeln für v2

1. **Kein Code ohne approved Plan-Doc** für das betroffene Modul. Wenn die Plan-Doc fehlt oder lückenhaft ist, erst Plan-Doc schreiben/ergänzen, vom User approven lassen, dann implementieren.
2. **Modul-für-Modul-Implementierung**, nicht horizontal über mehrere Module gleichzeitig.
3. **Keine Improvisation:** Wenn eine Spec eine Frage offen lässt, frage den User oder ergänze die Spec — entscheide nicht still beim Coden.
4. **Approval gilt pro Doc.** Eine Plan-Doc gilt erst als verbindlich, nachdem der User sie reviewt und approved hat. Bis dahin ist sie ein Vorschlag (Status `erstversion` oder `in-review`).

### Sprache

- **Plan-Docs:** Deutsch
- **Code, Dateinamen, Variablen, API-Felder, Identifier, Commit-Messages, Inline-Kommentare:** Englisch
- Begründung: [`plan-docs/decisions/ADR-0001-doc-language.md`](plan-docs/decisions/ADR-0001-doc-language.md)
