# Feature: Externe Keywords in Keyword-Workspace importieren

**Commit:** `b006213` auf `main`
**Datum:** 2026-02-23
**Betrifft:** Keyword-Workspace / Clustering-Seite

---

## Zusammenfassung

Nutzer können jetzt eigene Keyword-Listen (z.B. Sistrix-Konkurrenzanalysen) als CSV oder Excel hochladen. Diese werden zusammen mit den GSC-Keywords geclustert. Bei Duplikaten hat GSC Vorrang. Externe Keywords werden mit einem "E"-Badge markiert.

---

## Neue Dateien

### 1. `lib/keyword-workspace/file-parse.ts`

Shared Parsing-Utilities, die von beiden Upload-Routes genutzt werden:

- **`detectDelimiter(text)`** — Zählt `;`, `,`, `\t` in der ersten Zeile und wählt den häufigsten Delimiter. Löst das Problem, dass Sistrix-Exporte Semikolons verwenden.
- **`decodeBuffer(buffer)`** — Versucht UTF-8; wenn Replacement-Characters (`\uFFFD`) auftreten, fällt es auf Latin-1 (ISO-8859-1) zurück. Sistrix und andere deutsche Tools exportieren oft in Latin-1.
- **`parseFile(filename, buffer)`** — Erkennt anhand der Dateiendung ob CSV oder Excel. Bei CSV wird automatisch Delimiter und Encoding erkannt.
- **`detectColumns(headers)`** — Erweiterte Spalten-Erkennung mit Sistrix-spezifischen deutschen Headern:
  - Keyword: `keyword`, `kw`, `suchbegriff`, `query`, `suchanfrage`, `search term`
  - Volume: `volume`, `suchvolumen`, `search vol`, `sistrix`, `sv`
  - Impressions: `impression`, `impressionen`
  - Clicks: `click`, `klick`
  - Position: `position`, `avg position`, `rang`, `rank`
  - URL: `url`, `landing`, `page`, `seite`
  - CPC: `cpc`, `cost per click`, `kosten pro klick`
  - KD: `kd`, `keyword difficulty`, `schwierigkeit`, `competition`, `wettbewerb`
- **`parseNumber(value)`** — Handhabt deutsche Zahlenformate: `1.234` → 1234, `1.234,5` → 1234.5, `1,5` → 1.5

### 2. `components/ui/dialog.tsx`

Standard shadcn/Radix Dialog-Komponente. Wurde manuell erstellt, da `@radix-ui/react-dialog` bereits in `package.json` installiert war, aber die shadcn-Wrapper-Komponente fehlte.

Exportiert: `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogTrigger`, `DialogClose`, `DialogOverlay`, `DialogPortal`.

### 3. `components/keyword-workspace/external-badge.tsx`

Kleines Icon-Badge (16×16px) mit einem "E" darin. Wird neben externen Keywords angezeigt, damit man sofort erkennt, dass ein Keyword aus einem Upload stammt und nicht aus der GSC.

- Amber/Orange Farbgebung (Border + Text)
- Dark-Mode Support
- Tooltip: "Externes Keyword (Upload)"

### 4. `components/keyword-workspace/upload-dialog.tsx`

Mehrstufiger Upload-Dialog mit drei Stufen:

**Stufe 1 — Datei auswählen:**
- Drag-and-Drop Zone oder Klick-to-Upload
- Akzeptiert `.csv`, `.xlsx`, `.xls`, `.tsv`, `.txt`
- POST an `/api/keyword-workspace/imports/upload` mit FormData
- Loading-Spinner während Upload

**Stufe 2 — Spalten-Mapping:**
- Zeigt Preview-Tabelle mit den ersten 20 Zeilen
- 8 Dropdown-Selects für: Keyword*, Volume, Impressions, Clicks, Position, URL, CPC, KD
- Auto-Erkennung vorausgefüllt, manuell korrigierbar
- Jeder Dropdown zeigt alle CSV/Excel-Header + "-- Überspringen --"
- Keyword-Spalte ist Pflichtfeld (mit rotem Stern markiert)
- Spalten-Labels werden in der Preview-Tabelle an den Header-Zellen angezeigt

