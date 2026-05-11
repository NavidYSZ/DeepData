---
status: erstversion
last-updated: 2026-05-11
owner: claude (zur Review durch user)
milestone: M1
---

# Onboarding-Flow

Vom anonymen Besucher zum funktionsfähigen Dashboard. Drei aufeinander aufbauende Sub-Flows:

1. **Sign-up + Account-Setup** — neuer User legt sich an.
2. **Add Domain** — User legt seine erste Domain an (Hostname).
3. **Connect GSC** — User verbindet die Domain mit einer GSC-Property.

**Verwandt:** [`../04-ux-ui/layout-shell.md`](../04-ux-ui/layout-shell.md) (Welcome-Layout), [`../03-information-architecture/url-routing.md`](../03-information-architecture/url-routing.md) (Welcome-Routing), [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md) (Better-Auth-Setup, GSC-OAuth).

## Flow-Übersicht

```
┌─ unauthenticated ──────────────────────────────────────┐
│ /                                                       │
│  └─ Middleware: redirect /sign-in                       │
│                                                         │
│ /sign-up                                                │
│  └─ Email + Password + Name                             │
│  └─ Submit → Better-Auth signUp → auto-Account-create   │
│  └─ Redirect / → kein Domains → /welcome                │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ authenticated, 0 Domains ─────────────────────────────┐
│ /welcome                                                │
│  └─ Step 1: Hostname-Form                               │
│  └─ Step 2: GSC-OAuth-Connect                           │
│  └─ Step 3: GSC-Property-Picker                         │
│  └─ Redirect → /d/[neueDomainId]                        │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ authenticated, n Domains ─────────────────────────────┐
│ /d/[id]   → Dashboard rendert (siehe module-dashboard.md)│
└─────────────────────────────────────────────────────────┘
```

## Sub-Flow 1: Sign-up + Account-Setup

### Step 1.1: Sign-up-Form

Route: `/sign-up`, Layout: `(root)`.

```
┌─ (root)Layout ────────────────────────────────────────┐
│  Logo                                                 │
├───────────────────────────────────────────────────────┤
│                                                       │
│              Konto erstellen                          │
│                                                       │
│   Name      [___________________]                     │
│   Email     [___________________]                     │
│   Passwort  [___________________]  (min 8 Zeichen)    │
│                                                       │
│              [Konto erstellen]                        │
│                                                       │
│   Bereits ein Konto? [Anmelden]                       │
│                                                       │
└───────────────────────────────────────────────────────┘
```

- **Felder:** Name (für `user.name`), Email, Passwort.
- **Validation:** Email-Format, Passwort min 8 Zeichen. Better-Auth's Default-Validation.
- **Submit:** Better-Auth `signUp.email({ email, password, name })`. Bei Erfolg setzt der Sign-up-Hook (siehe [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md)) eine `account`-Row an und verknüpft `user.default_account_id`.
- **Auto-Login:** Better-Auth setzt direkt nach Sign-up die Session-Cookie. Kein manueller Sign-in nötig.
- **Email-Verifikation:** **nicht in M1**. Konto ist sofort nutzbar. Verifikations-Flow kommt post-M1.

### Step 1.2: Redirect-Logik

Nach erfolgreichem Sign-up:

1. Server Action / Better-Auth setzt Session-Cookie.
2. Client-side `router.push("/")`.
3. `/`-Route-Handler (siehe [`../03-information-architecture/url-routing.md`](../03-information-architecture/url-routing.md)) prüft Domains-Count.
4. 0 Domains → `redirect("/welcome")`.

### Error-Pfade

- **Email bereits registriert** → Inline-Error unter Email-Field: „Diese Email ist bereits registriert. [Anmelden]?"
- **Passwort zu kurz** → Inline-Error unter Passwort-Field.
- **Server-Error** → Toast „Konnte Konto nicht erstellen. Bitte erneut versuchen."

## Sub-Flow 2: Add Domain

### Step 2.1: Welcome-Page

