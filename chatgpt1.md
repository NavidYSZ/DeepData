chatgpt1

````md
# GSC Dashboard (Next.js + shadcn) – Technischer Plan (MVP)

Stand: Basierend ausschließlich auf dem, was wir im Chat besprochen haben:
- **Next.js (App Router)** als **Frontend + Backend in einem Repo**
- UI mit **shadcn/ui** + **Dashboard-Layout**
- GSC-Daten über **Google OAuth** (serverseitig) + **Search Console API**
- Charts im Frontend (z. B. mit **Recharts**)
- Backend stellt **Proxy-API Routes** bereit: OAuth Start, OAuth Callback, GSC Sites, GSC Query
- Token/Secrets bleiben **serverseitig**, Frontend spricht nur `/api/...` an

---

## 1) Ziele & Scope

### Ziel
Eine Next.js App, die:
1. Nutzer per Google OAuth verbindet
2. GSC Properties (Sites) auflistet
3. GSC Search Analytics Daten abfragt
4. Ergebnisse im Dashboard als **Cards / Table / Charts** darstellt

### Out of Scope (nicht Teil dieses Plans)
- Keine Background Jobs / Cron / Worker
- Kein komplexes Caching
- Keine zusätzlichen Integrationen oder Tools außerhalb von Next.js + Google OAuth + GSC API
- Keine zusätzlichen Datenpipelines

---

## 2) Tech Stack

- **Next.js** (App Router) – UI + API Routes in einem Projekt
- **shadcn/ui** – Dashboard Layout, Cards, Table, Navigation
- **Recharts** – Visualisierung (Charts)
- **Persistenter Token-Speicher**: DB (MVP: SQLite oder Postgres via ORM möglich; Implementierungsdetail liegt bei Coding-LLM)
- Google:
  - **OAuth 2.0** (Web application)
  - **Google Search Console API**
  - Scope: `https://www.googleapis.com/auth/webmasters.readonly`

---

## 3) System-Architektur (High-Level)

### Komponenten
1. **Browser (React UI)**
   - Dashboard UI (shadcn)
   - Ruft ausschließlich App-eigene Endpoints unter `/api/...` auf

2. **Next.js Server (API Routes)**
   - OAuth Flow: Redirect → Callback → Token speichern
   - GSC Proxy-Endpunkte: Sites listen, Search Analytics Query
   - Holt serverseitig Access Token via Refresh Token (Token Refresh)

3. **DB (Token Storage)**
   - Speichert refresh_token & minimale Account-Infos

---

## 4) Datenfluss (Data Flow)

### A) OAuth Connect Flow
1. User klickt im Frontend: **"Mit Google verbinden"**
2. Frontend öffnet `GET /api/auth/google`
3. Server leitet auf Google OAuth Consent weiter (mit Scope webmasters.readonly)
4. Nach Zustimmung redirectet Google zu:
   - lokal: `http://localhost:3000/api/auth/google/callback`
   - prod:  `https://<domain>/api/auth/google/callback`
5. `GET /api/auth/google/callback`:
   - tauscht `code` gegen `access_token` + `refresh_token`
   - speichert `refresh_token` in DB (serverseitig)
6. Server redirectet zurück ins Dashboard (z. B. `/dashboard`)

### B) Sites (Properties) abrufen
1. Frontend ruft `GET /api/gsc/sites`
2. Server:
   - lädt refresh_token aus DB
   - erstellt/erneuert access_token
   - ruft Search Console API „sites list“ auf
3. Server gibt JSON-Liste an Frontend zurück

### C) Search Analytics Query abrufen
1. User wählt im UI:
   - Property (siteUrl)
   - Date Range
   - Dimension(en)
   - optional Filter
2. Frontend sendet `POST /api/gsc/query` mit JSON Body
3. Server:
   - lädt refresh_token aus DB
   - erstellt/erneuert access_token
   - ruft `searchanalytics.query` der Search Console API auf
4. Server gibt JSON Response ans Frontend zurück
5. Frontend rendert:
   - KPI Cards (Clicks, Impressions, CTR, Position)
   - Charts (Time Series etc.)
   - Table (Top Queries/Pages etc.)

---

## 5) Data Model (DB)

> Minimaler persistenter Speicher nur für OAuth-Session (Refresh Token) + Account-Identifikation.

### Entity: `GoogleAccount`
- `id`: string (primary key)
- `email`: string (optional, falls aus Google Token/People API nicht gezogen wird, kann leer bleiben)
- `refresh_token`: string (sensitiv, serverseitig)
- `created_at`: datetime
- `updated_at`: datetime

