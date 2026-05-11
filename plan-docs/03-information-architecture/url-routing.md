---
status: erstversion
last-updated: 2026-05-11
owner: claude (zur Review durch user)
---

# URL-Routing

Vollständige Routen-Tabelle für v2 mit Schutz-Layer und Verhalten pro Route.

**Verwandt:** [`../04-ux-ui/layout-shell.md`](../04-ux-ui/layout-shell.md) (Layout-Hierarchie), [`../04-ux-ui/sidebar-07.md`](../04-ux-ui/sidebar-07.md) (Sidebar-Inhalt und Modul-URLs), [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md) (Auth-Implementation), [`../02-user-flows/onboarding.md`](../02-user-flows/onboarding.md) (Sign-up + Welcome).

## Konventionen

- **`/d/[id]`** statt `/domains/[id]/` — kurz, Linear-/Vercel-Style.
- **`[id]`** ist `domain.id` (ULID), **nicht** der Hostname. Hostname-Änderungen brechen keine URLs.
- **Sub-Pages max. 2 Ebenen**: `/d/[id]/<modul>/<sub>` ist okay (z.B. `/rankings/query`), `/d/[id]/<modul>/<sub>/<detail>` als eigene Page **nicht** — Details öffnen Drawer/Modal/Slide-In.
- **Filter-State in Search-Params** (`?from=`, `?to=`, `?device=`, `?country=`, `?cluster=`, `?q=`, `?u=`) — teilbar und lesezeichen-fähig.
- **Default-Window** bei GSC-Modulen: `last 90 days` (siehe [`../01-functional/module-rankings.md`](../01-functional/module-rankings.md)).

## Routen-Tabelle

### Public / Account-Level (kein Domain-Kontext)