Route: `/welcome`, Layout: `(root)`. Wird nur erreicht, wenn `0 Domains` (sonst Redirect zu `/d/[id]`).

```
┌─ (root)Layout ────────────────────────────────────────┐
│  Logo                          [Avatar▾]              │
├───────────────────────────────────────────────────────┤
│                                                       │
│         Willkommen bei DeepData                       │
│         Lege deine erste Domain an, um zu beginnen.   │
│                                                       │
│         ┌─────────────────────────────────┐           │
│         │ Domain hinzufügen               │           │
│         │                                 │           │
│         │ Hostname [example.com________]  │           │
│         │           https://example.com/  │           │
│         │           oder sc-domain:...    │           │
│         │                                 │           │
│         │            [Weiter →]           │           │
│         └─────────────────────────────────┘           │
│                                                       │
└───────────────────────────────────────────────────────┘
```

- **Hostname-Eingabe:** akzeptiert `example.com` oder `https://example.com/` oder `sc-domain:example.com`. Normalisierung im Backend:
  - Schema-Prefix (`https://`, `http://`) wird entfernt.
  - Trailing-Slash entfernt.
  - `www.`-Prefix bleibt erhalten (User-Entscheidung; `www.example.com` und `example.com` sind in GSC verschiedene Properties).
  - Wenn User explizit `sc-domain:` voranstellt, wird die Domain als Domain-Property markiert (in der GSC-Property-Picker-Phase relevant).
- **Validation:**
  - Format: einfacher Hostname-Regex (kein TLD-Whitelist).
  - Duplicate-Check: `UNIQUE(account_id, hostname)` (siehe [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md)). Bei Duplikat: Inline-Error „Diese Domain ist bereits in deinem Account."
- **Submit:** Server Action `createDomain({ hostname })` legt `domain`-Row an, mit `gsc_property_url=NULL`. Returns `domainId`.
- **Weiter:** Client-side `router.push(\`/welcome/connect-gsc?domainId=\${id}\`)`. (Alternative: Multi-Step-Wizard-State im selben `/welcome`; M1 nimmt den Query-Param-Weg, weil simpler.)

### Add-Domain ab 2. Domain (über Account-Settings)

Wenn der User bereits ≥ 1 Domain hat, läuft die Domain-Anlage über `/account/settings/domains` mit einem „+ Domain hinzufügen"-Button und einem Dialog mit identischen Schritten (Hostname → GSC-Connect → GSC-Property-Picker). Welcome ist nur für die *allererste* Domain.

## Sub-Flow 3: Connect GSC

### Step 3.1: OAuth-Initiierung

Route: `/welcome/connect-gsc?domainId=<id>` (im Welcome-Flow) oder Inline-Dialog (im Add-Domain-Flow ab 2. Domain) oder GSC-nicht-verbunden-Modal (siehe [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md)).

```
┌─ Welcome-Step-3 ──────────────────────────────────────┐
│                                                       │
│         Google Search Console verbinden               │
│         Wähle das Google-Konto, in dem diese Domain   │
│         als GSC-Property registriert ist.             │
│                                                       │
│         [G Mit Google verbinden]                      │
│                                                       │
│         (Du kannst das später ändern.)                │
│                                                       │
│         [Überspringen — später verbinden]             │
└───────────────────────────────────────────────────────┘
```

- **„Mit Google verbinden":** löst Better-Auth `signIn.social({ provider: "google", scopes: ["webmasters.readonly"], callbackURL: \`/welcome/connect-gsc/select?domainId=\${id}\` })` aus.
- **„Überspringen":** User landet auf `/d/[id]`, das Dashboard zeigt das GSC-nicht-verbunden-Modal (siehe [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md)). User kann jederzeit später verbinden.
- **Wenn Google-Connection bereits existiert** (User hat schon mal verbunden, für eine andere Domain): überspringe Step 3.1 und gehe direkt zu Step 3.2.

### Step 3.2: GSC-Property-Picker