**Stufe 3 — Import:**
- POST an `/api/keyword-workspace/imports/{importId}/confirm-mapping`
- Erfolgs-Toast mit Anzahl importierter Keywords
- Dialog schließt, SWR-Refresh wird getriggert

Props: `projectId`, `open`, `onOpenChange`, `onImportComplete`

---

## Geänderte Dateien

### 5. `app/api/keyword-workspace/imports/upload/route.ts`

**Vorher:** Lokale `detectColumns()`, `parseFile()` Funktionen; CSV ohne Delimiter-Erkennung; Encoding fest UTF-8.

**Nachher:**
- Importiert `parseFile`, `detectColumns` aus `lib/keyword-workspace/file-parse.ts`
- Lokale Duplikate der Funktionen entfernt
- Response enthält jetzt auch `headers: string[]` (alle Spalten-Namen), damit der Upload-Dialog die Dropdown-Optionen kennt
- CSV-Parsing nutzt jetzt automatische Delimiter- und Encoding-Erkennung

### 6. `app/api/keyword-workspace/imports/[importId]/confirm-mapping/route.ts`

**KRITISCHER BUG-FIX.**

**Vorher:** Speicherte nur das Mapping in `metaJson` und gab `{ status: "MAPPED" }` zurück. **Daten wurden nie tatsächlich importiert** — `ingestSourceMetrics()` wurde nie aufgerufen.

**Nachher:**
1. Speichert Mapping in `metaJson` (wie vorher)
2. Liest die Datei von Disk (Pfad aus `meta.path`)
3. Parsed die Datei mit `parseFile()` (shared utils)
4. Wendet das bestätigte Spalten-Mapping an → baut `MetricInput[]` Rows
5. Ruft `ingestSourceMetrics({ replaceExistingForSource: true })` auf
6. Ruft `recomputeDemandForProject()` auf
7. Response: `{ importId, status: "INGESTED", rowCount }`

Zusätzlich:
- Schema erweitert um `cpcColumn` und `kdColumn`
- Edge Case: Wenn die Datei auf Disk nicht mehr existiert → HTTP 410 mit klarer Fehlermeldung

### 7. `app/api/keyword-workspace/current/upload/route.ts`

Refactoring: Importiert jetzt `parseFile`, `detectColumns`, `parseNumber` aus `lib/keyword-workspace/file-parse.ts` statt lokaler Duplikate. Keine Verhaltensänderung.

### 8. `lib/keyword-workspace/serp-cluster.ts`

In `getLatestSerpClusters()` (Zeile ~622): Das Keyword-Objekt in der API-Response enthält jetzt zusätzlich `demandSource`:

```typescript
// Vorher:
{ id, kwRaw, demandMonthly }

// Nachher:
{ id, kwRaw, demandMonthly, demandSource }
```

`demandSource` ist `"gsc"`, `"upload"` oder `"none"`. Damit weiß das Frontend, ob ein Keyword extern ist.

### 9. `app/(dashboard)/keyword-workspace/page.tsx`

Mehrere Änderungen:

- **Import-Statements:** `Upload` Icon aus lucide-react, `UploadKeywordsDialog`, `ExternalBadge`
- **SerpKeyword Type:** Erweitert um `demandSource?: string`
- **State:** `uploadOpen` State für Dialog-Steuerung
- **Import-Button:** Im Bottom-Dock zwischen "Clustern" und "Refresh" eingefügt. Disabled wenn Clustering läuft oder kein Projekt geladen.
- **Upload-Dialog:** Wird am Ende der Komponente gerendert, erhält `projectId` und `onImportComplete` → triggert `mutateSerp()` + `mutateStatus()`
- **"E"-Badge in ParentNode** (expanded Detailansicht): Vor `kwRaw` wenn `demandSource === "upload"`
- **"E"-Badge in SubclusterNode**: Gleiche Logik