| Route | Layout | Schutz | Verhalten |
|---|---|---|---|
| `/` | `(root)` | unauth → `/sign-in`; auth + 0 Domains → `/welcome`; auth + n Domains → `/d/[lastSelected || erste]` | Redirect-Logik, keine Page |
| `/sign-in` | `(root)` | auth → Redirect `/` | Better-Auth-Form |
| `/sign-up` | `(root)` | auth → Redirect `/` | Better-Auth-Form |
| `/welcome` | `(root)` | unauth → `/sign-in` | 0-Domains-Onboarding (Domain-Add + GSC-OAuth, siehe [`../02-user-flows/onboarding.md`](../02-user-flows/onboarding.md)) |
| `/account/settings` | `(account)` | unauth → `/sign-in` | Account-Profil-Übersicht (Email, Name, Theme) |
| `/account/settings/connections` | `(account)` | unauth → `/sign-in` | GSC-OAuth-Connection-Status, Connect/Disconnect |
| `/account/settings/domains` | `(account)` | unauth → `/sign-in` | Liste aller Domains des Accounts mit Add/Delete |
| `/account/settings/billing` | `(account)` | unauth → `/sign-in` | Placeholder M1 (Stub-Page „Billing kommt in SaaS-Phase") |

### Domain-Level (DomainLayout, Sidebar sichtbar)

| Route | Schutz | Verhalten |
|---|---|---|
| `/d/[id]` | unauth → `/sign-in`; account-mismatch → `notFound()` | **Dashboard** (Default-Modul, kein Redirect) |
| `/d/[id]/rankings` | s.o. | Rankings/kombiniert (Default-Sub) |
| `/d/[id]/rankings/query` | s.o. | Rankings/per Query |
| `/d/[id]/rankings/url` | s.o. | Rankings/per URL |
| `/d/[id]/data-explorer` | s.o. | Data Explorer (Single-Page) |
| `/d/[id]/crawl-track` | s.o. | Crawl & Track/Übersicht (Default-Sub) |
| `/d/[id]/crawl-track/runs` | s.o. | Crawl & Track/Runs |
| `/d/[id]/crawl-track/changes` | s.o. | Crawl & Track/Changes |
| `/d/[id]/ranking-analysen` | s.o. | Ranking-Analysen/Top Mover (Default-Sub) |
| `/d/[id]/ranking-analysen/top-mover` | s.o. | Top Mover |
| `/d/[id]/ranking-analysen/position-ctr` | s.o. | Position vs CTR |
| `/d/[id]/ranking-analysen/cannibalization` | s.o. | Kannibalisierung |
| `/d/[id]/internal-links` | s.o. | Opportunity Matrix (Default-Sub) |
| `/d/[id]/internal-links/opportunity-matrix` | s.o. | Opportunity Matrix |
| `/d/[id]/internal-links/url-inspector` | s.o. | URL Inspector |
| `/d/[id]/content-gap` | s.o. | Content Gap (Single-Page) |
| `/d/[id]/content-structure` | s.o. | Content Structure & CJ |
| `/d/[id]/traffic-share` | s.o. | Traffic Share |
| `/d/[id]/clustering` | s.o. | Keyword Clustering/Pre (Default-Sub) |
| `/d/[id]/clustering/pre` | s.o. | Pre-Cluster |
| `/d/[id]/clustering/serp` | s.o. | SERP-Cluster |
| `/d/[id]/clustering/manual` | s.o. | Manual-Cluster |
| `/d/[id]/content-writing` | s.o. | Content Writing |
| `/d/[id]/strategy` | s.o. | Strategy/Findings (Default-Sub) |
| `/d/[id]/strategy/findings` | s.o. | Findings |
| `/d/[id]/strategy/notes` | s.o. | Notes |
| `/d/[id]/settings` | s.o. | Domain-Settings (Hostname, GSC-Property-Bindung, Crawler-Frequenz, Delete) |

### API-Routen

| Route | Schutz | Verhalten |
|---|---|---|
| `/api/auth/*` | Better-Auth | Sign-in, Sign-up, OAuth-Callbacks, Session-Mgmt |
| `/api/gsc/query` | `withAccount` + Better-Auth-Token-Refresh | GSC `searchAnalytics.query`-Proxy |
| `/api/gsc/sites` | `withAccount` | Listet GSC-Properties des verbundenen Google-Kontos |
| `/api/domains` | `withAccount` | CRUD für Domains (POST, GET, DELETE) |
| `/api/crawl/run` | `withAccount` | Triggert adhoc-Crawl (M2+) |
| `/api/crawl/latest` | `withAccount` | Letzter Crawl-Run + Diff-Summary (M2+) |

Alle Modul-spezifischen Server-Actions/API-Routes folgen demselben `withAccount`-Pattern (siehe [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md)).

## Schutz-Layer (3-stufig)

1. **Edge-Middleware** (`middleware.ts`) — nur Cookie-Presence-Check. Kein DB-Roundtrip pro Request. Macht den Sign-in-Redirect.
2. **Server-Component / Server-Action** — echte Session-Validation via `auth.api.getSession()`, eingewickelt in `withAccount`. Vergleicht `domain.account_id` mit `session.user.defaultAccountId` und ruft `notFound()` bei Mismatch.
3. **DB-Query** — jeder Tenant-relevante Query filtert explizit auf `accountId`. Convention, nicht TS-erzwungen.

## `/`-Redirect-Logik im Detail

Server Component `app/(root)/page.tsx`:

```ts
export default async function RootPage() {
  const session = await auth.api.getSession({ headers: headers() })
  if (!session) redirect("/sign-in")

  const domains = await db.select().from(domain)
    .where(eq(domain.accountId, session.user.defaultAccountId))

  if (domains.length === 0) redirect("/welcome")

  const cookieStore = cookies()
  const lastSelected = cookieStore.get("selected_domain_id")?.value
  const target = domains.find(d => d.id === lastSelected) ?? domains[0]

  redirect(`/d/${target.id}`)
}
```

**Cookie `selected_domain_id`:**

- `Path: /`, `SameSite: Lax`, `Secure` (prod), `Max-Age: 60 * 60 * 24 * 365` (1 Jahr).
- Gesetzt vom DomainLayout bei jedem Modul-Render mit der aktuellen Domain.
- Beim Domain-Wechsel im Switcher überschrieben.
- Bei Domain-Löschung: nicht aktiv aufräumen — der `/`-Redirect findet das gelöschte ID nicht und fällt auf `domains[0]` zurück.

## Domain-Wechsel-Verhalten

- Klick auf Domain im Sidebar-Domain-Switcher: `router.push(\`/d/\${newDomainId}\`)` — landet immer auf dem Dashboard der neuen Domain.
- **Kein „last-module-per-domain"-Memorierung** in M1 ([`sidebar-07.md`](../04-ux-ui/sidebar-07.md) hat diese Entscheidung verankert). Additiv möglich.
- DomainLayout setzt `key={domain.id}` → React unmountet/mountet den ganzen Subtree neu, kein State-Bleed zwischen Domains.

## Sub-Page-Defaults

Wenn ein Modul mit Sub-Pages ohne Sub-Suffix gerufen wird, rendert es seine Default-Sub:

- `/d/[id]/rankings` → kombinierte Sicht (kein Redirect; die Default-Sub teilt die URL mit dem Parent)
- `/d/[id]/ranking-analysen` → Top Mover (kein Redirect)
- `/d/[id]/internal-links` → Opportunity Matrix (kein Redirect)
- `/d/[id]/clustering` → Pre-Cluster (kein Redirect)
- `/d/[id]/strategy` → Findings (kein Redirect)
- `/d/[id]/crawl-track` → Übersicht (kein Redirect)

Die Default-Sub und das Parent teilen sich also dieselbe URL. Die SubTabBar zeigt den aktiven Sub-Tab via `usePathname()`. Konsequenz im Code: das Parent-Route-File (`app/d/[id]/rankings/page.tsx`) rendert direkt den Default-Sub-Inhalt; die anderen Subs liegen in `app/d/[id]/rankings/query/page.tsx` etc.

## 404-Behavior

- **Existierende Domain, falscher Account** → `notFound()` (kein Existenz-Leak).
- **Nicht existierende Domain-ID** → `notFound()`.
- **Existierende Domain, nicht existierendes Modul** (z.B. `/d/[id]/foo`) → Next.js-Default-404 (Modul-Page existiert nicht im Route-Tree).
- **Nicht eingeloggt + Domain-URL** → Middleware-Redirect zu `/sign-in?redirect=/d/[id]/...`. Nach Login: zurück zur Ziel-URL.

## Reservierte Pfade unter `/d/[id]/`

Folgende Modul-Slugs sind reserviert (siehe Sidebar-07-Struktur). Bei einer Modul-Renaming-Operation oder Neuanlage gilt: ein bisher unbenutzter Slug ist frei, ein bisher genutzter darf nicht überladen werden.

```
rankings, data-explorer, crawl-track,
ranking-analysen, internal-links, content-gap, content-structure, traffic-share,
clustering, content-writing, strategy,
settings
```

Kein Modul-Slug darf mit `_` beginnen (reserviert für interne Next.js-Konventionen) oder `api` heißen (reserviert für API-Routen).

## Search-Param-Konventionen (modulübergreifend)

Wenn ein Param mehrfach auftritt, hat er **überall dieselbe Bedeutung und denselben Default**:

| Param | Bedeutung | Default | Verwendet in |
|---|---|---|---|
| `from` | DateRange-Start (`YYYY-MM-DD`) | berechnet aus `to` − 90d | alle GSC-Module |
| `to` | DateRange-Ende (`YYYY-MM-DD`) | heute | alle GSC-Module |
| `device` | `desktop` / `mobile` / `tablet` | leer (= all) | alle GSC-Module |
| `country` | ISO-3-Letter (GSC-Format) | leer (= all) | alle GSC-Module |
| `cluster` | Cluster-ID (M5+) | leer (= all) | Rankings, Data Explorer, Top Mover |
| `q` | Query/Keyword (URL-encoded) | leer | Rankings/per Query, Cannibalization |
| `u` | URL (URL-encoded) | leer | Rankings/per URL, URL Inspector |

Filter, die nur in einem Modul existieren (z.B. `minImpressions`, `topN`, `showCannibalized`), bleiben modul-lokal und sind in der jeweiligen Modul-Spec dokumentiert.

## Offene Fragen / Folgeentscheidungen

1. **Sign-in-`redirect`-Param-Sicherheit** — die Middleware setzt `?redirect=<originalPath>` beim Sign-in-Redirect. Wir müssen sicherstellen, dass `redirect` nur same-origin sein darf, damit kein Open-Redirect-Hole entsteht. Konkrete Validation: nur akzeptieren, wenn beginnt mit `/` und nicht `//`.
2. **Domain-Slug statt UUID?** — Aktuell `/d/[id]`. Wäre `/d/[slug]` (z.B. `/d/example-com`) lesbarer? Trade-off: Hostname-Änderung bricht URLs. M1: bei `[id]` bleiben, bei Bedarf später Slug-Index als zweite Lookup-Methode (`/d/by-slug/...`).
3. **`/welcome`-Reachable bei n Domains?** — Aktuelles Verhalten: bei `n > 0` Redirect auf `/d/[...]`. Bei Direkt-Aufruf von `/welcome` mit n > 0: zeigen wir die Welcome-Page trotzdem (als Domain-Add-Shortcut), oder redirecten wir? M1: redirecten (Welcome ist nur für 0-Domains-State). Domain-Add geht über `/account/settings/domains` (mit „+ Domain hinzufügen"-Button).