**Hinweis:**
- Es ist ok, im MVP nur *einen* Account (Single-User) zu unterstützen.
- Bei Multi-User: pro User ein GoogleAccount-Datensatz.

---

## 6) Data Contracts (API Endpoints)

Alle Endpoints liegen unter `/api/...` im Next.js App Router.

### 6.1 `GET /api/auth/google`
**Purpose:** Startet OAuth Login (Redirect zu Google)

- Request: kein Body
- Response: HTTP Redirect (302) zu Google OAuth URL

---

### 6.2 `GET /api/auth/google/callback`
**Purpose:** Callback nach Google Consent; tauscht Code gegen Tokens, speichert refresh_token

**Query Params**
- `code`: string
- `state`: string (falls genutzt)

**Response**
- HTTP Redirect (302) zurück in die App (z. B. `/dashboard`)

**Fehlerfälle**
- 400: fehlender code
- 500: token exchange fehlgeschlagen

---

### 6.3 `GET /api/gsc/sites`
**Purpose:** Listet verfügbare GSC Properties / Sites

**Request**
- kein Body

**Response 200 (JSON)**
```json
{
  "sites": [
    {
      "siteUrl": "https://example.com/",
      "permissionLevel": "siteOwner"
    }
  ]
}
````

**Response-Felder**

* `siteUrl`: string
* `permissionLevel`: string (von Google API)

**Fehlerfälle**

* 401: nicht verbunden / kein refresh_token
* 500: GSC API Fehler

---

### 6.4 `POST /api/gsc/query`

**Purpose:** Proxy für Search Analytics Query

**Request Body (JSON)**

```json
{
  "siteUrl": "https://example.com/",
  "startDate": "2026-01-01",
  "endDate": "2026-01-31",
  "dimensions": ["query"],
  "rowLimit": 250,
  "filters": [
    {
      "dimension": "page",
      "operator": "contains",
      "expression": "/produkte/"
    }
  ]
}
```

**Request-Felder**

* `siteUrl` (string, required): GSC Property
* `startDate` (string, required): `YYYY-MM-DD remembering: ISO date`
* `endDate` (string, required): `YYYY-MM-DD`
* `dimensions` (string[], required): z. B. `["query"]`, `["page"]`, `["query","page"]` etc.
* `rowLimit` (number, optional): Limit der Ergebniszeilen (wenn nicht gesetzt: Server Default)
* `filters` (optional): Liste an Filterobjekten

**Filter Object**

* `dimension`: string
* `operator`: string (z. B. `"contains"`; konkrete Operatoren sollen 1:1 auf GSC-Operatoren gemappt werden)
* `expression`: string

**Response 200 (JSON)**

```json
{
  "rows": [
    {
      "keys": ["zahnimplantate elmshorn"],
      "clicks": 12,
      "impressions": 340,
      "ctr": 0.035,
      "position": 8.4
    }
  ]
}
```

**Response-Felder**

* `rows[]`:

  * `keys`: string[] (entspricht Reihenfolge `dimensions`)
  * `clicks`: number
  * `impressions`: number
  * `ctr`: number (0..1)
  * `position`: number

**Fehlerfälle**

* 400: invalid request body (fehlende Felder / falsches Format)
* 401: nicht verbunden / kein refresh_token
* 500: GSC API Fehler

---

## 7) Frontend Dashboard (shadcn)

### Layout

* Sidebar + Topbar (shadcn components)
* Hauptseite `Dashboard` mit:

  1. Filter-Bar: Property Select + Date Range
  2. KPI Cards: Clicks / Impressions / CTR / Position
  3. Chart-Bereich: z. B. Time Series (falls dimension `date` genutzt wird)
  4. Table: Top rows (Queries/Pages etc.)

### UI Data Requirements

* Sites Dropdown braucht `GET /api/gsc/sites`
* Dashboard Widgets brauchen `POST /api/gsc/query`

---

## 8) Projektstruktur (empfohlen, App Router)

> Nur Struktur; genaue Datei-Implementierung liegt bei der Coding-LLM.

* `app/`

  * `(dashboard)/`

    * `layout.tsx`  (shadcn dashboard shell: sidebar/topbar)
    * `page.tsx`    (dashboard page)
  * `api/`

    * `auth/`

      * `google/route.ts`            (GET /api/auth/google)
      * `google/callback/route.ts`   (GET /api/auth/google/callback)
    * `gsc/`

      * `sites/route.ts`             (GET /api/gsc/sites)
      * `query/route.ts`             (POST /api/gsc/query)
* `components/`

  * `dashboard/`

    * `kpi-cards.tsx`
    * `charts.tsx`
    * `results-table.tsx`
* `lib/`

  * `google-oauth.ts` (token exchange / refresh helpers)
  * `gsc.ts`          (GSC API wrapper)
  * `db.ts`           (DB access für GoogleAccount)

---

## 9) Environment Variables

Serverseitig (Next.js):

* `GOOGLE_CLIENT_ID`
* `GOOGLE_CLIENT_SECRET`
* `GOOGLE_REDIRECT_URI`

  * lokal: `http://localhost:3000/api/auth/google/callback`
  * prod:  `https://<domain>/api/auth/google/callback`