---

## Datenfluss (End-to-End)

```
1. User klickt "Import" im Bottom-Dock
2. Upload-Dialog öffnet sich
3. User wählt CSV/Excel Datei (Drag & Drop oder Klick)
4. POST /api/keyword-workspace/imports/upload
   → parseFile() mit auto Delimiter + Encoding
   → detectColumns() mit Sistrix-aware Matching
   → Datei auf Disk gespeichert
   → KeywordSource Record erstellt (type: "upload")
   → Preview (20 Rows) + detected Columns zurückgegeben
5. User prüft/korrigiert Spalten-Mapping im Dialog
6. User klickt "Importieren"
7. POST /api/keyword-workspace/imports/{importId}/confirm-mapping
   → Datei wird von Disk neu gelesen + geparst
   → Bestätigtes Mapping wird angewendet
   → ingestSourceMetrics():
     - normalizeKeyword() für jedes Keyword
     - Deduplizierung per kwNorm
     - Keyword Records erstellt (oder existierende gefunden)
     - KeywordSourceMetric Upsert
   → recomputeDemandForProject():
     - Für jedes Keyword: gscMonthly ?? uploadMonthly ?? 0
     - GSC hat IMMER Vorrang (demandSource = "gsc" wenn GSC Daten existieren)
8. Toast: "X Keywords importiert"
9. SWR Refresh → Cluster-Daten werden neu geladen
10. User klickt "Clustern" → SERP-Clustering nutzt ALLE Keywords (GSC + Upload)
11. Externe Keywords zeigen "E"-Badge in der Cluster-Visualisierung
```

---

## Duplikat-Handling

Wenn ein Keyword in GSC UND im Upload vorkommt:
- Es gibt nur einen `Keyword` Record (matched per `kwNorm`)
- Es gibt zwei `KeywordSourceMetric` Records (einer pro Source)
- `recomputeDemandForProject()` setzt: `demandMonthly = gscMonthly ?? uploadMonthly ?? 0`
- `demandSource = "gsc"` wenn GSC-Daten existieren → **GSC hat immer Vorrang**
- Das Keyword wird in der UI **ohne** "E"-Badge angezeigt (weil `demandSource = "gsc"`)

---

## Nicht verändert

- **Clustering-Algorithmus** (`serp-cluster.ts` Pipeline, `precluster.ts`): Keine Änderungen. Der Algorithmus arbeitet bereits mit allen Keywords aus der DB, unabhängig von der Quelle.
- **Prisma Schema**: Keine Migrationen nötig. Alle benötigten Felder (`sistrixVolume`, `cpc`, `kd`, `demandSource`) existierten bereits.
- **`package.json`**: Keine neuen Dependencies. `csv-parse`, `xlsx`, `iconv-lite`, `@radix-ui/react-dialog` waren alle bereits installiert.

---

## Offener Bug: Lange Keywords schneiden Demand-Zahl ab

**Status:** Analyse fertig, noch nicht implementiert.

### Problem

In der Cluster-Visualisierung (ReactFlow) werden Keywords als Zeilen mit `flex justify-between` dargestellt: links der Keyword-Text, rechts die Demand-Zahl. Bei langen Keywords wird die Demand-Zahl nach rechts aus dem sichtbaren Bereich geschoben oder ganz abgeschnitten, weil die Nodes eine **feste Breite** haben.

### Betroffene Stellen

Alle in `app/(dashboard)/keyword-workspace/page.tsx`:

| Komponente | Zeile (ca.) | CSS-Klasse | Feste Breite |
|---|---|---|---|
| **ParentNode** (expanded) | 94 | `w-[360px]` | 360px |
| **ParentNode** (compact/overview) | 134 | `w-[280px]` | 280px |
| **SubclusterNode** | 161 | `w-64` | 256px (16rem) |

