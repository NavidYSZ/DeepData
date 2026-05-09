# ADR-0005: Auth & Multi-Tenancy

- **Status:** accepted
- **Datum:** 2026-05-09
- **Beteiligt:** user, claude
- **Detail-Doc:** [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md)

## Kontext

v1 nutzt NextAuth (JWT, Google-Provider) + custom `GscAccount`-Tabelle für GSC-Refresh-Tokens. v2 braucht:

- Email/Password-Login (nicht nur Google), damit der User onboard ohne Google-Konto starten kann
- Sauberes Tenant-Modell (Account → Domains), in v1 fehlt das völlig
- Convention-erzwungenes Tenant-Scoping in jedem DB-Query (sonst Daten-Leak-Risiko, sobald n:m kommt)
- OAuth-Connections für GSC (später weitere wie Bing/Ahrefs) als wiederverwendbares Pattern

## Entscheidung

- **Library:** Better Auth + `@better-auth/drizzle-adapter`.
- **Plugins:** `emailAndPassword`, `nextCookies`. OAuth-Plugins (Google für GSC-Scope) kommen mit Modul Internal Links / Rankings.
- **Tenant-Modell:**
  - `account` ist Tenant-Root (Spalte `id`, `name`, `created_at`, `updated_at`).
  - `user.default_account_id` zeigt auf den Tenant. M0: 1:1 (genau ein User pro Account). SaaS-Phase: n:m via `account_member`-Junction — späteres ADR.
  - **Alle** tenant-relevanten Tabellen tragen `account_id` mit FK auf `account.id` (`onDelete: cascade`).
- **Naming-Kollision:** Better Auths interne `account`-Tabelle (OAuth-Connections + Password-Hashes) wird auf `auth_account` umbenannt; unsere Tenant-Tabelle heißt `account`. Mapping im BA-Adapter.
- **Server-Side Enforcement:** Wrapper `withAccount(handler)` in `lib/with-account.ts`. Jede Server Action / API Route, die Tenant-Daten anfasst, wird damit gewrapped; alle DB-Queries im Handler filtern auf `eq(table.accountId, accountId)`.
- **Sign-up-Hook** (`databaseHooks.user.create.after`) legt automatisch eine Account-Row an und setzt `user.default_account_id`. Damit hat jeder neue User sofort einen leeren Workspace.
- **Edge-Middleware** macht nur Cookie-Presence-Check (kein DB-Roundtrip pro Request); echte Validation in Server Components / Server Actions.

## Konsequenzen

- Tenant-Isolation ist **Convention, nicht TS-erzwungen** — Reviewer müssen aktiv darauf achten. Defense-in-Depth via Postgres RLS später optional.
- M0 hat genau einen User → genau einen Account. n:m kommt später.
- GSC-OAuth wird via Better Auths `auth_account.provider_id="google"` umgesetzt, mit eigenem Scope-String. Token-Refresh übernimmt BA. Ersetzt v1-`GscAccount` mit AES-Encryption.
- Email-Verifikation, Password-Reset, 2FA bewusst nicht in M0.

## Verworfen weil

- **NextAuth weiter:** geht, aber Better Auth ist saubereres TS-API, hat eingebaute Drizzle-Anbindung und keine „Auth-Adapter-Inception" wie NextAuth + Prisma-Adapter.
- **Eigene Auth from scratch:** zu viel Aufwand für Solo-Phase, security-kritisch.
- **Better Auth Organization-Plugin:** fertig, aber lockt das Tenant-Modell in BA-Konzepte; eigenes Modell ist flexibler (Solo → SaaS → ggf. Sub-Workspaces).
