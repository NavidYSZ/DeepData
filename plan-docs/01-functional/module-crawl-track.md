---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
milestone: M2
---

# Modul: Crawl & Track

**Sidebar-Position:** Daten erkunden
**URL-Routing:** `/d/[id]/crawl-track` (Default = `übersicht`), `/d/[id]/crawl-track/run`, `/d/[id]/crawl-track/changes`
**Build-Reihenfolge:** M2 (nach M1-Rankings, vor M3-Internal-Links)
**Erbt aus:** [`module-view-pattern.md`](../04-ux-ui/module-view-pattern.md), [`layout-shell.md`](../04-ux-ui/layout-shell.md), [`states.md`](../04-ux-ui/states.md)
**Schema:** [`../05-data-contracts/crawl-schema.md`](../05-data-contracts/crawl-schema.md)

## Zweck

Die Domain täglich crawlen, jede gefundene URL als Snapshot persistieren, Diffs zwischen zwei aufeinanderfolgenden Tagen erkennen und im Kalender + Diff-Log anzeigen.

Nutzen für den SEO-Anwender:
- *"Wann hat sich auf meiner Seite was geändert — und wo?"*
- *"Welche URLs sind über Nacht gestorben (404 / noindex)?"*
- Datenfundament für Internal Link Analysis (M3) und Content Structure (M6+).

v1 hat dieses Modul nur als UI-Mock mit 3 leeren Routen ([`app/crawl/`](../../app/crawl/)). Der Crawler-Code existiert real, lebt aber in [`lib/internal-links/crawler.ts`](../../lib/internal-links/crawler.ts) und wird in v2 nach `lib/crawl/crawler.ts` umziehen (so dass sowohl Crawl & Track als auch Internal Links denselben Crawler verwenden).

## Sub-Pages

### Übersicht (Default) — `/d/[id]/crawl-track`

**Was zeigt es:**

- **Status-Banner oben:** Stand des letzten erfolgreichen Daily-Runs (Zeitpunkt, urls_crawled, urls_failed, Dauer). Falls Run gerade läuft: Progress-Indicator (urls_discovered → urls_crawled).
- **StatsRow** mit 4 KPIs vom letzten Daily-Run: URLs gecrawlt, Indexable, Mit-Fehlern (4xx/5xx), Änderungen seit gestern.
- **"Letzte Änderungen"-SectionCard:** Top-10 frischeste `crawl_change_event`-Einträge der letzten 24h, sortiert nach `detected_at desc`. Pro Zeile: URL (truncated, mit Tooltip), Change-Kind-Badge, Δ kurz dargestellt.
- **Cross-Refs:** Klick auf Event-Zeile → `/d/[id]/crawl-track/changes?event=<id>` (springt zum Diff-Log mit fokussiertem Event).

**Filter:** keine. (Übersicht ist deliberate one-glance, nicht filterbar.)

### Runs — `/d/[id]/crawl-track/run`

**Was zeigt es:**

Tabelle aller Crawl-Runs der Domain (Daily + Adhoc), neueste oben.

**Spalten:**

| Spalte | Quelle | Sortierbar |
|---|---|---|
| Datum/Zeit | `crawl_run.started_at` | ✓ (default: desc) |
| Art | `crawl_run.kind` (daily \| adhoc) | ✓ |
| Status | `crawl_run.status` (pending\|running\|succeeded\|failed\|cancelled) | ✓ |
| URLs entdeckt | `crawl_run.urls_discovered` | ✓ |
| URLs gecrawlt | `crawl_run.urls_crawled` | ✓ |
| Fehler | `crawl_run.urls_failed` | ✓ |
| Dauer | `finished_at - started_at` | ✓ |
| Discovery | `crawl_run.discovery_strategy` (sitemap \| bfs \| hybrid) | — |

**Klick auf eine Run-Zeile:** öffnet Slide-In-Drawer rechts mit:
- Run-Metadaten (Konfiguration, Error wenn `failed`)
- URL-Snapshot-Tabelle dieses Runs, sortierbar nach Status / Indexable / URL
- Filter: nur Fehler / nur Nicht-Indexable / Suche nach URL-Substring
- Klick auf eine URL-Zeile → weiter zum URL-Detail (siehe unten)

