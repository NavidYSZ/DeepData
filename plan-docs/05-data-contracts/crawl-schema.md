---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
milestone: M2 (Schema wird in M2 angelegt; M3 erweitert um Internal-Links-Sicht)
---

# Datenmodell: Crawl + Snapshots + Diffs

Dieses Doc beschreibt das Postgres-Schema für Crawl & Track (M2). Internal Link Analysis (M3) erweitert dasselbe Schema um eine `internal_link`-Tabelle.

Schema ist Drizzle-basiert ([ADR-0004](../decisions/ADR-0004-db-postgres-drizzle.md)) und Account-gescoped ([ADR-0005](../decisions/ADR-0005-better-auth-tenancy.md)) — jede Tabelle hat `account_id` und Queries werden in der Service-Schicht immer mit `where(eq(account_id, currentAccount))` versehen.

## Tabellen-Überblick

```
Domain (in M0 angelegt)
  │
  └── crawl_run (1 Zeile pro Crawl-Run; Daily oder Adhoc)
        │
        └── crawl_url_snapshot (1 Zeile pro URL pro Run)
              │
              └── crawl_url_link (1 Zeile pro Outbound-Link)

crawl_change_event (verknüpft zwei aufeinanderfolgende Snapshots der gleichen URL)
```

## `crawl_run`

```sql
CREATE TABLE crawl_run (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  domain_id           uuid NOT NULL REFERENCES domain(id) ON DELETE CASCADE,
  kind                text NOT NULL CHECK (kind IN ('daily','adhoc')),
  status              text NOT NULL CHECK (status IN ('pending','running','succeeded','failed','cancelled'))
                          DEFAULT 'pending',
  seed_url            text NOT NULL,
  discovery_strategy  text NOT NULL CHECK (discovery_strategy IN ('sitemap','bfs','hybrid')),
  started_at          timestamptz,
  finished_at         timestamptz,
  urls_discovered     int NOT NULL DEFAULT 0,
  urls_crawled        int NOT NULL DEFAULT 0,
  urls_failed         int NOT NULL DEFAULT 0,
  error               text,
  max_urls            int NOT NULL DEFAULT 500,
  concurrency         int NOT NULL DEFAULT 3,
  user_agent          text NOT NULL,
  bullmq_job_id       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crawl_run_domain_started ON crawl_run (domain_id, started_at DESC);
CREATE INDEX idx_crawl_run_account ON crawl_run (account_id);
CREATE INDEX idx_crawl_run_status ON crawl_run (status) WHERE status IN ('pending','running');

-- Maximal 1 Daily-Run pro Tag pro Domain.
CREATE UNIQUE INDEX uniq_crawl_run_daily_per_day
  ON crawl_run (domain_id, (date_trunc('day', started_at)))
  WHERE kind = 'daily';
```

**Begründungen:**
- `kind` als text statt enum, weil sich Werte erweitern könnten (z.B. `weekly`). Drizzle kann aus dem CHECK schema-validiert lesen.
- `status` ebenfalls als CHECK-text. Bei `pending` ist `started_at` null; bei `running` ist `started_at` gesetzt; bei terminalen Status (`succeeded`/`failed`/`cancelled`) ist `finished_at` gesetzt.
- `bullmq_job_id` hält die Verbindung zum Queue-Job für Cancel-Operationen.
- `seed_url` ist die Start-URL (typischerweise `https://<domain>`); kann konfigurierbar sein, falls eine Domain unter einem Subdir lebt.

## `crawl_url_snapshot`

```sql
CREATE TABLE crawl_url_snapshot (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  run_id                   uuid NOT NULL REFERENCES crawl_run(id) ON DELETE CASCADE,
  url                      text NOT NULL,
  url_hash                 bytea NOT NULL,           -- sha256(url) für fast equality joins
  status_code              int,
  title                    text,
  h1                       text,
  meta_description         text,
  canonical                text,
  indexable                boolean NOT NULL DEFAULT false,
  robots_meta              text,
  content_hash             bytea,                    -- sha256 des Body-HTML
  word_count               int,
  outbound_links_count     int NOT NULL DEFAULT 0,
  page_type                text,                     -- abgeleitet aus URL-Pfad (cluster.ts)
  cluster                  text,                     -- abgeleitet aus URL-Pfad (cluster.ts)
  fetched_at               timestamptz NOT NULL DEFAULT now(),
  fetch_duration_ms        int,
  error                    text                      -- gesetzt, wenn Fetch fehlgeschlagen
);

CREATE INDEX idx_snapshot_run ON crawl_url_snapshot (run_id);
CREATE INDEX idx_snapshot_url_hash ON crawl_url_snapshot (account_id, url_hash);
CREATE INDEX idx_snapshot_url_text ON crawl_url_snapshot (url text_pattern_ops); -- substring-Suche
```