Nach erfolgreichem OAuth-Callback. Route: `/welcome/connect-gsc/select?domainId=<id>`.

```
┌─ Welcome-Step-3.2 ────────────────────────────────────┐
│                                                       │
│         GSC-Property zur Domain wählen                │
│         Hostname: example.com                         │
│                                                       │
│         Verfügbare Properties in deinem Google-Konto: │
│                                                       │
│         ○ sc-domain:example.com  ← (Empfehlung)       │
│         ○ https://example.com/                        │
│         ○ https://www.example.com/                    │
│         ○ https://blog.example.com/                   │
│                                                       │
│                                          [Weiter →]   │
│                                                       │
│         Keine passende Property?                      │
│         [GSC anders verbinden] [Überspringen]         │
└───────────────────────────────────────────────────────┘
```

- **Properties-Liste:** Server Action `listGscProperties()` (siehe [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md)) ruft GSC `sites.list` auf, gibt alle Properties zurück, die das verbundene Google-Konto sieht.
- **Empfehlungs-Logik:**
  - Wenn Hostname mit `sc-domain:` beginnt: prefer die Domain-Property mit demselben Hostname.
  - Sonst: prefer die Property, deren URL den eingegebenen Hostname enthält (`example.com` → `https://example.com/`).
  - Bei mehreren Matches (`example.com` und `www.example.com`): kein Auto-Select, User muss wählen.
  - Empfehlung zeigt einen kleinen Hinweis-Text „(Empfehlung)".
- **Auto-Select** bei genau einer Property in der Liste: vorausgewählt, kein User-Klick nötig (User kann immer noch ändern).
- **„Keine passende Property?":**
  - **„GSC anders verbinden"** → trennt aktuelle Google-Connection (Better-Auth `unlinkAccount`), startet neuen OAuth-Flow mit anderem Google-Konto.
  - **„Überspringen"** → User landet auf `/d/[id]` mit GSC-nicht-verbunden-Modal.
- **Submit:** Server Action `bindGscProperty({ domainId, gscPropertyUrl })` setzt `domain.gsc_property_url`. Returns Success.
- **Weiter:** `router.push(\`/d/\${domainId}\`)`.

### Step 3.3: Erste Dashboard-Erfahrung

Nach `router.push("/d/[id]")`:

1. DomainLayout lädt: Domain-Permission-Check OK (`account_id` matched).
2. Dashboard-Page lädt: ruft `/api/gsc/query` mit `dimensions=["date"]` für Last-90-Days.
3. Wenn GSC noch keine Daten hat (Property zu jung): **Empty-Window-State** mit Hinweis „Wähle einen größeren Zeitraum oder warte 48h auf neue GSC-Daten."
4. Wenn GSC Daten hat: KPIs + Chart + Top-Queries werden gerendert.

## Re-Connect-GSC (post-Onboarding)

Wenn der User eine bereits verbundene Domain hat, aber die Connection abläuft (Token-Refresh-Fehler, User hat Permission widerrufen): das GSC-nicht-verbunden-Modal erscheint im Dashboard / Rankings / etc. (siehe [`../07-software-architecture/auth-and-tenancy.md`](../07-software-architecture/auth-and-tenancy.md)). „Mit Google verbinden"-Button startet einen verkürzten Flow:

1. OAuth (Step 3.1).
2. **Property-Picker übersprungen**, wenn `domain.gsc_property_url` bereits gesetzt ist und nach OAuth wieder lesbar.
3. Zurück zum Modul-Inhalt.

Wenn die alte Property im neuen Google-Konto nicht mehr lesbar ist (z.B. User hat zu einem anderen Google-Konto gewechselt): erneuter Property-Picker.

## Error-Pfade