**URL-Detail-Sicht (Drawer-im-Drawer oder voller Route-Wechsel zu `/d/[id]/crawl-track/run/[runId]/url/[urlEncoded]`):**
- Snapshot-Felder (statusCode, title, h1, meta_description, canonical, indexable, robots_meta, word_count, content_hash, outbound_links_count)
- Outbound-Links-Tabelle (TargetURL, AnchorText, Placement, Anchor-Class, isNofollow)
- *Später (M3+):* Verknüpfung zu Internal-Links-Sicht.

**Filter (FilterBar):**
- **Zeitraum** (Default: last 30 days) — begrenzt die Runs-Tabelle.
- **Art** (Tabs: All / Daily / Adhoc).
- **Status** (Multi: succeeded/failed/running).

### Changes — `/d/[id]/crawl-track/changes`

**Was zeigt es:**

Zwei nebeneinanderliegende Bereiche:

**Links: Kalender-View** (Monatskalender, scrollbar)
- Pro Tag: ein Hex-Badge mit Anzahl der detected `crawl_change_event` an diesem Tag.
- Color-Coding: 0 = leer, 1–3 = sanftes Grün, 4–10 = Orange, >10 = Rot.
- Klick auf einen Tag: filtert die Diff-Log-Liste rechts auf diesen Tag.
- Nur **Daily-Runs** fließen in den Kalender. Adhoc-Run-Changes laufen separat (siehe unten).
- Hover auf einen Tag zeigt Tooltip: Run-Status + Top-3 change_kind-Häufigkeiten.

**Rechts: Diff-Log-Liste** (chronologisch)
- Eine Zeile pro `crawl_change_event`. Pro Zeile:
  - URL (truncated, voller URL im Tooltip)
  - Change-Kind-Badge (status_code, title, h1, canonical, meta_description, indexability, outbound_links, body_hash)
  - Δ-Darstellung (z.B. `200 → 404`, `"Old Title" → "New Title"`, `+5 Links / -2 Links`)
  - Zeitstempel (`detected_at`)
- Klick öffnet einen Drawer mit Full-Diff-Sicht (Side-by-Side prev/current Snapshot-Felder).

**Filter (FilterBar):**
- **Zeitraum** (Default: last 30 days). Bei Kalender-Klick wird das Datum dieser Filter überschrieben.
- **Change-Kind** (Multi-Select; default = alle).
- **URL-Suche** (Substring auf URL).
- **Run-Art** (Tabs: Daily \| Adhoc \| Beide; default Daily, weil Kalender nur Daily zeigt).

