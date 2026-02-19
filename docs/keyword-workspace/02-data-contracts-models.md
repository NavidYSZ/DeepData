# Keyword Workspace V1 Data Contracts and Models

## 1. Purpose

This document defines all persistence models, DTOs, API contracts, validation rules, action payloads, and error contracts for `Keyword Workspace` V1.

Design principle:
- contract-first
- deterministic payloads
- user-scoped data ownership

## 1.1 Repository Status (Confirmed)

- Prisma model definitions for Keyword Workspace are already inserted in `prisma/schema.prisma`.
- Required next DB step is migration creation/apply (expected migration name: `keyword-workspace-init`).
- Contracts in this document are aligned to that inserted schema.

## 2. Model Extensions (Prisma)

The current schema has `User`, `GscAccount`, and chat models only.
V1 adds the following project-scoped models.

## 2.1 Prisma Model Proposals

```prisma
model KeywordProject {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name              String
  lang              String   @default("de")
  country           String   @default("DE")
  gscSiteUrl        String?
  gscDefaultDays    Int      @default(28)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  sources           KeywordSource[]
  keywords          Keyword[]
  keywordDemands    KeywordDemand[]
  preclusters       Precluster[]
  clusterMembers    ClusterMember[]
  events            WorkspaceEvent[]
}

model KeywordSource {
  id                String   @id @default(cuid())
  projectId         String
  project           KeywordProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  type              String   // "gsc" | "upload"
  name              String
  metaJson          String?  // mapping rules, import settings, file metadata
  createdAt         DateTime @default(now())

  metrics           KeywordSourceMetric[]

  @@index([projectId, type])
}

model Keyword {
  id                String   @id @default(cuid())
  projectId         String
  project           KeywordProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  kwRaw             String
  kwNorm            String
  kwSig             String
  lang              String?
  country           String?
  createdAt         DateTime @default(now())

  sourceMetrics     KeywordSourceMetric[]
  demand            KeywordDemand?
  preclusterMembers PreclusterMember[]
  clusterMembers    ClusterMember[]

  @@index([projectId, kwNorm])
  @@index([projectId, kwSig])
}

model KeywordSourceMetric {
  keywordId         String
  sourceId          String
  keyword           Keyword       @relation(fields: [keywordId], references: [id], onDelete: Cascade)
  source            KeywordSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  impressions       Int?
  clicks            Int?
  position          Float?
  sistrixVolume     Int?
  cpc               Float?
  kd                Float?
  url               String?
  dateFrom          DateTime?
  dateTo            DateTime?

  @@id([keywordId, sourceId])
}

model KeywordDemand {
  keywordId         String   @id
  keyword           Keyword  @relation(fields: [keywordId], references: [id], onDelete: Cascade)
  projectId         String
  project           KeywordProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  demandMonthly     Float
  demandSource      String   // "gsc" | "upload" | "none"
  computedAt        DateTime @default(now())

  @@index([projectId, demandMonthly])
}

model Precluster {
  id                String   @id @default(cuid())
  projectId         String
  project           KeywordProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  algoVersion       String
  label             String
  totalDemand       Float
  cohesion          Float
  createdAt         DateTime @default(now())

  members           PreclusterMember[]

  @@index([projectId, totalDemand])
}

model PreclusterMember {
  preclusterId      String
  keywordId         String
  precluster        Precluster @relation(fields: [preclusterId], references: [id], onDelete: Cascade)
  keyword           Keyword    @relation(fields: [keywordId], references: [id], onDelete: Cascade)
  score             Float

  @@id([preclusterId, keywordId])
  @@index([keywordId])
}

model Cluster {
  id                String   @id @default(cuid())
  projectId         String
  project           KeywordProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name              String
  description       String?
  isLocked          Boolean  @default(false)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  members           ClusterMember[]
}

model ClusterMember {
  clusterId         String
  keywordId         String
  cluster           Cluster @relation(fields: [clusterId], references: [id], onDelete: Cascade)
  keyword           Keyword @relation(fields: [keywordId], references: [id], onDelete: Cascade)

  @@id([clusterId, keywordId])
}

model WorkspaceEvent {
  id                String   @id @default(cuid())
  projectId         String
  project           KeywordProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  type              String
  payloadJson       String
  createdAt         DateTime @default(now())

  @@index([projectId, createdAt])
}
```

