# Keyword Workspace V1 User Flow, UX, and UI Specification

## 1. Purpose

This document defines exact V1 user flow and interface behavior.
It is intentionally implementation-ready and removes room for assumptions.

V1 UX principle:
- cards-first for overview and focus decisions
- table/drawer for high-throughput editing
- no active AI controls in V1

## 2. Information Architecture

New page group under dashboard:
- nav label suggestion: `Keyword Workspace`
- page title: `Keyword Mapping`

Primary surfaces:
- Setup flow (project + import + mapping + standardization + precluster)
- Cluster Cards screen (default landing)
- Keyword Drawer/Table (operational editing)
- Cluster Inspector side panel

## 3. End-to-End Flow

## 3.1 Project Creation

Entry:
- user clicks `Neues Projekt` in workspace header

Form fields:
- `Projektname` (required)
- `GSC Property` (required in V1, 1 project = 1 property)
- `Sprache` default `de`
- `Land` default `DE`
- `GSC Zeitraum` default `28 Tage`

Success outcome:
- project created
- user redirected to import step

## 3.2 Import Step (CSV/XLSX + GSC)

Layout:
- left: file upload panel
- right: optional GSC fetch panel

Rules:
- user can upload one or many CSV/XLSX files
- user can run GSC import in same setup
- both imports create separate sources in same project
- per-file upload limit: max `20 MB`

Progress indicators:
- per source: `uploaded`, `parsed`, `mapped`, `ready`

## 3.3 Auto Column Mapping + Manual Correction

After parse:
- show column detection table
- each canonical field has dropdown assignment:
  - keyword (required)
  - volume (optional)
  - impressions (optional)
  - clicks (optional)
  - position (optional)
  - url (optional)

Validation:
- cannot continue without keyword mapping
- show row preview (top 20 rows)

Action:
- `Mapping bestätigen`

## 3.4 Standardization

Trigger:
- starts automatically once all required mappings confirmed

Displayed status:
- normalization count
- demand standardization count
- skipped/invalid row count

Completion:
- auto-trigger preclustering

## 3.5 Auto Precluster Run

Trigger:
- automatic after standardization

Secondary action:
- visible button `Pre-Cluster neu berechnen`

Completion state:
- project receives `algoVersion`, cluster count, keyword count
- user routed to cards screen

## 4. Cluster Cards Screen (Default Workspace Landing)

## 4.1 Grid Layout

Desktop:
- 3 columns

Tablet:
- 2 columns

Mobile:
- 1 column

## 4.2 Card Content

Each card must display:
- cluster title (precluster label)
- total demand
- keyword count
- cohesion badge
- top 5 keywords sorted by demand desc
- focus checkbox

Card actions:
- rename
- merge (multi-card mode)
- split
- exclude/remove

## 4.3 Sorting and Default Order

Mandatory default:
- cards sorted by `totalDemand DESC`

Tie-breakers:
- label ASC
- id ASC

## 4.4 Top Toolbar Actions

Controls:
- `Alle auswählen`
- `Alle abwählen`
- search input (cluster label)
- filter chips:
  - `Nur Focus`
  - `Nur Low Cohesion`
  - `Nur große Cluster`
- manual rerun button

## 5. Keyword Drawer/Table Spec

## 5.1 Drawer Behavior

- collapsible left panel
- keeps open/closed state per user in local storage
- opens by default on desktop

## 5.2 Drawer Header Controls

- source filter:
  - all
  - gsc source(s)
  - upload source(s)
- search by keyword text
- view filters:
  - unassigned
  - assigned
  - conflicts
  - low confidence

## 5.3 Keyword List Behavior

- virtualized rows
- row fields:
  - keyword text
  - demand
  - demand source badge
  - current cluster (if assigned)
- multi-select via checkbox
- bulk actions:
  - move to cluster
  - remove keywords

## 5.4 Pagination and Performance

- query pagination contract from API
- client infinite scroll or paginated table supported
- default page size 100
- max page size 500

## 6. Cluster Inspector Panel (Right)

Opens when user selects a card or cluster row.

Content:
- cluster name and editable field
- total demand and cohesion
- full member keyword list with demand sorting
- actions:
  - split cluster
  - merge cluster
  - lock/unlock (for future compatibility)
  - remove selected keywords

## 7. Interaction Specifications

## 7.1 Move

User selects keywords and assigns to target cluster.

Expected behavior:
- immediate optimistic update
- persistence through action API
- event appended for undo/redo
- toast with count

## 7.2 Rename

- inline edit in card header or inspector
- save on enter/blur
- event emitted

## 7.3 Merge

- user selects 2+ clusters
- modal asks target name
- merge executes as one action event

## 7.4 Split

- user opens split dialog
- system proposes groups (rule-based)
- user can adjust and confirm

## 7.5 Remove

- remove keywords from workspace or cluster membership
- confirmation required for destructive delete

## 8. Undo/Redo UX

Global controls:
- buttons in header
- keyboard:
  - `Cmd/Ctrl + Z` undo
  - `Cmd/Ctrl + Shift + Z` redo

Feedback:
- toast with reversible action message
- disabled state when no undo/redo available

## 9. Empty, Loading, and Error States

## 9.1 Empty States

- no project: show create project CTA
- no data: show import CTA
- no preclusters: show rerun CTA and diagnostics

## 9.2 Loading States

- skeleton cards in grid
- row skeleton in table
- operation progress status for pipeline steps

## 9.3 Error States

- inline recoverable message with retry action
- deterministic error text based on `code`
- technical details hidden behind expandable debug section

## 10. Accessibility and Keyboard Standards

Mandatory:
- all actionable controls keyboard accessible
- focus-visible styles on all interactive elements
- ARIA labels for checkboxes, icons, action buttons
- semantic heading order
- toast announcements are screen-reader friendly

Keyboard shortcuts:
- search focus: `/`
- toggle drawer: `T`
- undo/redo shortcuts as above

## 11. V2 Hookpoints (Not Active in V1)

Visible in documentation only:
- AI action placeholder zone in inspector
- proposal list region in cards toolbar
- no active AI button in V1 UI build

Reason:
- preserve clean V1 scope while keeping layout stable for future expansion.

## 12. Acceptance Checklist (UX/UI)

- setup flow can complete without hidden decisions
- cards show mandatory content and correct sorting
- focus select all/none/individual works consistently
- keyword table supports search/filter/pagination/multi-select
- move/rename/merge/split/remove actions are fully reversible via undo
- all major states (empty/loading/error) are specified and implemented
- accessibility requirements pass keyboard-only operation