Zusätzlich nutzt die **Dagre-Layout-Berechnung** (Zeile 281) feste Werte:
```typescript
sortedSubclusters.forEach((s) => g.setNode(`sub-${s.id}`, { width: SUB_WIDTH, height: SUB_HEIGHT }));
```
`SUB_WIDTH = 260` und `SUB_HEIGHT = 150` sind als Konstanten definiert (Zeile 60-61).

Die **Overview-Grid-Positionen** (Zeile 224-226) berechnen sich ebenfalls aus festen Konstanten:
```typescript
x: col * (PARENT_WIDTH + GRID_GAP_X)   // PARENT_WIDTH = 280
y: row * (PARENT_HEIGHT + GRID_GAP_Y)  // PARENT_HEIGHT = 120
```

### Ursache im Detail

Die Keyword-Zeilen in beiden Nodes sehen so aus:
```tsx
<div className="flex justify-between gap-1">
  <span className="truncate flex items-center gap-1">
    {k.demandSource === "upload" && <ExternalBadge />}  // 16px Badge
    {k.kwRaw}                                            // variabler Text
  </span>
  <span>{Math.round(k.demandMonthly)}</span>             // Demand-Zahl
</div>
```

Das `truncate` auf dem Keyword-`<span>` setzt `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. Das funktioniert grundsätzlich. **Aber:** Der `<span>` für die Demand-Zahl hat kein `shrink-0` — wenn der verfügbare Platz zu knapp wird (besonders mit dem "E"-Badge), kann Flexbox die Demand-Zahl zusammenstauchen oder sie wird durch das Overflow des Eltern-Containers abgeschnitten.

### Lösung: Zwei Änderungen nötig

#### Änderung A: `shrink-0` auf die Demand-Zahl (Quick-Fix)

Damit die Demand-Zahl NIE zusammengestaucht wird, muss sie `shrink-0` bekommen. Das ist unabhängig von der Breitenänderung sinnvoll.

**Zeile ~118 (ParentNode expanded):**
```tsx
// Vorher:
<span>{Math.round(k.demandMonthly)}</span>

// Nachher:
<span className="shrink-0 tabular-nums">{Math.round(k.demandMonthly)}</span>
```

**Zeile ~181 (SubclusterNode):**
```tsx
// Gleiche Änderung
<span className="shrink-0 tabular-nums">{Math.round(k.demandMonthly)}</span>
```

`tabular-nums` sorgt dafür, dass Zahlen gleich breit gerendert werden (monospaced digits), was die Spalte sauber ausrichtet.

#### Änderung B: Feste Breite → Mindestbreite (dynamische Anpassung)

Die Nodes sollen die aktuelle Breite als **Minimum** behalten, aber bei Bedarf breiter werden.

**SubclusterNode (Zeile 161):**
```tsx
// Vorher:
"rounded-lg border bg-accent px-3 py-2 shadow-sm w-64 ..."

// Nachher:
"rounded-lg border bg-accent px-3 py-2 shadow-sm min-w-[16rem] w-max max-w-[28rem] ..."
```
- `min-w-[16rem]` = bisherige 256px als Minimum
- `w-max` = Breite passt sich an den Inhalt an
- `max-w-[28rem]` = Maximum damit es nicht endlos breit wird (448px)

**ParentNode expanded (Zeile 94):**
```tsx
// Vorher:
"... w-[360px] max-h-[520px] ..."