**Begründungen:**
- `url_hash` ist `bytea` mit sha256 über die normalisierte URL. Beschleunigt die Diff-Phase erheblich: „finde voriges Snapshot mit gleicher URL" wird ein Index-Lookup auf `(account_id, url_hash)` ohne text-Compare.
- `content_hash` getrennt von `url_hash` (verschiedene Zwecke).
- `cluster` und `page_type` werden mitgeschrieben, auch wenn ihre Definition später durch Keyword Clustering (M5) verbessert wird. Für M2 reicht v1's URL-Pfad-Heuristik.
- Body-HTML selbst speichern wir **nicht**. Nur `content_hash` + Wortzähler. Falls später Full-HTML-Diff gewünscht, kommt ein separates `crawl_url_body`-Doc (bytea oder File-Storage).

## `crawl_url_link`

```sql
CREATE TABLE crawl_url_link (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  snapshot_id         uuid NOT NULL REFERENCES crawl_url_snapshot(id) ON DELETE CASCADE,
  target_url          text NOT NULL,
  target_url_hash     bytea NOT NULL,
  anchor_text         text NOT NULL DEFAULT '',
  anchor_class        text CHECK (anchor_class IN ('exact','partial','branded','entity','generic','empty','image_no_alt')),
  placement           text NOT NULL CHECK (placement IN ('content','navigation','footer','sidebar','image')),
  is_nofollow         boolean NOT NULL DEFAULT false,
  is_image_wrap       boolean NOT NULL DEFAULT false,
  image_alt           text
);

CREATE INDEX idx_link_snapshot ON crawl_url_link (snapshot_id);
CREATE INDEX idx_link_target ON crawl_url_link (account_id, target_url_hash);
```

**Begründungen:**
- Pro Outbound-Link 1 Zeile. Bei 500 URLs × Ø 50 Links ≈ 25k Zeilen pro Run — unproblematisch.
- `target_url_hash` erlaubt schnellen Reverse-Lookup „welche Snapshots linken auf URL X?" — Foundation für Internal Link Analysis (M3).
- `anchor_class` ist nullable, falls Classification (zweite Pass) noch nicht durchgelaufen ist.

## `crawl_change_event`

```sql
CREATE TABLE crawl_change_event (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  domain_id             uuid NOT NULL REFERENCES domain(id) ON DELETE CASCADE,
  url                   text NOT NULL,
  url_hash              bytea NOT NULL,
  previous_snapshot_id  uuid NOT NULL REFERENCES crawl_url_snapshot(id) ON DELETE CASCADE,
  current_snapshot_id   uuid NOT NULL REFERENCES crawl_url_snapshot(id) ON DELETE CASCADE,
  change_kind           text NOT NULL CHECK (change_kind IN (
    'status_code','title','h1','canonical','meta_description',
    'indexability','outbound_links','body_hash'
  )),
  previous_value        jsonb,
  current_value         jsonb,
  run_kind              text NOT NULL CHECK (run_kind IN ('daily','adhoc')),
  detected_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_domain_detected ON crawl_change_event (domain_id, detected_at DESC);
CREATE INDEX idx_event_url_hash ON crawl_change_event (account_id, url_hash, detected_at DESC);
CREATE INDEX idx_event_run_kind_detected ON crawl_change_event (domain_id, run_kind, detected_at DESC);
```

**Begründungen:**
- `previous_value` und `current_value` als JSONB, weil Form pro `change_kind` variiert:
  - `status_code` → `{"value": 404}`
  - `title` → `{"value": "Old Title"}` / `{"value": "New Title"}`
  - `outbound_links` → `{"added": [{...}], "removed": [{...}], "changed": [{...}]}`
  - `body_hash` → `{"hash": "a1b2..."}`
- `run_kind` denormalisiert (auch in `crawl_run`), damit die Diff-Log-Liste ohne Join filtern kann.
- `domain_id` denormalisiert, damit Kalender-View ohne Join Anzahl-pro-Tag berechnen kann.

## Diff-Phase-Algorithmus (Pseudo-Code)

