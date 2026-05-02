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

## Bug-Fix: Lange Keywords schneiden Demand-Zahl ab

**Status:** Implementiert und nach `main` gepusht.

- **Umsetzung:** Commit `9948c70` (2026-02-23)
- **Datei:** `app/(dashboard)/keyword-workspace/page.tsx`
- **Ansatz:** Minimaler, robuster Flex-/Truncate-Fix ohne Änderung an Node-Breiten oder Dagre-Konstanten.

### Was genau geändert wurde

#### 1) ParentNode (expanded) Keyword-Zeilen

Vorher:
```tsx
<div className="flex justify-between gap-2">
  <span className="truncate flex items-center gap-1">
    {k.demandSource === "upload" && <ExternalBadge />}
    {k.kwRaw}
  </span>
  <span>{Math.round(k.demandMonthly)}</span>
</div>
```

Nachher:
```tsx
<div className="flex min-w-0 items-center justify-between gap-2">
  <span className="flex min-w-0 flex-1 items-center gap-1">
    {k.demandSource === "upload" && <ExternalBadge />}
    <span className="truncate">{k.kwRaw}</span>
  </span>
  <span className="shrink-0 tabular-nums">{Math.round(k.demandMonthly)}</span>
</div>
```

#### 2) SubclusterNode Keyword-Zeilen

Vorher:
```tsx
<div className="flex justify-between gap-1">
  <span className="truncate flex items-center gap-1">
    {k.demandSource === "upload" && <ExternalBadge />}
    {k.kwRaw}
  </span>
  <span>{Math.round(k.demandMonthly)}</span>
</div>
```

Nachher:
```tsx
<div className="flex min-w-0 items-center justify-between gap-1">
  <span className="flex min-w-0 flex-1 items-center gap-1">
    {k.demandSource === "upload" && <ExternalBadge />}
    <span className="truncate">{k.kwRaw}</span>
  </span>
  <span className="shrink-0 tabular-nums">{Math.round(k.demandMonthly)}</span>
</div>
```

### Warum diese Änderungen

- `min-w-0` + `flex-1` auf dem linken Bereich sorgt dafür, dass `truncate` in Flex-Containern korrekt greifen kann.
- Eigener innerer `span.truncate` für den Keyword-Text trennt Badge und Text sauber.
- `shrink-0` auf der Demand-Zahl verhindert, dass die Zahl bei Platzmangel zusammengedrückt oder abgeschnitten wird.
- `tabular-nums` hält Zahlen in der Spalte optisch stabil.

### Was bewusst **nicht** geändert wurde

- Keine Änderung an `DETAIL_WIDTH`, `SUB_WIDTH`, `PARENT_WIDTH` oder anderen Layout-Konstanten.
- Keine Änderung an `w-[360px]`, `w-[280px]`, `w-64`.
- Keine Änderung an Dagre-Layout, API, TypeScript-Types oder Prisma-Schema.

### Ergebnis

Der Flex-/Truncate-Fix allein hat das Problem **nicht vollständig gelöst**. Die Demand-Zahlen waren bei langen Keywords weiterhin abgeschnitten, weil der SubclusterNode-Container eine feste Breite von `w-64` (256px) hatte — `truncate` konnte den Text zwar kürzen, aber bei vielen Keywords war der verbleibende Platz für die Demand-Zahl trotzdem zu knapp. Siehe Folge-Fix unten.

---

## Bug-Fix: SubclusterNode dynamische Breite

**Status:** Implementiert und nach `main` gepusht.

- **Umsetzung:** Commit `bca1adc` (2026-02-23)
- **Datei:** `app/(dashboard)/keyword-workspace/page.tsx`
- **Ansatz:** SubclusterNodes wachsen dynamisch von 256px bis max 380px, je nach längstem Keyword. Dagre-Layout berechnet die Breite pro Node.

### Problem

Der SubclusterNode hatte eine feste Breite von `w-64` (256px). Bei langen Keywords + ExternalBadge (16px + 4px Gap) blieb zu wenig Platz für die Demand-Zahl rechts. Der vorherige Flex-Fix (`shrink-0`, `min-w-0`) verhinderte zwar das Zusammendrücken der Zahl, aber bei 256px Gesamtbreite wurde der Keyword-Text so stark gekürzt, dass die Zeile trotzdem unlesbar wirkte.

### Was geändert wurde

#### 1) Konstanten

```ts
// Vorher:
const SUB_WIDTH = 260;

// Nachher:
const SUB_MIN_W = 260;
const SUB_MAX_W = 380;
```

#### 2) Neue Hilfsfunktion `estimateSubWidth()`

Berechnet die optimale Breite pro Subcluster basierend auf dem längsten Keyword:

```ts
function estimateSubWidth(keywords: SerpKeyword[]): number {
  if (!keywords.length) return SUB_MIN_W;
  const longest = Math.max(
    ...keywords.map((k) => {
      const badgeW = k.demandSource === "upload" ? 20 : 0;
      return k.kwRaw.length * 6.5 + badgeW + 54;
    })
  );
  return Math.min(Math.max(Math.ceil(longest), SUB_MIN_W), SUB_MAX_W);
}
```

- ~6.5px pro Zeichen bei `text-xs`
- +20px für ExternalBadge (nur bei Upload-Keywords)
- +54px für Demand-Zahl, Gap und Container-Padding
- Ergebnis wird auf `[260, 380]` geclampt

#### 3) Dagre-Layout mit dynamischer Breite pro Node

```ts
const subWidths = new Map<string, number>();
sortedSubclusters.forEach((s) => {
  const w = estimateSubWidth(s.keywords ?? []);
  subWidths.set(s.id, w);
  g.setNode(`sub-${s.id}`, { width: w, height: SUB_HEIGHT });
});
```

Dagre bekommt die tatsächliche Breite jedes Nodes, sodass breitere Nodes korrekt positioniert werden und sich nicht überlappen.

#### 4) SubclusterNode-Komponente

```tsx
// Vorher:
className="... w-64 ..."
style={{ transitionDelay: delayMs }}

// Nachher:
className="... ..."  // w-64 entfernt
style={{ width: data.subWidth ?? 256, minWidth: 256, transitionDelay: delayMs }}
```

Die Breite kommt jetzt dynamisch aus `data.subWidth`, mit 256px als Fallback und Mindestbreite.

### Warum dieser Ansatz

- **Minimaler Eingriff:** Nur die SubclusterNode-Breite und Dagre-Konfiguration wurden angepasst.
- **Abwärtskompatibel:** Subclusters mit kurzen Keywords sehen exakt wie vorher aus (256px).
- **Kein Layout-Bruch:** Dagre berücksichtigt die individuelle Breite, kein Überlappen.
- **ExternalBadge-aware:** Die Breitenberechnung addiert 20px wenn ein Upload-Keyword vorhanden ist.

### Was bewusst **nicht** geändert wurde

- Keine Änderung an ParentNode-Breiten (`PARENT_WIDTH`, `DETAIL_WIDTH`).
- Keine Änderung an der Keyword-Zeilen-Flex-Struktur (der Fix aus `9948c70` bleibt erhalten).
- Keine Änderung an API, TypeScript-Types oder Prisma-Schema.

### Verifikation

- **Technisch:** `npm run lint` erfolgreich (keine ESLint-Fehler/Warnungen).
- **Manuelle UI-QA:** Im Browser prüfen mit kurzen und langen Keywords, mit/ohne ExternalBadge.
