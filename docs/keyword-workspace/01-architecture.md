# Keyword Workspace V1 Architecture

## 1. Purpose

This document defines the architecture for a new bounded context: `Keyword Workspace`.

Goal of V1:
- deterministic pre-clustering
- complete manual editing workflow
- no active AI decisions
- contracts and module seams prepared for V2 AI suggestions

This architecture is explicitly mapped to the current project:
- Next.js App Router
- Prisma + SQLite
- NextAuth user sessions
- existing GSC endpoints under `app/api/gsc/*`

## 1.1 Locked Decisions (Confirmed)

- `Keyword API` means internal project endpoints under `app/api/keyword-workspace/*`, especially the read endpoint for drawer/table data (`GET /projects/:id/keywords`).
- Clustering library for V1: `graphology` + `graphology-communities-louvain`.
- Upload limit for V1: `20 MB` per CSV/XLSX file.
- Keyword pagination defaults: `pageSize=100`, `pageSize max=500`.
- Prisma schema status: Keyword Workspace models are already added in `prisma/schema.prisma`; migration still needs to be created/applied.

## 2. Scope and Non-Goals

### In Scope (V1)
- project creation for keyword workspaces (1 project = 1 GSC property)
- CSV/XLSX upload import
- optional GSC load in same setup flow (default 28 days)
- schema mapping and source registration
- normalization and demand standardization
- deterministic pre-clustering
- cards-first review workflow and table/drawer operations
- manual operations: move, rename, merge, split, remove
- event log with undo/redo

### Out of Scope (V1)
- autonomous AI clustering or AI auto-apply
- SERP research agents / Zyte integrations
- React Flow as primary workspace
- cross-user project collaboration

## 3. Existing System Context

Current relevant components:
- auth/session: `lib/auth.ts`, NextAuth routes under `app/api/auth/*`
- user-scoped DB access: `lib/db.ts` + Prisma schema
- GSC query API: `app/api/gsc/query/route.ts`
- GSC site list API: `app/api/gsc/sites/route.ts`
- dashboard shell and navigation: `app/(dashboard)/layout.tsx`, `components/dashboard/app-sidebar.tsx`

Architectural requirement:
- keep user scoping model consistent with existing APIs (session user id + DB ownership checks)

## 4. Bounded Context: Keyword Workspace

New bounded context name:
- `keyword-workspace`

New route namespace:
- `app/api/keyword-workspace/*`

New documentation namespace:
- `docs/keyword-workspace/*`

## 5. Logical Modules

V1 is implemented as TypeScript in-app modules.

### 5.1 Import Pipeline
- accepts CSV/XLSX files
- optional GSC pull at project setup
- auto-detects columns
- persists source metadata and raw keyword rows
- supports manual column mapping confirmation

### 5.2 Normalization Pipeline
- normalizes keyword text (`kw_norm`)
- generates deterministic signature (`kw_sig`)
- handles locale defaults (`de-DE`)

### 5.3 Demand Standardization
- computes `demand_monthly`
- applies rule: prefer GSC; fallback upload volume; else 0
- stores provenance (`demand_source`)

### 5.4 Preclustering Engine
- deterministic lexical feature pipeline
- similarity graph + community clustering
- graph runtime based on `graphology` + `graphology-communities-louvain`
- labeling and quality metrics (`cohesion`, size flags)
- outputs preclusters and memberships

### 5.5 Workspace Query Layer
- cards view data (sorted by `total_demand DESC`)
- keyword table/drawer data
- focus toggle states
- filter/sort/pagination friendly APIs (`default pageSize=100`, `max pageSize=500`)

### 5.6 Event Log and Undo/Redo
- event-sourced user actions
- invertible command payloads
- deterministic replay order

## 6. Runtime Architecture

### 6.1 Execution Model
- no external queue infrastructure in V1
- synchronous API execution for smaller datasets
- background-friendly design by explicit job endpoints and status resources

Recommended model for heavy operations:
- API creates job row + returns `202 Accepted`
- client polls status endpoint
- server completes operation in same process model

Even if first implementation is synchronous for MVP, API contracts must include status-compatible fields.

### 6.2 Data Flow (End-to-End)

1. Create project
2. Register sources (uploads and optional GSC source)
3. Run import parsing + column detection
4. Confirm mappings
5. Build canonical keyword entities
6. Run normalization
7. Compute standardized demand
8. Auto-run preclustering
9. Read cards/table views
10. User edits emit events and update read models

## 7. API Layer Design

All APIs are REST and user-scoped.

Planned top-level groups:
- `/api/keyword-workspace/projects`
- `/api/keyword-workspace/sources`
- `/api/keyword-workspace/imports`
- `/api/keyword-workspace/preclusters`
- `/api/keyword-workspace/workspace`
- `/api/keyword-workspace/actions`
- `/api/keyword-workspace/events`

Important clarification:
- the "Keyword API" in planning discussions refers to `/api/keyword-workspace/projects/:id/keywords` (drawer/table listing endpoint), not to any external API.

Cross-cutting API rules:
- zod validation for all requests
- deterministic response shapes
- standardized error envelope
- trace id in every error response

## 8. Security and Multi-Tenant Isolation

Rules:
- every project belongs to exactly one `userId`
- every read/write endpoint verifies ownership before any action
- no project id exposure without ownership checks
- source uploads/files linked to project + user
- all derived outputs (clusters, memberships, events) linked to project

Session model:
- keep current NextAuth session approach
- reject requests with `401` if no authenticated user

## 9. Performance Targets (Architectural)

V1 target sizes:
- 5k keywords: responsive end-to-end preclustering
- 20k keywords: bounded processing with fallback strategy

Strategies:
- avoid O(n^2) full pairwise comparisons
- use kNN graph approach
- paginate keyword table APIs
- provide lazy detail loading for cards and inspector data

## 10. Observability and Reliability

Minimum requirements:
- operation logs with project id, user id, operation type, duration
- processing status endpoints for long operations
- deterministic algo version tagging (`algo_version`) to reproduce results
- safe retry behavior for idempotent operations (rerun preclustering)

## 11. V2 Compatibility Plan

V2 must reuse V1 contracts.

Prepared extension seams:
- AI suggestion service reads same keyword and cluster tables
- AI outputs become `proposal` resources, never direct writes
- React Flow can consume same cluster and membership query endpoints
- event model supports proposal-accept/reject actions

## 12. Acceptance Criteria for Architecture

- clear module separation exists in code structure
- all V1 features work without AI services
- every endpoint is user-scoped and validated
- preclustering results are reproducible via `algo_version`
- event log supports deterministic undo/redo
- contracts remain stable for V2 AI and React Flow additions
