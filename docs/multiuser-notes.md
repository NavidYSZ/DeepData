# Multi-User Migration Notes (context for next LLM)

## Vorheriger Zustand (Single-User)
- Es gab nur eine Tabelle `GoogleAccount` mit einem Refresh Token (ggf. mehrere Zeilen, aber ohne User-Bezug).
- Auswahl über `accountId`-Cookie bzw. erste Zeile → jeder Besucher hätte auf die gleichen GSC-Daten zugegriffen.
- Kein Login/Session-Handling; nur ein „AccountMenu“ zum Umschalten der gespeicherten Accounts.

## Implementierte Änderungen (Multi-User Basis)
- **Auth:** NextAuth (JWT) mit Google (openid/email/profile). Neue Route `app/api/auth/[...nextauth]/route.ts`.
- **DB:** neue Tabellen `User`, `GscAccount` (Refresh Token pro User). Migration: `prisma/migrations/20260205_multiuser/migration.sql`.
- **Token-Sicherheit:** AES-256-GCM Verschlüsselung (`lib/crypto.ts`, `ENCRYPTION_KEY` 64 hex).
- **ENV erweitert:** `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_REDIRECT_URI` (optional, sonst Fallback), `DATABASE_URL`.
- **API-Isolation:** `/api/gsc/sites`, `/api/gsc/query`, `/api/accounts` prüfen Session und filtern GSC-Accounts nach `userId`. `accountId`-Cookie bleibt, aber nur innerhalb des eingeloggten Users gültig.
- **UI:** Login/Logout (`AuthButton`), SessionProvider in `app/layout.tsx`, AccountMenu zeigt nur User-Accounts; „Search Console verbinden“ startet den GSC-OAuth-Flow.
- **Entfernt:** alte Route `/api/accounts/select`.

## Aktuelles Problem (Stand nach Deployment)
- Beim Login/Connect erscheint Fehler `redirect_uri_mismatch` bzw. `.../api/auth/signin?error=Callback`.
- Ursache: In der Google OAuth-Konsole sind noch nicht alle nötigen Redirect-URIs whitelisted.

### Erforderliche Redirect-URIs (Google Console)
1. NextAuth Login:  
   `https://gsc.deltarank.de/api/auth/callback/google`
2. GSC-Connect (webmasters-Scope):  
   `https://gsc.deltarank.de/api/auth/google/callback`
3. Optional lokal:  
   `http://localhost:3000/api/auth/callback/google`  
   `http://localhost:3000/api/auth/google/callback`

### Benötigte ENV (Prod)
```
NEXTAUTH_URL=https://gsc.deltarank.de
NEXTAUTH_SECRET=<random 32+ chars>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://gsc.deltarank.de/api/auth/google/callback
ENCRYPTION_KEY=<64 hex>
DATABASE_URL=file:./prisma/data/sqlite.db
```

## Tests/Checkliste
- Nach Eintrag der Redirect-URIs in Google Console erneut Login → sollte durchlaufen.
- Danach „Search Console verbinden“ (zweiter OAuth) → Refresh Token in `GscAccount` des Users gespeichert.
- Ohne Login: APIs liefern 401 und UI zeigt Login-CTA.

## Offene Punkte / To-Dos
- Optional: Postgres statt SQLite (dann `DATABASE_URL` anpassen, `prisma migrate deploy`).
- Tokens verschlüsselt sind umgesetzt; prüfen, ob Volume-Persistenz benötigt wird.
- `accountId`-Cookie bleibt; langfristig auf URL/State umstellen.