```ts
async function detectDiffs(currentRunId: uuid) {
  const currentRun = await getRun(currentRunId);
  const previousRun = await getPreviousSuccessfulRun(currentRun.domain_id, currentRun.kind);
  if (!previousRun) return; // first run → no baseline

  const currentSnapshots = await getSnapshotsByRun(currentRunId);
  for (const current of currentSnapshots) {
    const previous = await getSnapshotByRunAndUrlHash(previousRun.id, current.url_hash);
    if (!previous) continue; // URL ist neu — entscheidet Spec: kein Event, oder eigenes change_kind 'new_url'?
                              // M2: kein Event (Rauschen reduzieren). M3+: review.

    for (const field of DIFF_FIELDS) {
      if (!fieldEqual(previous, current, field)) {
        await insertChangeEvent({
          accountId: current.account_id,
          domainId: currentRun.domain_id,
          url: current.url,
          urlHash: current.url_hash,
          previousSnapshotId: previous.id,
          currentSnapshotId: current.id,
          changeKind: field,
          previousValue: extractValue(previous, field),
          currentValue: extractValue(current, field),
          runKind: currentRun.kind
        });
      }
    }

    if (field === 'outbound_links') {
      const linkDiff = diffOutboundLinks(previous.id, current.id); // über crawl_url_link
      if (linkDiff.hasChanges) {
        await insertChangeEvent({ ..., changeKind: 'outbound_links',
                                  previousValue: null,
                                  currentValue: linkDiff }); // {added, removed, changed}
      }
    }
  }
}
```

DIFF_FIELDS = `['status_code', 'title', 'h1', 'canonical', 'meta_description', 'indexability', 'body_hash']`. `outbound_links` ist separat (braucht Set-Vergleich über 2 Tabellen).

## Querschnitt mit Internal-Link-Analysis (M3)

M3 erweitert das Schema additiv um:

```sql
CREATE TABLE internal_link (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL,
  domain_id             uuid NOT NULL,
  run_id                uuid NOT NULL REFERENCES crawl_run(id) ON DELETE CASCADE,
  source_snapshot_id    uuid NOT NULL REFERENCES crawl_url_snapshot(id) ON DELETE CASCADE,
  target_snapshot_id    uuid REFERENCES crawl_url_snapshot(id) ON DELETE CASCADE, -- null wenn off-site oder broken
  anchor_text           text,
  anchor_class          text,
  placement             text,
  is_nofollow           boolean
);
```

Das ist eine Aggregations-Sicht aus `crawl_url_link` mit aufgelöstem Target-Snapshot. M3 schreibt sie nach jedem Daily-Run und nutzt sie für Inbound-/Outbound-Anchor-Analysen und Quick-Win-Scoring.

## Migration aus v1

v1's Prisma-Schema hat `CrawlRun`, `UrlSnapshot`, `InternalLink`. Direkte Migration ist nicht nötig, weil:
- v1 hat nur Mock-Daten in den Tabellen ([`02-feature-inventar.md`](../v1-status-quo/02-feature-inventar.md)).
- v2-Schema deckt alle v1-Felder ab und erweitert sie (Sitemap-Discovery, Meta-Description, Body-Hash, Change-Events, Adhoc-Kind).

Nach M2-Live-Schaltung: v1-DB wird nicht mehr migriert, sondern v2-Crawler startet frisch.

## Offen / TBD

- **Retention-Policy** (siehe [`module-crawl-track.md`](../01-functional/module-crawl-track.md) → Offen): bei realem Volumen entscheiden.
- **`new_url`-Change-Event:** wollen wir das? Eine URL, die in Run N+1 erstmals auftaucht und in Run N noch nicht da war, ist eine relevante Änderung. Pro: zeigt neue Inhalte automatisch. Contra: nach großen Refactorings kommen hunderte Events. Erstmal weglassen, in M3-Review entscheiden.
- **`removed_url`-Change-Event:** ähnlich — URL die in Run N+1 fehlt aber in Run N da war. Ist es eine 404 (im current Run mit Snapshot + status 404) oder ein nicht-mehr-verlinkt? Aktuell: nur als 404-Event sichtbar, wenn die URL erneut probiert wird. Falls URL aus dem Crawl-Set fehlt, gibt es kein Event. M3 klären.
- **Performance-Profil:** 1.8M Snapshots/Jahr bei 10 Domains. B-Tree-Indizes auf `url_hash` reichen, aber: bei Diff-Phase wird sehr viel `getSnapshotByRunAndUrlHash` aufgerufen. Brauchen wir ein covering-Index `(run_id, url_hash) INCLUDE (status_code, title, ...)` für Diff-Performance? → nach M2-Real-Daten entscheiden.