Optional je nach DB:

* `DATABASE_URL`

---

## 10) Google Cloud Setup (Referenz)

Einmalig:

1. Projekt erstellen
2. **Google Search Console API** aktivieren
3. OAuth Consent Screen:

   * Typ: Extern (wenn kein Workspace)
   * Scope: `webmasters.readonly`
   * Test Users: eigene Google Mail hinzufügen
4. OAuth Client (Web Application):

   * Authorized JS origins:

     * `http://localhost:3000`
     * `https://<domain>`
   * Authorized redirect URIs:

     * `http://localhost:3000/api/auth/google/callback`
     * `https://<domain>/api/auth/google/callback`

---

## 11) Security / Constraints

* Keine Secrets im Frontend.
* refresh_token nur serverseitig speichern.
* Frontend spricht nur `/api/...` an.
* Redirect URIs müssen exakt matchen, sonst `redirect_uri_mismatch`.

---

## 12) Deliverables an Coding-LLM

Implementiere:

1. Next.js App Router Projekt mit shadcn Dashboard Layout
2. OAuth Start + Callback Endpoints
3. DB Model `GoogleAccount` (minimal)
4. `/api/gsc/sites` + `/api/gsc/query` (Proxy)
5. Dashboard Page:

   * Connect Button
   * Property Select
   * Date Inputs
   * KPI Cards + Table + mindestens 1 Chart (Recharts)
6. End-to-end: Connect → Sites → Query → Render

```
```
 chatgpt2:



 Alles klar — ich mache bei **12) Deliverables an Coding-LLM** weiter und erweitere es **nur** um das, was wir schon besprochen haben (keine neuen Features), aber diesmal als **konkrete, umsetzbare Aufgabenliste + genaue Akzeptanzkriterien + minimale Dateien/Interfaces**, damit die Coding-LLM exakt weiß, was zu bauen ist.

````md
## 12) Deliverables an Coding-LLM (konkret & umsetzbar)

### 12.1 Projekt-Setup (Next.js + shadcn)
**Aufgaben**
1. Next.js Projekt erstellen (App Router, TypeScript).
2. shadcn/ui initialisieren.
3. shadcn-Komponenten installieren, die für Dashboard nötig sind:
   - Sidebar/Navigation (oder äquivalent)
   - Card
   - Table
   - Button
   - Select (für Property)
   - Inputs (für Datum)
4. Recharts installieren.

**Akzeptanzkriterien**
- App startet lokal via `npm run dev`
- Dashboard-Seite ist erreichbar und nutzt shadcn Styles/Komponenten
- Recharts kann in einer Card gerendert werden (Dummy-Daten ok, bis GSC Call funktioniert)

---

### 12.2 Environment Variables
**Aufgaben**
1. `.env.local` Support für folgende Variablen:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (muss genau der Callback-Route entsprechen)
   - optional DB: `DATABASE_URL`

**Akzeptanzkriterien**
- Server liest Variablen ein (bei fehlenden Variablen: verständlicher Error/Fail fast)

---

### 12.3 DB Model (minimal)
**Aufgaben**
1. Minimaler persistenter Speicher für `GoogleAccount` (Refresh Token):
   - `id` (string)
   - `email` (optional)
   - `refresh_token` (string)
   - `created_at`, `updated_at`

**Akzeptanzkriterien**
- Refresh Token kann gespeichert und wieder geladen werden
- Keine Tokens im Frontend gespeichert

> Hinweis: Implementierungsdetail (SQLite/Postgres/ORM) ist frei, solange persistenter Speicher existiert.

---

### 12.4 OAuth Endpoints
#### A) `GET /api/auth/google`
**Aufgaben**
1. Endpoint erstellt Google OAuth Authorization URL:
   - client_id
   - redirect_uri
   - response_type=code
   - scope=`https://www.googleapis.com/auth/webmasters.readonly`
2. Redirect (302) auf diese URL.

**Akzeptanzkriterien**
- Klick auf "Mit Google verbinden" führt zu Google Consent Screen

