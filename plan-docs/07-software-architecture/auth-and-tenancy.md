---
status: erstversion
last-updated: 2026-05-11
owner: claude (zur Review durch user)
milestone: M1
---

# Auth & Multi-Tenancy (Detail)

Detail-Spec zur Architektur-Entscheidung [ADR-0005](../decisions/ADR-0005-auth-and-tenancy.md). Beschreibt das Better-Auth-Setup, das Tenant-Modell, den `withAccount`-Wrapper, die GSC-OAuth-Integration und das globale „GSC-nicht-verbunden"-Modal.

**Verwandt:** [`../03-information-architecture/url-routing.md`](../03-information-architecture/url-routing.md) (Schutz-Layer pro Route), [`../02-user-flows/onboarding.md`](../02-user-flows/onboarding.md) (Sign-up + GSC-Erstverbindung), [`../decisions/ADR-0007-domain-as-workspace.md`](../decisions/ADR-0007-domain-as-workspace.md) (Domain = Tenant-Workspace).

## Bibliothek & Plugins

- **Library:** [Better Auth](https://better-auth.com) mit `@better-auth/drizzle-adapter`.
- **Plugins in M1:**
  - `emailAndPassword` — Email-Login als Primärweg.
  - `nextCookies` — sichere Cookie-Sessions, kompatibel mit Next.js Server Components / Server Actions.
  - Google-OAuth-Plugin (Better Auths `socialProviders.google`) **mit GSC-Scope** (`https://www.googleapis.com/auth/webmasters.readonly`). Nicht als Login-Methode in M1 — nur als Connection für GSC-Datenzugriff. Login bleibt Email/Password.
- **Nicht in M1:** Email-Verifikation, Password-Reset-Flow, 2FA, Magic-Links. Werden post-M1 additiv eingebaut.

## Naming-Map (wichtig)

Better Auth hat eine interne Tabelle namens `account`, die OAuth-Connections und Password-Hashes hält. Wir haben in unserem Domänenmodell einen Tenant-Root, der ebenfalls `account` heißt. Konflikt-Auflösung:

| Konzept | Tabelle | Inhalt |
|---|---|---|
| Tenant-Root | `account` | unser Tenant: `id`, `name`, `created_at`, `updated_at` |
| Better-Auth-intern | `auth_account` | OAuth-Connections (Google für GSC), Password-Hashes, Provider-IDs |
| User | `user` | Better-Auth-Standard + `default_account_id` (FK → `account.id`) |
| Session | `session` | Better-Auth-Standard |
| Verification | `verification` | Better-Auth-Standard (Reset-Tokens etc., später) |

Mapping im Better-Auth-Drizzle-Adapter via `tables`-Konfiguration: `tables.account.modelName = "auth_account"`.

## Tenant-Modell

```
account (Tenant-Root)
  └─ user (1:1 in M0; n:m via account_member-Junction in SaaS-Phase)
  └─ domain (n)
       └─ <alle Modul-Daten der Domain>
  └─ auth_account (n: OAuth-Connections, primär Google für GSC)
```

**Alle tenant-relevanten Tabellen** tragen `account_id` mit FK auf `account.id` und `onDelete: cascade`. Beispiele:

- `domain.account_id`
- `crawl_run.account_id` (zusätzlich zu `domain_id`, für direkte Tenant-Filter ohne Join über `domain`)
- `strategy_finding.account_id`
- Alle künftigen Modul-Tabellen folgen dieser Konvention.

**Begründung doppelter `account_id`** (zusätzlich zu `domain_id`): Single-Index-Lookups bei List-Queries („alle Findings dieses Accounts") sind schneller; Tenant-Filter bleibt explizit auch wenn eine Tabelle nicht direkt zu `domain` gehört.

## Sign-up-Hook

Better Auth Hook `databaseHooks.user.create.after`:

```ts
databaseHooks: {
  user: {
    create: {
      after: async (user, ctx) => {
        const accountId = ulid()
        await db.insert(account).values({
          id: accountId,
          name: `${user.email}'s workspace`,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        await db.update(userTable)
          .set({ defaultAccountId: accountId })
          .where(eq(userTable.id, user.id))
      },
    },
  },
}
```

Konsequenz: jeder neue User hat unmittelbar nach Sign-up einen leeren Tenant-Workspace ohne Domains. Der Welcome-Flow ([`../02-user-flows/onboarding.md`](../02-user-flows/onboarding.md)) leitet ihn zur ersten Domain-Anlage.

## `withAccount`-Wrapper

Server-Side-Enforcement des Tenant-Scopings. Jede Server Action / API Route, die Tenant-Daten anfasst, wird damit gewrapped.

```ts
// lib/with-account.ts
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { notFound } from "next/navigation"