| Fehler | Wo | Verhalten |
|---|---|---|
| **OAuth-Cancel** (User schließt Google-Dialog) | Step 3.1 | Zurück zu Step 3.1, Hinweis „Verbindung abgebrochen." |
| **OAuth-Scope-Reject** (User stimmt nicht zu) | Step 3.1 | Zurück zu Step 3.1, Hinweis „Ohne GSC-Permission können wir keine Daten zeigen. [Erneut versuchen] [Überspringen]" |
| **GSC-API 401 nach OAuth** | Step 3.2 | Toast „GSC-Verbindung fehlgeschlagen. Bitte erneut versuchen." + Retry-Button |
| **GSC-API 0 Properties** (Google-Konto hat keine Properties) | Step 3.2 | Empty-State: „Dieses Google-Konto sieht keine GSC-Properties. [Anderes Konto verbinden] [Überspringen]" |
| **`bindGscProperty` 5xx** | Step 3.2 | Toast „Konnte Property nicht zuweisen." + Retry |

## Telemetry

| Event | Trigger | Properties |
|---|---|---|
| `signup.viewed` | `/sign-up` rendered | — |
| `signup.submitted` | Sign-up-Form-Submit | `success: boolean`, `errorReason?: string` |
| `welcome.viewed` | `/welcome` rendered | `domainCount: 0` |
| `welcome.domain_added` | `createDomain` returns | `domainId`, `hostnameType: "plain" \| "sc-domain"` |
| `welcome.gsc_connect_started` | „Mit Google verbinden" geklickt | `domainId` |
| `welcome.gsc_connect_completed` | OAuth-Callback erfolgreich | `domainId`, `propertyCount` |
| `welcome.gsc_property_selected` | Property gewählt + bound | `domainId`, `propertyType: "domain" \| "url-prefix"`, `autoSelected: boolean` |
| `welcome.skip_gsc` | „Überspringen" geklickt | `domainId`, `step: "connect" \| "select"` |

## Akzeptanzkriterien M1

- [ ] Sign-up mit Email/Password legt User + Account + `default_account_id` korrekt an.
- [ ] Nach Sign-up Redirect zu `/welcome` (0 Domains).
- [ ] Hostname-Form validiert Format und Duplikat.
- [ ] Hostname-Normalisierung entfernt `https://`, Trailing-Slash; bewahrt `www.`-Prefix.
- [ ] OAuth-Flow setzt Connection in `auth_account`.
- [ ] GSC-Property-Picker listet alle sichtbaren Properties; Empfehlungs-Logik auto-suggests bei eindeutigem Match.
- [ ] „Überspringen" auf jeder Stufe ist möglich, landet auf `/d/[id]` mit GSC-Modal.
- [ ] Re-Connect-Flow überspringt Property-Picker, wenn `gsc_property_url` weiterhin gültig.
- [ ] Error-Pfade zeigen verständliche Messages, kein Stack-Trace im UI.

## Offene Fragen / Folgeentscheidungen

1. **Multi-Property-Domain** — kann eine Domain (z.B. `example.com`) mit *zwei* GSC-Properties verbunden sein (`https://example.com/` UND `https://www.example.com/`)? Aktuelle Annahme: 1:1, User entscheidet. Wenn beide gleichermaßen wichtig sind, legt der User zwei Domains an.
2. **Welcome-Auto-Resume** — wenn der User Welcome abbricht (Browser zu) und sich neu einloggt: landet er wieder auf `/welcome`? Aktuelle Annahme: ja, weil Domains-Count immer noch 0 (Hostname-Eintrag passierte nie). Wenn Hostname schon angelegt war (zwischen Step 2 und Step 3 abgebrochen): landet er auf `/d/[id]` mit GSC-Modal — Dashboard zeigt das Modal automatisch. Das passt.
3. **Welcome-Step-Persistierung** — sollten Welcome-Schritte über mehrere Sessions persistiert werden (z.B. „Bring den User wieder zu Step 3.2 zurück, weil er da abgebrochen hat")? M1: nein, das Modal-System ist gut genug.
4. **Email-Verifikations-Pflicht** — soll Sign-up Email-Verifikation erzwingen, bevor `/welcome` zugänglich ist? M1: nein (Friction). Add-on in post-M1 möglich.
