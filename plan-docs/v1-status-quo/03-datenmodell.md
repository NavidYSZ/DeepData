---
status: erstversion
last-updated: 2026-05-09
owner: claude (Code-Analyse)
---

# v1 — Datenmodell (Prisma + SQLite)

> Quelle: [`prisma/schema.prisma`](../../prisma/schema.prisma) @ `main` 2026-05-09. Diese Datei ist eine annotierte Übersicht — nicht der Schema-Master.

## Auth & Tenancy

| Tabelle | Zweck |
|---|---|
| `User` | Login-Person (NextAuth). |
| `Account` | NextAuth-OAuth-Connections (kein Bezug zum SEO-Tenant; **Naming-Kollision** mit dem v2-Konzept „Account = Tenant"). |
| `Session` | NextAuth-Session-Token. |
| `VerificationToken` | NextAuth-Email-Verifikation (nicht aktiv genutzt). |
| `GscAccount` | Verknüpfter Google-Search-Console-Refresh-Token (AES-256-GCM verschlüsselt). Mehrere pro User möglich. |

## Chat (entfällt in v2)

| Tabelle | Zweck |
|---|---|
| `ChatSession` | Chat-Verlauf pro User; archivierbar. |
| `ChatMessage` | Message-Row (`role`: user/assistant/tool/system; `content` als JSON-String); optional `toolName`, `toolCallId`, `model`. |
| `ChatFile` | hochgeladene Datei-Anhänge mit `expiresAt` für Garbage Collection. |

→ in v2 löschen, weil [`../decisions/ADR-0008-no-chat-in-v2.md`](../decisions/ADR-0008-no-chat-in-v2.md) den Chat aus dem Produkt nimmt.

## Keyword Workspace (sehr ausgebaut)

```
KeywordProject
├── KeywordSource             (gsc | upload, mit metaJson)
│   └── KeywordSourceMetric   (impressions, clicks, position, sistrixVolume, cpc, kd, url, dateFrom/To)
├── Keyword (kwRaw, kwNorm, kwSig)
│   ├── KeywordDemand         (demandMonthly, demandSource — gsc | upload | mixed | none)
│   ├── PreclusterMember
│   ├── ClusterMember
│   ├── SerpSnapshot          (provider=zyte, fetchedAt, status, topUrlsJson, hash)
│   └── SerpSubclusterMember
├── Precluster                (algoVersion, label, totalDemand, cohesion)
├── Cluster                   (manuell, isLocked, parent_id für Hierarchie offen)
├── WorkspaceEvent            (Undo-Log: MOVE_KW, MERGE_CLUSTER, …)
└── SerpClusterRun            (Status, Threshold, Algo, Counts: Zyte requested/succeeded/cached, …)
    ├── SerpSubcluster        (totalDemand, keywordCount, overlapScore, topDomainsJson)
    │   ├── SerpSubclusterMember
    │   └── SerpParentToSubcluster
    └── SerpParentCluster     (rationale, totalDemand, keywordCount, topDomainsJson)
```

**Beobachtungen:**

- Sehr saubere Trennung Pre-Cluster (lexical) vs. Manual-Cluster vs. SERP-basierte Subclusters mit Parent-Mapping.
- `WorkspaceEvent` als Event-Sourcing-leicht: Undo/Redo möglich.
- Demand-Standardisierung über `KeywordDemand` (impressions-äquivalent, GSC-Periode normalisiert).
- **In v2 wahrscheinlich erhaltbar** — das ist der reifste Bereich der App. Migration auf Postgres/Drizzle mit gleichen Spalten möglich.

## Internal-Links / Crawler

```
CrawlRun (siteUrl, seedUrl, status, startedAt, finishedAt, urlsCrawled, linksFound, maxUrls, error)
├── UrlSnapshot               (pro URL pro Run; title, h1, canonical, statusCode, indexable,
│                              pageType: hub|category|product|guide|service|other,
│                              cluster=uncategorised default,
│                              GSC-Cache: position, impressions, clicks, topQueriesJson)
│   ├── inboundLinks  (InternalLink reverse)
│   └── outboundLinks (InternalLink forward)
└── InternalLink              (sourceId → targetId, anchorText,
                               anchorClass: exact|partial|branded|entity|generic|empty|image_no_alt,
                               placement: content|navigation|footer|sidebar|image,
                               isContextual, isNofollow)
```

**Beobachtungen:**

- Snapshot-pro-Run-Modell (kein Mutate, „historical comparisons fall out for free").
- Anchor-Klassifikation und Placement sind enums-as-strings (sollte in v2 als Drizzle-pg-Enum modelliert werden).
- **`UrlSnapshot.topQueriesJson`** persistiert ~10 Top-Queries pro URL als String — pragmatisch in SQLite, in Postgres wäre `jsonb` natürlicher.

## Bewusst NICHT persistierte Daten (Architektur-Entscheidung v1)

Laut [`/CLAUDE.md`](../../CLAUDE.md) lesen die GSC-View-Module (Dashboard, Top Mover, Data Explorer, Rank Tracker, Kannibalisierung) **live** aus der GSC-API auf jeden Request. Eine Cache-Schicht `GscDailyMetric` wurde mal probiert und reverted. **Dieses Prinzip wird in v2 wahrscheinlich gebrochen werden** — Initial-Analysis braucht persistente Snapshots, sonst skaliert das nicht. Eigene Architektur-Entscheidung in [`../06-data-flow/caching-staleness.md`](../06-data-flow/caching-staleness.md), wenn das Modul dran ist.

## SQLite-Eigenheiten, die in v2 wegfallen

- Migrations müssen mit `DATABASE_URL="file:./data/sqlite.db"` lokal überschrieben werden (sonst zielt Prisma auf den Container-Pfad).
- Im Container-Image (`node:20-alpine`) gibt es kein `sqlite3`-CLI für Inspektion.
- `db:prepare` mit destruktivem Fallback (DB-Reset bei fehlgeschlagener Migration) ist eine **Risikoquelle** und entfällt mit Postgres + Drizzle-Kit naturgemäß.
