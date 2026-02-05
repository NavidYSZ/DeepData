# Rank Tracker – Developer Notes (context-free guide)

This doc contains everything a coding LLM needs to understand and extend the Rank Tracker feature without additional context.

## Files & Components
- **app/(dashboard)/rank-tracker/page.tsx** – main page
  - Fetches GSC data (sites via `/api/gsc/sites`, query data via `/api/gsc/query`)
  - State: `selectedQueries` (unlimited), `series` (time series), `chartQueries` (top 15 for charts), date range, trend toggle (default OFF)
  - Layout: Filters (dates), two charts (fixed/dynamic axis), keyword filter dropdown, keywords table
- **components/dashboard/rank-charts.tsx**
  - Recharts LineChart, two instances (fixed axis 1–100, dynamic axis)
  - Inputs: `data: SeriesPoint[]`, `trend: TrendPoint[]`, `showTrend`, `onToggleTrend`
  - Sorting by date done inside component; legend uses color dots + plain text
  - Tooltip: title = date, items = color dot + keyword + position (2 decimals); trend hidden in tooltip
  - Points: small dots (r=2), activeDot r=4; line stroke 1.2
  - Trend line: one black line over all visible keywords; only shown if `showTrend` is true
  - Chart height 450px; extra bottom margin to avoid overlap
- **components/dashboard/query-multiselect.tsx**
  - Custom dropdown with search, select-all/none, “Nur” action, shows impressions; no selection cap (max prop set high)
  - Selection deduplicated with `Set`; select-all toggles based on full option list
- **components/dashboard/queries-table.tsx**
  - Sortable (desc/asc/default) columns: Query, Impressions, Avg Position, CTR, Clicks
  - Scrollable vertical area (`maxHeight` prop), horizontal auto
- **components/dashboard/site-context.tsx**
  - Provides `site` (property) via context + localStorage
- **components/dashboard/property-menu.tsx**
  - Sidebar property selector using `/api/gsc/sites`

## Data Flow
1. On load, property from context; if missing, first site is set.
2. Fetch top queries: POST `/api/gsc/query` with `dimensions:["query"]`, `rowLimit:100`.
3. Initial `selectedQueries` = all queries (unlimited).
4. Time series fetch: POST `/api/gsc/query` with `dimensions:["date","query"]`, `rowLimit:5000`; client filters to selected queries.
5. `chartQueries` = top 15 (by impressions) from selected (or all if none selected) to keep charts readable; charts render only these 15.
6. Table shows all selected queries; if none selected, shows all.

## API specifics
- `/api/gsc/query` allows multiple filters with `groupType: "or"` so multiple queries work.
- OAuth callback fetches email via `openid email profile` + userinfo endpoint; stored in DB and shown in account menu.

## Chart Details
- X-axis: numeric date (`dateNum`), domain dataMin/dataMax, tick format MM-DD (ISO slice), extra bottom margin.
- Y-axis: inverted; fixed chart domain [1,100]; dynamic chart auto; ticks compact to avoid overlap.
- Legend: color dot + plain text, matches tooltip color.
- Tooltip: date title; per-series row with dot + keyword + position (2 decimals). Trend excluded.
- Trend toggle default OFF; when ON shows single black line; when OFF not rendered at all.

## Selection & Limits
- Filter dropdown has no 15-cap; select-all works on all options; “Nur” isolates one keyword.
- Charts cap to 15 series (top impressions of selected); table/filter can hold all.

## Known UX/behavior choices
- Small dots always visible; larger activeDot on hover.
- Height increased (450px) for readability.
- Sorting issues addressed by explicit date sort before rendering.

## Acceptance checks after changes
- `npm run build` passes.
- Multiple keywords selected → charts render (max 15), table shows all selected.
- Trend toggle off by default; when off, no trend line/legend/tooltip entry.
- Tooltip title is date; positions shown with 2 decimals; legend text not colored.