type AccountContext = {
  accountId: string
  userId: string
}

export async function withAccount<T>(
  fn: (ctx: AccountContext) => Promise<T>
): Promise<T> {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session?.user?.defaultAccountId) {
    notFound() // 404 statt Redirect, kein Existenz-Leak
  }
  return fn({
    accountId: session.user.defaultAccountId,
    userId: session.user.id,
  })
}
```

Verwendung in einer Server Action:

```ts
"use server"
import { withAccount } from "@/lib/with-account"
import { db, domain } from "@/lib/db"
import { eq } from "drizzle-orm"

export async function listDomains() {
  return withAccount(async ({ accountId }) => {
    return db.select().from(domain).where(eq(domain.accountId, accountId))
  })
}
```

**Pflicht-Regel:** Jeder Query in `withAccount`-Body filtert auf `accountId`. Tenant-Isolation ist Convention, nicht TS-erzwungen — Reviewer müssen aktiv darauf achten. Defense-in-Depth via Postgres-RLS optional in einer späteren Phase.

## Domain-Permission-Check

Domain-spezifische Routen (`/d/[id]/*`) müssen zusätzlich zur Session prüfen, ob die `domain.account_id` zum Tenant des Users passt.

```ts
// in app/d/[id]/layout.tsx (Server Component)
import { notFound } from "next/navigation"
import { withAccount } from "@/lib/with-account"

export default async function DomainLayout({
  params,
  children,
}: { params: { id: string }, children: React.ReactNode }) {
  const domain = await withAccount(async ({ accountId }) => {
    return db.select().from(domain)
      .where(and(
        eq(domain.id, params.id),
        eq(domain.accountId, accountId)
      ))
      .then(rows => rows[0])
  })
  if (!domain) notFound() // 404, kein Redirect — kein Existenz-Leak fremder Domain-IDs
  // domain ist garantiert dem Tenant zugehörig
  return <DomainShell domain={domain}>{children}</DomainShell>
}
```

**Wichtig:** Bei Mismatch zwischen `domain.account_id` und `session.user.defaultAccountId` wird `notFound()` aufgerufen — **kein Redirect**. Ein Redirect würde die Existenz fremder IDs leaken (Angreifer könnte über Response-Unterschiede zwischen `404` und `302` IDs probiert).

## Edge-Middleware

```ts
// middleware.ts
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("better-auth.session_token")
  const pathname = request.nextUrl.pathname
  const isPublic = pathname === "/" || pathname.startsWith("/sign-") || pathname.startsWith("/api/auth/")

  if (!sessionCookie && !isPublic) {
    return NextResponse.redirect(new URL("/sign-in", request.url))
  }
  if (sessionCookie && (pathname === "/sign-in" || pathname === "/sign-up")) {
    return NextResponse.redirect(new URL("/", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
```

**Wichtig:** Die Middleware macht **nur einen Cookie-Presence-Check**, **keinen DB-Roundtrip** — sonst wird jede Request um eine DB-Query teurer. Echte Session-Validation passiert erst in Server Components / Server Actions via `auth.api.getSession()`.

## GSC-OAuth-Integration

### Architektur

Google-OAuth wird über Better Auths `socialProviders`-Mechanik abgewickelt, aber **nicht** als Login-Methode in M1 — sondern als **Connection** für GSC-Datenzugriff. Login bleibt Email/Password.

Better Auth speichert die Connection in `auth_account` mit:

```
auth_account.provider_id = "google"
auth_account.user_id     = <user.id>
auth_account.account_id  = <google's account_id>   // Better Auth-intern
auth_account.access_token  = <token>
auth_account.refresh_token = <refresh_token>
auth_account.id_token      = <id_token>
auth_account.expires_at    = <timestamp>
auth_account.scope         = "webmasters.readonly"
```

Der `auth_account.user_id` ist die Verbindung: ein User kann genau eine Google-Connection haben. Das ist M1-Limit; in einer SaaS-Phase könnten mehrere Google-Connections pro Account sinnvoll werden (z.B. „Konto A für Domains X/Y, Konto B für Z").

### OAuth-Flow (Erstverbindung)

1. User klickt „Mit Google verbinden" (im Welcome-Flow oder im GSC-nicht-verbunden-Modal).
2. Better Auth `signIn.social({ provider: "google", scopes: [...], callbackURL: ... })` startet OAuth-Flow.
3. User wählt Google-Konto und gibt GSC-Read-Permission frei.
4. Better Auth empfängt Callback, speichert Tokens in `auth_account`.
5. Server Action `listGscProperties()` ruft GSC-API auf, listet alle Properties, die das Google-Konto sieht.
6. User wählt im Welcome-Flow die zur Domain passende Property (oder Domain-Property `sc-domain:example.com`).
7. `domain.gsc_property_url` wird gesetzt.

### GSC-Token-Refresh

Better Auth übernimmt den Refresh automatisch:

- `auth.api.getAccessToken({ providerId: "google", userId })` — gibt einen gültigen Access-Token zurück. Wenn der gespeicherte abgelaufen ist, ruft Better Auth den Refresh-Endpoint von Google.
- Bei Fehler (z.B. User hat Google-Permission widerrufen) wirft Better Auth einen Error. Konsumenten-Code (z.B. `/api/gsc/query`) muss diesen Fall behandeln und an die UI zurückgeben (siehe „GSC-Verbindung abgelaufen"-State in [`states.md`](../04-ux-ui/states.md)).

Server Action für GSC-Queries:

```ts
export async function gscQuery(body: GscQueryBody) {
  return withAccount(async ({ accountId, userId }) => {
    const accessToken = await auth.api.getAccessToken({
      providerId: "google",
      userId,
    })
    // Direkt gegen GSC API rufen
    const response = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(body.siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      }
    )
    if (!response.ok) {
      throw new GscError(response.status, await response.text())
    }
    return response.json()
  })
}
```

### Datenmodell `domain` (Auszug)

```sql
CREATE TABLE domain (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  hostname        TEXT NOT NULL,             -- z.B. "example.com"
  gsc_property_url TEXT,                     -- z.B. "sc-domain:example.com" oder "https://example.com/"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, hostname)               -- pro Account kein Duplikat-Hostname
)
```

`gsc_property_url` ist NULL, solange GSC noch nicht verbunden ist. Die Welcome-/Add-Domain-Flows setzen es nach erfolgreichem OAuth + Property-Picker.

## GSC-nicht-verbunden-Modal

Globaler State, der in jedem GSC-basierten Modul (Dashboard, Rankings, Data Explorer, Ranking-Analysen) auftreten kann.

### Bedingungen, die das Modal zeigen

1. **`domain.gsc_property_url` ist NULL** — Domain wurde angelegt, aber GSC nie verbunden. Tritt v.a. im Welcome-Flow auf, wenn die Domain in mehreren Tabs offen ist.
2. **GSC-API antwortet 401** — Token expired, User hat Google-Permission widerrufen, Google-Konto wurde gelöscht.
3. **User hat keine `auth_account`-Verbindung mit `provider_id="google"`** — komplett neue Connection nötig.

### Modal-Spec

```
┌─ Dialog (shadcn AlertDialog, non-dismissible) ───────────┐
│                                                             │
│  [Google-Icon]                                              │
│  Google Search Console verbinden                            │
│                                                             │
│  Diese Domain ist noch nicht mit GSC verbunden.             │
│  Verbinde GSC, um Rankings, Performance und Crawl-Daten     │
│  zu nutzen.                                                 │
│                                                             │
│                                       [Andere Domain wählen]│
│                                       [Mit Google verbinden]│
└─────────────────────────────────────────────────────────────┘
```

- **Modal blockiert den Modul-Bereich**, ist aber **nicht App-blockierend**. Sidebar (inkl. Domain-Switcher und Settings-Footer) bleibt sichtbar und interaktiv — der User kann ohne OAuth eine andere Domain wählen.
- **„Andere Domain wählen"** öffnet den Domain-Switcher in der Sidebar (oder fokussiert ihn, wenn er bereits sichtbar ist).
- **„Mit Google verbinden"** startet den OAuth-Flow ([`../02-user-flows/onboarding.md`](../02-user-flows/onboarding.md) #Connect-GSC).
- Modal wird vom DomainLayout gerendert, nicht vom einzelnen Modul — so wird es konsistent in jedem Modul gezeigt.

### Wann es **nicht** erscheint

- Auf `/account/settings/*` — Account-Level-Routen brauchen GSC nicht.
- Auf `/d/[id]/settings` — Domain-Settings müssen ohne GSC erreichbar bleiben (sonst kann der User die Property nie konfigurieren).
- Auf nicht-GSC-Modulen wie potenziell Crawl & Track standalone (TBD, siehe Dashboard-Spec, „Offene Folge-Frage").

## Account-Level vs. Domain-Level Permissions

| Ressource | Permission-Check | Beispiel-Route |
|---|---|---|
| Account-Profil | `session.user.id == ressource.user_id` | `/account/settings` |
| GSC-Connection | `session.user.id == auth_account.user_id` | `/account/settings/connections` |
| Domain (List) | `domain.account_id == session.user.defaultAccountId` | `/account/settings/domains` |
| Domain (Modul-Zugriff) | s.o. + `domain.id == params.id` | `/d/[id]/*` |
| Modul-Daten | `<table>.account_id == session.user.defaultAccountId` AND `<table>.domain_id == params.id` | jede Modul-API |

## Was später (post-M1)

- **Email-Verifikation** und **Password-Reset-Flow** — Better Auth-Plugins existieren.
- **2FA** über TOTP-Plugin.
- **Magic-Link-Login** als Alternativ-Login (insb. SaaS-Phase).
- **n:m User ↔ Account** via `account_member`-Junction, mit Rollen `owner / admin / editor / viewer`.
- **Mehrere GSC-Connections pro Account** (Konto A für Domains X/Y, Konto B für Z).
- **Postgres-RLS** als Defense-in-Depth zusätzlich zu `withAccount`.
- **Audit-Log** für sicherheitskritische Aktionen (Domain-Löschung, GSC-Disconnect).

## Offene Fragen / Folgeentscheidungen

1. **Cookie-Name für Last-Selected-Domain** — siehe [ADR-0007](../decisions/ADR-0007-domain-as-workspace.md): „Cookie `selected_domain_id` merkt sich nur die zuletzt gewählte für den `/`-Redirect." Konkret in [`../03-information-architecture/url-routing.md`](../03-information-architecture/url-routing.md) zu spezifizieren (Name, Max-Age, SameSite).
2. **GSC-Disconnect-Flow** — was passiert mit den Domain-Daten, wenn User GSC-Connection trennt? Aktuelle Annahme: `gsc_property_url` der Domains bleibt; nächster Modul-Zugriff zeigt das GSC-Modal. Bestätigen, sobald `/account/settings/connections` spec'd wird.
3. **Multiple Google-Accounts pro User** — M1 unterstützt eines (Better-Auth-Default). Wenn ein User Domains aus verschiedenen GSC-Konten hat, muss er aktuell zwischen Google-Konten wechseln. Workaround: Per-Domain-Connection nachrüsten (post-M1).