// Nachher:
"... min-w-[360px] w-max max-w-[500px] max-h-[520px] ..."
```

**ParentNode compact (Zeile 134) — NICHT ändern:**
Die Overview-Cards im Grid sollten **feste Breite** behalten (`w-[280px]`), weil sie in einem regelmäßigen Raster dargestellt werden. Dort werden keine Keywords angezeigt, nur der Cluster-Name (der schon `truncate` hat).

#### Änderung C: Dagre-Layout-Berechnung anpassen

Das Dagre-Layout berechnet Positionen basierend auf festen `SUB_WIDTH`/`SUB_HEIGHT`. Wenn Nodes jetzt dynamisch breiter werden können, muss die Layout-Berechnung den tatsächlichen Platzbedarf berücksichtigen.

**Option 1 (einfach):** `SUB_WIDTH` auf den `max-w` Wert erhöhen (z.B. 448), damit Dagre genug Platz zwischen Nodes lässt. Nachteil: Mehr Whitespace bei kurzen Keywords.

**Option 2 (besser):** Pro Subcluster die benötigte Breite berechnen, basierend auf dem längsten Keyword. Ungefähr so:

```typescript
// In buildFlowGraph, vor dem Dagre-Layout:
function estimateNodeWidth(subcluster: SerpSubcluster): number {
  const longestKw = Math.max(
    SUB_WIDTH,
    ...subcluster.keywords.map((k) => {
      // ~7px pro Zeichen bei text-xs, +60px für Demand-Zahl, +24px für Padding, +20px für Badge
      const badgeWidth = 20; // falls externes KW
      return k.kwRaw.length * 7 + 60 + 24 + badgeWidth;
    })
  );
  return Math.min(longestKw, 448); // max-w cap
}

sortedSubclusters.forEach((s) => {
  const w = estimateNodeWidth(s);
  g.setNode(`sub-${s.id}`, { width: w, height: SUB_HEIGHT });
});
```

**Empfehlung:** Option 1 ist sicherer und einfacher. Die dynamische Berechnung (Option 2) ist nice-to-have, aber die Zeichenbreiten-Schätzung ist ungenau (proportionale Schriften). Mit `max-w-[28rem]` und `SUB_WIDTH = 448` für Dagre ist das Ergebnis in den meisten Fällen gut genug.

#### Änderung D: `DETAIL_WIDTH` Konstante für Focus-Mode anpassen

Im Focus-Mode (Zeile 274-284) wird der X-Offset der Subcluster-Nodes berechnet als:
```typescript
const xOffset = DETAIL_WIDTH + 120;
```

Wenn der expanded ParentNode jetzt dynamisch breiter wird (min 360px, max 500px), sollte `DETAIL_WIDTH` auf 500 erhöht werden, damit die Subcluster-Nodes nicht mit dem erweiterten Parent überlappen.

```typescript
// Vorher:
const DETAIL_WIDTH = 360;

// Nachher:
const DETAIL_WIDTH = 500;
```

### Zusammenfassung der Änderungen

| Was | Wo (Zeile ca.) | Änderung |
|---|---|---|
| Demand-Zahl `shrink-0` | 118, 181 | `<span className="shrink-0 tabular-nums">` |
| SubclusterNode Breite | 161 | `w-64` → `min-w-[16rem] w-max max-w-[28rem]` |
| ParentNode expanded Breite | 94 | `w-[360px]` → `min-w-[360px] w-max max-w-[500px]` |
| ParentNode compact Breite | 134 | **Nicht ändern** (bleibt `w-[280px]`) |
| `DETAIL_WIDTH` Konstante | 58 | `360` → `500` |
| `SUB_WIDTH` für Dagre | 60 | `260` → `448` |
| Dagre setNode | 281 | Nutzt neuen `SUB_WIDTH` automatisch |

### Verifikation

1. Cluster mit kurzen Keywords (z.B. "SEO", "SEM") → Nodes behalten Mindestbreite, sehen aus wie vorher
2. Cluster mit langen Keywords (z.B. "macbook pro 16 zoll 2024 kaufen günstig") → Node wird breiter, Demand-Zahl bleibt sichtbar
3. Cluster mit "E"-Badge + langem Keyword → Badge + Text + Demand alle sichtbar
4. Focus-Mode: Expanded Parent und Subclusters überlappen nicht
5. Overview-Grid: Compact Parent-Cards behalten ihr regelmäßiges Raster
