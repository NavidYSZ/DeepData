---
status: erstversion
last-updated: 2026-05-09
owner: claude (Code-Analyse)
---

# v1 — Tech-Stack, Routing, Layout

## Stack

| Bereich | Wahl (v1) |
|---|---|
| Framework | Next.js **14.2** (App Router) |
| Sprache | TypeScript 5.4 |
| UI | shadcn-Stil (Radix-Primitives + Tailwind 3.4) + `lucide-react` Icons |
| State | React-State + SWR + `localStorage` für Site-Auswahl |
| Tabellen | `@tanstack/react-table` 8 |
| Charts | `recharts` 2 |
| Graph | `reactflow` 11 + `dagre` (für Cluster-Visualisierung im Keyword-Workspace) |
| Animation | `framer-motion` 12 |
| LLM-Chat | `@ai-sdk/openai` 3 + `ai` 6 (Vercel AI SDK) — eingesetzt im `chat-agent`-Modul |
| Auth | NextAuth 4.24 (JWT, Google-Provider) + `@next-auth/prisma-adapter` |
| ORM | Prisma 5.22 |
| DB | SQLite (file-basiert: `./data/sqlite.db` lokal, `/app/data/sqlite.db` in Container) |
| Cluster-Math | `graphology` + `graphology-communities-louvain`, `ml-distance`, `natural` (Stemming) |
| Crawler | `cheerio` für HTML-Parsing, `p-limit` für Concurrency |
| Datei-I/O | `xlsx`, `csv-parse`, `csv-stringify`, `iconv-lite` |
| Validation | `zod` |
| Forms / Date | `react-day-picker`, `date-fns` |
| Toast | `sonner` |
| Theme | `next-themes` (System/Light/Dark) |

## Routing-Layout

```
app/
├── layout.tsx              # Root: Theme, SessionProvider, Toaster
├── page.tsx                # Landing → /dashboard wenn eingeloggt
├── globals.css
├── (dashboard)/            # Route-Group mit Sidebar+Header+SiteProvider
│   ├── layout.tsx          # AppSidebar links, SiteHeader oben, SiteProvider außen
│   ├── dashboard/          # Übersicht
│   ├── rank-tracker/       # "by Query"
│   ├── url-tracker/        # "by Site"
│   ├── data-explorer/
│   ├── seo-bubble/         # "Position vs CTR"
│   ├── kannibalisierung/
│   ├── top-mover/
│   ├── internal-links/
│   ├── chat-agent/
│   ├── keyword-workspace/  # "Clustering" (eigener Vollbild-Modus, isKeywordWorkspace-Flag)
│   └── settings/
├── crawl/                  # Eigene Fullscreen-App außerhalb der (dashboard)-Group
└── api/
    ├── auth/[...nextauth]
    ├── auth/google/callback   # zweiter OAuth (GSC-Scope)
    ├── accounts/              # GSC-Account-Verwaltung
    ├── gsc/sites              # property listing
    ├── gsc/query              # Search-Analytics-Query (Zod-validiert, Pagination)
    ├── agent/                 # Chat-Routes (sessions, files)
    ├── internal-links/        # opportunities, run, runs
    └── keyword-workspace/     # current, imports, projects
```

**Layout-Eigenheiten:**

- `(dashboard)/layout.tsx` setzt für `/keyword-workspace` einen Vollbild-Modus (`isKeywordWorkspace`): Header und Container-Padding entfallen, `SidebarInset` wird `overflow-hidden`.
- `app/layout.tsx` rendert `ThemeProvider` (system default) + `SessionProviderWrapper` + `Toaster`.
- `pageTitles`-Map im Dashboard-Layout statt strukturierter Routenkonfiguration; bei Routen-Erweiterung muss man die Map mitpflegen.

## Sidebar (heute, [`components/dashboard/app-sidebar.tsx`](../../components/dashboard/app-sidebar.tsx))

- Custom shadcn-Sidebar (eigene `components/ui/sidebar.tsx`, **nicht** das offizielle `sidebar-07`-Block).
- Header: Logo „D" + Wortmarke „DeepData" + `<PropertyMenu>` (GSC-Property-Picker).
- Drei Gruppen mit Labels:
  - **Keywords:** by Query, by Site, Data Explorer
  - **Insights:** Position vs CTR, Kannibalisierung, Top Mover, Internal Links, Chat Agent
  - **Tools:** Clustering
- Footer: Crawl + Settings (mit Label „Settings" als Group-Header — inkonsistent mit den anderen Gruppen-Labels).
- Collapsing nur über manuell gesetzte CSS-Klassen (`group-data-[collapsed=true]`).

## Auth-Flow (Multi-User, [`/docs/multiuser-notes.md`](../../docs/multiuser-notes.md))

```
Login (Google, NextAuth, openid+email+profile)
   → User in DB
   → Session-Cookie

"Search Console verbinden" (separater OAuth-Flow, webmasters-Scope)
   → /api/auth/google/callback speichert Refresh-Token verschlüsselt
     in GscAccount{userId, email, refresh_token}

GSC-Request (Server)
   → getServerSession → cookies.accountId → resolveUserSiteAccess(...)
     → lib/gsc-access.ts entschlüsselt RefreshToken (AES-256-GCM, ENCRYPTION_KEY)
     → lib/google-oauth.ts holt frischen AccessToken
     → lib/gsc.ts ruft REST-API auf
```

- **Mehrere GSC-Konten pro User** möglich; Cookie `accountId` wählt das aktive.
- **Session-State** für die gewählte GSC-Property: clientseitig in `localStorage` via `SiteContext` (`components/dashboard/site-context.tsx`). **Kein Server-State, keine URL-Bindung.** Dadurch: keine Deep-Links auf Modul+Property, kein Reset bei Property-Wechsel.

## Deploy (Coolify auf VPS)

- Dockerfile: `node:20-alpine`, kein `sqlite3` Binary.
- `CMD`: `npx prisma migrate deploy && npm run start`.
- `npm start` ruft `db:prepare` auf, das eine **destruktive Fallback-Logik** hat: bei fehlschlagendem `migrate deploy` wird `/app/data/sqlite.db` gelöscht und neu angelegt → **Datenverlust auf Prod möglich** wenn Migration fehlschlägt.
- DB-Persistenz: Coolify-Volume auf `/app/data`.
- Mehrere Branches im Repo: `main`, `stable`, `responsive`, `design-v2` (älterer Stand), `Legacy-Backup-02-05-2026`.

## Bekannte v1-Schwächen (User-Aussage)

- UX/UI inkonsistent über Module hinweg (verschiedene Filter-Layouts, Tabellen-Stile, leere States, …).
- Mehrere Module „nicht zu Ende gebaut" / fragil.
- Redundanzen (z.B. by Query und by Site teilen sich konzeptionell viel, sind aber separat).
- Sidebar/Section-Hierarchie unklar (Mix aus „Keywords / Insights / Tools / Crawl / Settings" ohne klares mentales Modell).
- Keine konsistente Stale-/Loading-/Error-State-Sprache.
- Kein gemeinsames Modul-Layout („PageHeader + FilterBar + SectionCard + StatsRow" gibt es zwar in [`page-shell.tsx`](../../components/dashboard/page-shell.tsx), wird aber nicht durchgängig genutzt).

Diese Schwächen sind die explizite Motivation für v2 (siehe [`../00-product/product-vision.md`](../00-product/product-vision.md)).