**Cross-Refs:**
- Klick auf URL in Diff-Log → `/d/[id]/rankings/url?u=<urlEncoded>` (springt in Rankings-per-URL und zeigt einen Marker zum Change-Datum im Verlaufschart — das ist die Brille „Hat diese Änderung den Traffic beeinflusst?").
- *Marker-Logik im Rankings-per-URL-Chart:* der Detail-Chart fragt `crawl_change_event` für die fokussierte URL ab und zeigt eine vertikale Annotation pro Event. Spec dazu kommt in den Internal-Links-Modul-Spec (M3) und in eine Erweiterung des Rankings-Specs.

## Datenquelle

Eigener Crawler, persistiert in Postgres. Schema-Details in [`../05-data-contracts/crawl-schema.md`](../05-data-contracts/crawl-schema.md).

**Tabellen (Überblick):**

- `crawl_run` — 1 Zeile pro Run (Daily oder Adhoc).
- `crawl_url_snapshot` — 1 Zeile pro URL pro Run, snapshot-pro-run-Modell (kein Mutate).
- `crawl_url_link` — 1 Zeile pro Outbound-Link pro Snapshot.
- `crawl_change_event` — 1 Zeile pro detected Diff zwischen zwei aufeinanderfolgenden Snapshots derselben URL.

Account-Scoping per `account_id`-Spalte auf jeder Tabelle ([ADR-0005](../decisions/ADR-0005-better-auth-tenancy.md)).

## Crawler-Pipeline

**Hauptkomponente:** `lib/crawl/crawler.ts` — portiert aus v1's [`lib/internal-links/crawler.ts`](../../lib/internal-links/crawler.ts).

**Neue Ergänzungen in v2:**

1. **Sitemap-Discovery** als primäre URL-Quelle:
   - Fetcht `/sitemap.xml`. Wenn Index-Sitemap → rekursiv Children fetchen.
   - Fallback: BFS ab Homepage (v1-Default), wenn keine Sitemap gefunden oder leer.
   - `discovery_strategy` auf `crawl_run` hält fest, was gewonnen hat.
2. **robots.txt-Respect:**
   - Fetcht `/robots.txt` vor Crawl-Start.
   - Skippt URLs, die unter einem `Disallow`-Pfad für den eigenen User-Agent (`DeepDataBot`) liegen.
   - Crawl-Delay: respektiert, falls gesetzt (max 5s zwischen Requests pro Domain).
3. **Meta-Description-Extraktion** — v1-Crawler hat `meta_description` nicht extrahiert. v2: `$('meta[name="description"]').attr('content')`.
4. **Body-Content-Hash** — sha256 über den raw-HTML-Body. Wird in `crawl_url_snapshot.content_hash` gespeichert. Diff-Erkennung vergleicht den Hash zweier aufeinanderfolgender Daily-Snapshots.
5. **BullMQ-Job** statt Inline-Crawl:
   - Queue `crawl-runs`, Worker auf demselben Coolify-Service oder separat (siehe [ADR-0006](../decisions/ADR-0006-job-queue-bullmq.md)).
   - Concurrency-Limit pro Queue: 2 simultane Domains (verhindert dass viele Domains gleichzeitig den Server saturieren).
   - Concurrency innerhalb eines Crawls: 3 (wie v1-Default).
   - Retry-Policy: 1 Retry bei Network-Errors, 0 bei Parse-Errors.
6. **Status-Updates:** Worker schreibt periodisch `crawl_run.urls_crawled` (alle 10 verarbeiteten URLs), damit UI-Progress flüssig ist.

**Konfiguration (Defaults, per Domain konfigurierbar in `crawl_config`):**

| Option | Default | Begründung |
|---|---|---|
| `max_urls` | 500 | v1-Default, deckt KMU-Sites ab |
| `concurrency` | 3 | höflicher Crawler |
| `timeout_ms` | 8000 | v1-Default |
| `user_agent` | `DeepDataBot/2.0` | dedizierter Bot, in robots.txt erkennbar |
| `body_max_bytes` | 5_242_880 (5 MB) | v1-Default |
| `respect_robots` | true | M2-Default, abschaltbar für eigene Sites |

## Diff-Erkennung

Nach einem erfolgreichen Daily-Run läuft eine Diff-Phase, die pro URL den aktuellen Snapshot mit dem **vorigen erfolgreichen Daily-Snapshot derselben URL** vergleicht. Diff-Events werden in `crawl_change_event` geschrieben.

**Vergleichte Felder → `change_kind`:**

| Feld | change_kind | Trigger |
|---|---|---|
| `status_code` | `status_code` | prev ≠ current (z.B. 200 → 404) |
| `title` | `title` | string-equal Vergleich |
| `h1` | `h1` | string-equal |
| `canonical` | `canonical` | string-equal nach URL-Normalisierung |
| `meta_description` | `meta_description` | string-equal |
| `indexable` | `indexability` | boolean-Wechsel |
| Outbound-Link-Set | `outbound_links` | Set-Differenz auf (target_url + anchor_text + placement); Event-Body listet Adds/Removes |
| `content_hash` | `body_hash` | sha256-Wechsel |

**Body-Hash-Caveat** (klar dokumentiert im UI und hier):
- Jede HTML-Änderung triggert ein Event, **inklusive Boilerplate** (Cookie-Banner, Navigation, Footer-Datum). Das wird laut.
- In M2 leben wir damit, um zu sehen, wie laut es ist. Wenn unbrauchbar, kommt in M3+ ein Boilerplate-Filter (z.B. nur Hash auf `<main>` oder `<article>`-Inhalt).
- UI in Changes-Sub-Page bekommt einen Toggle `Body-Hash-Events ausblenden` (default off, aber sichtbar).

**Diff-Phase als eigener BullMQ-Job** (`crawl-diff`), getriggert vom `crawl-runs`-Worker nach `succeeded`-Status. Vorteil: läuft asynchron, blockiert Crawl-Run-Persistenz nicht.

## Run-Trigger

**Daily-Cron:**
- Coolify-Cron oder BullMQ-Repeatable-Job: jede Domain bekommt um eine festgelegte Uhrzeit (z.B. domain-spezifisch gestaffelt 03:00–05:00 UTC) einen `crawl-runs`-Job mit `kind=daily`.
- Staffelung verhindert Burst auf den Server.
- Bei Fehlschlag: keine automatische Retry am gleichen Tag (Kalender bleibt sauber). Eintrag mit `status=failed` ist Teil des Kalenders.

**Manueller Ad-hoc-Run:**
- Button im Action-Slot „Jetzt crawlen". Öffnet ein Modal mit Konfigurations-Optionen (max_urls, discovery_strategy override, etc.).
- Erzeugt Job mit `kind=adhoc`. **Kann jederzeit, beliebig oft** gestartet werden.
- Adhoc-Runs erscheinen in der **Runs-Tabelle**, aber **NICHT im Kalender** (Kalender ist Daily-only).
- Diff-Phase läuft auch für Adhoc-Runs, aber mit anderem Baseline-Pick: nimmt den letzten erfolgreichen Run **gleicher kind** (also Adhoc gegen Adhoc, Daily gegen Daily). Adhoc-Events landen in `crawl_change_event` mit Flag `run_kind=adhoc` und sind in der Diff-Log-Liste über den Run-Art-Filter sichtbar.

**Datenbank-Constraint:** Partial-Unique-Index `(domain_id, date(started_at)) WHERE kind='daily'`. Stellt sicher, dass es maximal 1 Daily-Run pro Tag pro Domain gibt. Adhoc-Runs sind nicht limitiert.

## URL-Routing & Search-Params

| Route | Zweck | Search-Params |
|---|---|---|
| `/d/[id]/crawl-track` | Übersicht | — |
| `/d/[id]/crawl-track/run` | Run-Tabelle | `?from`, `?to`, `?kind`, `?status` |
| `/d/[id]/crawl-track/run?runId=<id>` | Run-Drawer geöffnet | wie oben + `runId` |
| `/d/[id]/crawl-track/changes` | Kalender + Diff-Log | `?from`, `?to`, `?changeKind`, `?urlQ`, `?runKind`, `?event=<id>` |

Sub-Pages teilen sich denselben FilterBar-State über Search-Params, wo Filter-Namen kompatibel sind.

## Action-Slot im PageHeader

- **„Jetzt crawlen" (primär-Action):** öffnet das Adhoc-Run-Modal. Disabled, wenn ein Run bereits läuft (`status in (pending, running)`). Tooltip in dem Fall: „Es läuft bereits ein Crawl."
- **„Run abbrechen":** sichtbar nur wenn `status=running`. Setzt Run auf `status=cancelled`, BullMQ-Job wird gestoppt. Bestätigungs-Modal davor.
- **"Refresh":** SWR-Mutate auf die Listen — holt aktuellen Run-Status und Diff-Events.

## States (siehe [`states.md`](../04-ux-ui/states.md))

| State | Wann | UI |
|---|---|---|
| Loading | Erst-Fetch und Filter-Wechsel | Skeleton matched (StatsRow + Tabelle/Kalender) |
| No-Data-Yet | Domain hat noch keinen erfolgreichen Crawl-Run | EmptyState mit CTA „Ersten Crawl starten" → öffnet Adhoc-Modal |
| Running | Aktiver Run läuft | Banner oben mit Progress + „Abbrechen"-Button. Übrige Sicht zeigt letzten erfolgreichen Run. |
| Failed-Last | Letzter Daily-Run gescheitert | Warn-Banner mit Error-Message + „Erneut versuchen"-Button |
| Empty (Changes) | Filter-Stand erzeugt 0 Events | EmptyState „Keine Änderungen im Zeitraum" |
| Error | API-Fehler beim Laden der Tabelle | ErrorState mit Retry |

## Geteilte Helfer aus v1

- [`lib/internal-links/crawler.ts`](../../lib/internal-links/crawler.ts) → portiert nach `lib/crawl/crawler.ts`. Erweitert um Sitemap-Discovery, robots.txt-Respect, Meta-Description-Extraktion, Body-Hash.
- [`lib/internal-links/anchor-classifier.ts`](../../lib/internal-links/anchor-classifier.ts) → bleibt unter `lib/internal-links/` (Anchor-Klassifikation ist Internal-Links-Konzept, nicht Crawler-Konzept).
- [`lib/internal-links/cluster.ts`](../../lib/internal-links/cluster.ts) (`deriveCluster`, `derivePageType`) → bleibt unter `lib/internal-links/`, wird aber auch von Crawl-Snapshots genutzt (jedes `crawl_url_snapshot` bekommt `cluster` + `page_type`-Felder).

## Was aus v1 entfällt

- [`app/crawl/`](../../app/crawl/) (Mock-UI) komplett ersetzt.
- [`app/crawl/layout.tsx`](../../app/crawl/layout.tsx) eigener Vollbild-Layout entfällt — v2 nutzt das Standard-DomainLayout aus [`layout-shell.md`](../04-ux-ui/layout-shell.md).
- `CrawlSectionNav`-Component entfällt — Sub-Tab-Navigation kommt aus dem universellen Module-View-Pattern.
- [`/plan and notes.md`](../../plan%20and%20notes.md) wird nicht mehr Quelle der Wahrheit — dieser Modul-Spec ersetzt ihn.

## Offen / TBD (vor M2-Implementierung klären)

- **URL-Identität über Runs hinweg:** zwei aufeinanderfolgende Daily-Runs könnten gleiche URL leicht unterschiedlich normalisieren. v1's `normaliseUrl` ist bereits robust, aber pre-Migration zu Postgres lohnt ein zusätzlicher `url_hash`-Index. → entschieden im Schema-Doc.
- **Diff-Phase-Backfill:** wenn ein Daily-Run am Tag X failt, am Tag X+1 erfolgreich — wird gegen Daily-X-1 oder Daily-X+1-1 verglichen? Empfohlen: gegen den letzten **erfolgreichen** Daily, nicht gegen „X-1 Tag". So sind Diffs definiert, auch wenn Tage lücken haben.
- **GSC-Cache-Felder in `crawl_url_snapshot`:** v1's `UrlSnapshot` hatte `position`, `impressions`, `clicks`, `topQueriesJson` direkt am Snapshot. In v2 lassen wir das weg (GSC ist live, [ADR-0010](../decisions/ADR-0010-gsc-live-in-m1.md)). Internal Links wird die Joins client-side oder per dedizierter API-Route machen.
- **Body-Hash-Boilerplate-Filter:** wenn Body-Hash-Events in M2 sich als zu laut erweisen, kommt in M3+ ein Filter: Hash nur über `<main>` / `<article>` / Heuristik. Decision-Point nach M2-Real-Daten.
- **Cluster + PageType:** v1 leitet die aus URL-Pfad ab (z.B. `/blog/...` → cluster=blog). Crawl & Track persistiert diese Felder, aber **Cluster-Logik gehört eigentlich in Keyword Clustering (M5)**. Für M2: cluster nutzt die simple v1-Pfad-Heuristik. Später durch Keyword-Cluster ersetzt.
- **Adhoc-Run-Konfigurations-Modal:** welche Optionen sind sichtbar? Default-only oder Power-User-Override aller Defaults? → erstmal nur max_urls + force-discovery-strategy.
- **Run-Storage-Retention:** wenn täglich 500 URLs gecrawlt werden, sind das pro Domain ~180k Snapshots/Jahr. Bei 10 Domains 1.8M. Postgres handhabt das problemlos, aber für Diff-Events sicher kostenrelevant. Retention-Policy entscheiden: alte Snapshots > 12 Monate löschen, Change-Events behalten? → ADR später, wenn Volumen real wird.
- **Multi-Coolify-Volume vs DB für Body-HTML:** speichern wir das Body-HTML als bytea in Postgres oder als File auf einem Volume? Für M2: **nur Hash, nicht das HTML selbst** (eine spätere Entscheidung, ob wir die HTMLs aufbewahren wollen, kann additiv kommen).