#### B) `GET /api/auth/google/callback`
**Aufgaben**
1. Nimmt Query Param `code` entgegen.
2. Tauscht `code` gegen Tokens bei Google aus (Token Endpoint).
3. Speichert `refresh_token` serverseitig in DB (`GoogleAccount`).
4. Redirect (302) zurück ins Dashboard (z. B. `/dashboard`).

**Akzeptanzkriterien**
- Nach erfolgreichem Consent landet User im Dashboard
- refresh_token ist in DB vorhanden
- Kein token leak ins Frontend

---

### 12.5 GSC Proxy Endpoints
#### A) `GET /api/gsc/sites`
**Aufgaben**
1. Lädt refresh_token aus DB.
2. Erzeugt/erneuert access_token über refresh_token.
3. Ruft Search Console API „sites list“ auf.
4. Gibt Response im Contract-Format zurück:

**Response**
```json
{
  "sites": [
    { "siteUrl": "https://example.com/", "permissionLevel": "siteOwner" }
  ]
}
````

**Akzeptanzkriterien**

* Wenn refresh_token fehlt: 401
* Wenn vorhanden: sites werden als JSON geliefert

#### B) `POST /api/gsc/query`

**Aufgaben**

1. Body validieren (mindestens: `siteUrl`, `startDate`, `endDate`, `dimensions`).
2. Lädt refresh_token aus DB, erzeugt access_token.
3. Ruft Search Console `searchanalytics.query` auf und mappt Ergebnis:

**Request**

```json
{
  "siteUrl":"https://example.com/",
  "startDate":"2026-01-01",
  "endDate":"2026-01-31",
  "dimensions":["query"],
  "rowLimit":250,
  "filters":[
    { "dimension":"page","operator":"contains","expression":"/produkte/" }
  ]
}
```

**Response**

```json
{
  "rows":[
    {
      "keys":["zahnimplantate elmshorn"],
      "clicks":12,
      "impressions":340,
      "ctr":0.035,
      "position":8.4
    }
  ]
}
```

**Akzeptanzkriterien**

* 400 bei invalid body
* 401 wenn nicht verbunden (kein refresh_token)
* 200 mit rows bei erfolgreichem GSC Call

---

### 12.6 Frontend: Dashboard UI (shadcn)

**Aufgaben**

1. Dashboard Shell (Sidebar + Topbar) als Layout.
2. Dashboard Page mit diesen UI-Elementen:

   * Button: "Mit Google verbinden" → öffnet `/api/auth/google`
   * Select: Property Auswahl (gefüllt aus `GET /api/gsc/sites`)
   * Date Inputs: startDate, endDate (YYYY-MM-DD)
   * Button: "Laden" → triggert `POST /api/gsc/query`
3. Datenanzeige:

   * KPI Cards: Clicks, Impressions, CTR, Position (aus Response aggregiert oder direkt aus rows, je nach GSC Antwort)
   * Tabelle: rows (keys + metrics)
   * Mindestens 1 Chart (Recharts) innerhalb einer shadcn Card, basierend auf den geladenen Daten

**Akzeptanzkriterien**

* Nach OAuth: Sites dropdown ist befüllt
* Query-Request liefert Daten und UI rendert:

  * Cards sichtbar mit Zahlen
  * Table sichtbar mit rows
  * Chart sichtbar (keine Dummy-Daten mehr, sobald Query funktioniert)

---

### 12.7 End-to-End Test (lokal)

**Aufgaben**

1. Lokalstart:

   * `.env.local` setzen
   * `npm run dev`
2. Flow testen:

   * Connect → OAuth → zurück
   * Sites laden
   * Property wählen
   * Date range wählen
   * Query laden
   * Dashboard zeigt Cards/Table/Chart

**Akzeptanzkriterien**

* Kompletter Flow funktioniert ohne manuelle Token-Eingriffe
* Alle Calls laufen über `/api/...` (kein direkter Google Call aus dem Browser)

---

### 12.8 Minimaler File/Module Contract (für Coding-LLM)

**Erwartete Module**

* `lib/google-oauth.ts`

  * `exchangeCodeForTokens(code: string): { access_token: string; refresh_token?: string; ... }`
  * `refreshAccessToken(refresh_token: string): { access_token: string; ... }`
* `lib/gsc.ts`

  * `listSites(access_token: string): { siteUrl: string; permissionLevel: string }[]`
  * `searchAnalyticsQuery(access_token: string, siteUrl: string, payload: ...): { rows: ... }`
* `lib/db.ts`

  * `getGoogleAccount(): GoogleAccount | null`
  * `saveGoogleAccount(data: { refresh_token: string; email?: string }): void`