## 2.2 Notes on Naming

- `KeywordProject` is used instead of `Project` to avoid ambiguity with future modules.
- `Precluster` and `Cluster` are intentionally separate:
  - `Precluster`: deterministic pipeline output
  - `Cluster`: editable manual workspace state

## 3. Canonical Fields

Mandatory canonical fields across the system:
- `kw_raw`
- `kw_norm`
- `kw_sig`
- `demand_monthly`
- `demand_source`
- `cohesion`
- `algo_version`
- `total_demand`

Allowed source types:
- `gsc`
- `upload`

## 4. Demand Standardization Contract

Given keyword `k`:
- `gsc_monthly = impressions_total / months_in_range`
- `upload_monthly = volume` (monthly estimate from upload tool)

Selection rule:
1. if GSC monthly exists -> `demand_monthly = gsc_monthly`, `demand_source = "gsc"`
2. else if upload volume exists -> `demand_monthly = upload_monthly`, `demand_source = "upload"`
3. else -> `demand_monthly = 0`, `demand_source = "none"`

`months_in_range`:
- computed as exact day span / 30.4375, minimum 1
- for default 28-day import this resolves close to 1 month

## 5. DTO Contracts

## 5.1 ProjectDTO

```json
{
  "id": "cuid",
  "name": "Dental DE",
  "lang": "de",
  "country": "DE",
  "gscSiteUrl": "https://example.com/",
  "gscDefaultDays": 28,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

## 5.2 SourceDTO

```json
{
  "id": "cuid",
  "projectId": "cuid",
  "type": "gsc",
  "name": "GSC: https://example.com/",
  "meta": {
    "dateRangeDays": 28,
    "mappingVersion": 1
  },
  "createdAt": "ISO-8601"
}
```

## 5.3 KeywordDTO

```json
{
  "id": "cuid",
  "projectId": "cuid",
  "kwRaw": "zahnimplantate kosten hamburg",
  "kwNorm": "zahnimplantate kosten hamburg",
  "kwSig": "zahnimplant kost hamburg",
  "demandMonthly": 1300,
  "demandSource": "gsc"
}
```

## 5.4 PreclusterDTO

```json
{
  "id": "cuid",
  "projectId": "cuid",
  "algoVersion": "lex-charstem-v1",
  "label": "zahnimplantate kosten",
  "totalDemand": 8420,
  "cohesion": 0.71,
  "keywordCount": 54,
  "topKeywords": [
    { "keywordId": "c1", "kwRaw": "zahnimplantate kosten", "demandMonthly": 2200 }
  ],
  "focusSelected": false
}
```

## 5.5 EventDTO

```json
{
  "id": "cuid",
  "projectId": "cuid",
  "type": "MOVE_KEYWORDS",
  "payload": {
    "keywordIds": ["k1", "k2"],
    "fromClusterId": "a",
    "toClusterId": "b"
  },
  "createdAt": "ISO-8601"
}
```

## 6. REST API Contracts

Namespace:
- `/api/keyword-workspace/*`

## 6.1 Projects

- `POST /projects`
  - input: `{ name, gscSiteUrl?, lang?, country?, gscDefaultDays? }`
  - output: `ProjectDTO`
- `GET /projects`
  - output: `{ items: ProjectDTO[] }`

## 6.2 Imports and Sources

- `POST /imports/upload`
  - multipart: file + projectId
  - limit: max `20 MB` per file
  - file types: CSV, XLSX
  - output: `{ importId, sourceId, detectedColumns, previewRows }`
- `POST /imports/gsc`
  - input: `{ projectId, siteUrl, days=28 }`
  - output: `{ importId, sourceId, rowCount }`
- `POST /imports/:importId/confirm-mapping`
  - input: `{ keywordColumn, volumeColumn?, impressionsColumn?, clicksColumn?, positionColumn?, urlColumn? }`
  - output: `{ importId, status: "MAPPED" }`

## 6.3 Pipelines

- `POST /projects/:id/standardize`
  - output: `{ status: "DONE", keywordsUpdated, demandComputed }`
- `POST /projects/:id/precluster`
  - input: `{ rerun?: boolean }`
  - output: `{ status: "DONE", algoVersion, clusterCount, keywordCount }`

## 6.4 Workspace Queries

Keyword API clarification:
- "Keyword API" means this internal endpoint: `GET /projects/:id/keywords`.

- `GET /projects/:id/cards?focusOnly=false&search=&minDemand=&page=`
  - sorted by `totalDemand DESC` by default
  - output: `{ items: PreclusterDTO[], total }`
- `GET /projects/:id/keywords?sourceId=&clusterId=&q=&view=&page=&pageSize=`
  - output: `{ items: KeywordDTO[], total }`

## 6.5 Actions and Events

- `POST /projects/:id/actions`
  - input: `ActionCommand` (see section 7)
  - output: `{ eventId, stateVersion }`
- `POST /projects/:id/events/undo`
  - output: `{ eventId, undoneEventId }`
- `POST /projects/:id/events/redo`
  - output: `{ eventId, redoneEventId }`

## 7. Action Commands

Supported commands:
- `MOVE_KEYWORDS`
- `RENAME_CLUSTER`
- `MERGE_CLUSTERS`
- `SPLIT_CLUSTER`
- `DELETE_KEYWORDS`
- `UNDO`
- `REDO`

Command payload schemas:

```ts
type MoveKeywords = {
  type: "MOVE_KEYWORDS";
  keywordIds: string[];
  fromClusterId: string | null;
  toClusterId: string;
};

type RenameCluster = {
  type: "RENAME_CLUSTER";
  clusterId: string;
  nextName: string;
};

type MergeClusters = {
  type: "MERGE_CLUSTERS";
  clusterIds: string[];
  targetName: string;
};

type SplitCluster = {
  type: "SPLIT_CLUSTER";
  clusterId: string;
  groups: Array<{ name: string; keywordIds: string[] }>;
};

type DeleteKeywords = {
  type: "DELETE_KEYWORDS";
  keywordIds: string[];
};
```

## 8. Validation and Determinism Rules

Validation:
- zod schema for every request
- no unknown fields in command payloads
- `projectId` must match authenticated user ownership
- commands referencing unknown ids return deterministic `404` style error code

Determinism:
- same input data + same `algo_version` + same seed -> same memberships
- sorted order ties:
  - by `totalDemand DESC`
  - then by `label ASC`
  - then by id for stable pagination

## 9. Error Contract

Unified error response:

```json
{
  "code": "PROJECT_NOT_FOUND",
  "message": "Project not found",
  "details": { "projectId": "..." },
  "traceId": "req-uuid"
}
```

Error code families:
- auth: `NOT_AUTHENTICATED`, `FORBIDDEN`
- validation: `INVALID_BODY`, `INVALID_COMMAND`
- not found: `PROJECT_NOT_FOUND`, `SOURCE_NOT_FOUND`, `CLUSTER_NOT_FOUND`
- process: `IMPORT_FAILED`, `PRECLUSTER_FAILED`
- conflict: `STATE_CONFLICT`, `UNDO_NOT_AVAILABLE`, `REDO_NOT_AVAILABLE`

## 10. Sort/Filter Contract

Cards:
- default sort: `totalDemand DESC`
- optional filters:
  - `focusSelected`
  - search by label
  - minimum demand

Keywords:
- filters by source, cluster, text search, view type
- pagination contract:
  - default `pageSize=100`
  - max `pageSize=500`

## 11. Test and Acceptance Mapping

Contracts must explicitly support:
1. import mapping correction persistence
2. demand preference of GSC over upload
3. deterministic precluster output
4. cards sorted by `totalDemand DESC`
5. focus toggling and query consistency
6. action commands update state and aggregates correctly
7. undo/redo event inversion
8. strict user-level isolation
