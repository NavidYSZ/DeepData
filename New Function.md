ich möchte ein Keyword Mapping & Clustering tool bauen.
Es soll eine SQLite geben.
Man soll Keywords hochladen können, sowohl eigene als auch von konkurrenten (CSV, Excel) Spalten sollen automatisch erkannt werden.

Dann gibt es als Hauptfeature einen LLM-Agent (SEO-Agent) der sich mit SEO auskennt, mit Keyword Mapping & Clustering, und der subagents beauftragen kann. z.B. um den Intent eines Keywords zu recherchieren (mit Zyte SERP Daten) oder einen Research Agent, der herausfindet wo ein Thema dazu gehört oder wo eher nicht (clustering) und dann auch dass der Agent dauerhaft Zugriff auf die SQLite Datenbank hat, und bestehende Cluster aufrufen kann, um zu entscheiden ob es irgendwo rein soll, oder ob ein neues Cluster benötigt wird.

Wie kann ich den Userflow, UX, UI, usw. in einer simplen WebApp machen?
Wie kann ich das Mapping/Clustering mit der höchsten Qualität kriegen?

Mit React-Flow möchte ich auch machen, dass mir die Cluster angezeigt werden, wenn ich draufklicke dann öffnet sich z.B. eine Sidebar wo die ganzen KW drinstehen, was das für ein cluster ist, welche Intents abgedeckt werden usw.

Verstehst du? Ich brauche ein tool, was die Möglichkeiten von LLM und Agents und tools nutzt, um für mich die besten Ergebnisse zu erzielen. Ich brauche aber auch die Möglichkeit dass ich Keywords löschen, hinzufügen, in ein anderes cluster schieben, neues Cluster, usw.

Quasi wie eine Arbeitsfläche für Keywords, aber mit LLM und LLM-Agent Power dahinter.

Brauche auch die Möglichkeit anfangs nur einzelne Cluster auszuwählen, oder bestimmte rauszunehmen.

Das soll sehr einfach zu bedienen und sehr intuitiv sein. Was schlägst du mir vor wie ich das umsetze? Bitte 3 Optionen mit Vor und Nachteilen jeweils.


---------

Verstanden. Ich würde das Tool wie eine **Keyword-Arbeitsfläche** bauen: links deine Daten (KW + Quellen), in der Mitte die **Cluster-Struktur** (Graph/Karten), rechts ein **Agent-Cockpit** (Erklärung, Vorschläge, Aktionen, “Warum?”).

Unten sind **3 umsetzbare UX/UI-Optionen** (jeweils mit Vor-/Nachteilen) + wie du **Mapping/Clustering maximal hochwertig** bekommst.

---

## Option 1: Wizard → Review-Workspace → Graph (beste “Einsteiger-UX”, trotzdem pro)

**Userflow**

1. **Import** (CSV/Excel Drag&Drop)

   * Auto-Spaltenerkennung: keyword, volume, kd, cpc, url, position, source (eigene/konkurrent), country, language
   * Preview + “Fix mapping” (Dropdown pro Spalte)
2. **Cleaning & Normalisierung**

   * Dedupes, Sprache/Region check, Brand-Filter, Singular/Plural-Hinweise, lokale Modifikatoren
3. **Clustering-Setup** (3–5 einfache Toggles)

   * Ziel: “Website-Struktur” vs “Content-Plan”
   * Granularität: grob ↔ fein
   * SERP-Daten nutzen: an/aus (Zyte)
4. **Auto-Cluster Run** (Agent) → Ergebnis in **Review-Modus**
5. **Review-Workspace**

   * Cluster-Liste (links), Keyword-Tabelle (mit Bulk-Moves), rechts Agent-Sidebar (“Intent”, “Page-Empfehlung”, “Warum”, “Merge/Split Vorschläge”)
6. **Graph-View (React-Flow)** als Visualisierung + Navigation

   * Klick Cluster → Sidebar mit KW, Intent-Mix, Beispiel-SERPs, “Primary vs Secondary KW”, “Proposed Page”
7. **Export** (Mapping CSV, Content Briefs, Seitenstruktur)

**Vorteile**

* Sehr intuitiv, “führt” den Nutzer → wenig Overwhelm
* Qualität hoch, weil du früh **Datenqualität + Setup** absicherst
* Skalierbar: erst Table/Review, dann Graph als Bonus

**Nachteile**

* Wizard fühlt sich für Power-User manchmal “langsam” an
* Mehr UI-Screens (aber sauber planbar)

---

## Option 2: “Spreadsheet-First” + Agent-Copilot + Graph als Sekundäransicht (beste Bulk-Bearbeitung)

**Userflow**

* Start direkt in einer **Tabelle wie Airtable/Sheets** (TanStack Table):

  * Jede Zeile = Keyword
  * Spalten: Cluster, Intent, PageType, Primary/Secondary, Source, Metrics, Notes
* Rechts ein **Agent-Panel**:

  * “Cluster selected rows”
  * “Find best cluster for these”
  * “Create new cluster from selection”
  * “Explain intent based on SERP”
* Oben: **Views** (Saved Filters):

  * “Unassigned”, “Conflicts”, “Near-Duplicates”, “Competitor only”, “Local intent”
* Graph-View (React-Flow) nur für: “Map Navigation / Struktur verstehen”, nicht fürs tägliche Verschieben (optional Drag&Drop)

**Vorteile**

* Extrem schnell für reale SEO-Arbeit (Bulk-Moves, Multi-Select, Copy/Paste)
* Weniger “UI-Magie”, leichter stabil zu bauen
* Agent wird zum **Produktivitäts-Layer**, nicht zum Spielzeug

**Nachteile**

* Weniger “Wow” als Whiteboard-Graph
* Du musst Table-UX richtig gut machen (Views, Bulk actions, Undo)

---

## Option 3: Graph-Native “Keyword-Whiteboard” (maximal visuell, komplexer)

**Userflow**

* Hauptansicht ist React-Flow:

  * Cluster = große Nodes (Cards)
  * Keywords = Chips внутри Node (oder on-demand in Sidebar)
  * Drag KW Chip von Cluster A → Cluster B
  * Merge/Split als Graph-Actions
* Sidebar: Cluster-Definition, Intent-Mix, SERP-Belege, “Lock cluster”, “Add negatives”
* Optional: Mini-Table als “Data Drawer” unten

**Vorteile**

* Super intuitiv für Strukturdenken, macht Spaß, “Mindmap-Feeling”
* Sehr stark für Workshops/Präsentationen

**Nachteile**

* Deutlich mehr Engineering (Performance, Drag-UX, Zoom, Virtualization)
* Bulk-Bearbeitung ist im Graph fast immer schlechter als in Tabellen
* Gefahr: “Nice to look at” > “schnell Ergebnisse liefern”, wenn nicht gut ergänzt

---

# Wie du Mapping/Clustering auf **höchste Qualität** bringst (pragmatisch + agentisch)

## 1) Hybrid-Pipeline statt “LLM entscheidet alles”

**Best-Practice:** erst algorithmisch sauber vorsortieren, dann LLM für die letzten 20% Entscheidungen.

**Pipeline**

1. **Normalize**: Lowercase, Trim, Umlaut-Normalisierung, dedupe, remove extra modifiers (optional), detect brand/local tokens
2. **Embeddings** (semantisch): Vorschläge/Ähnlichkeit/Nearest neighbors
3. **SERP-Signals (Zyte Top10)**:

   * Intent-Klassifikation (informational/commercial/transactional/navigational/local)
   * SERP-Overlap-Clustering (wenn SERPs ähnlich → sehr wahrscheinlich gleiches Cluster)
4. **LLM-Agent** macht daraus:

   * Cluster-Label + Beschreibung + “Gehört dazu / gehört nicht dazu”
   * Primary keyword + Secondary set
   * Page-Type Empfehlung (Kategorie/Leistung/Guide/FAQ/Glossar)
   * **Rationale + Evidenz** (SERP titles/URL patterns), damit du es prüfen kannst

Warum das besser ist: SERP-Overlap reduziert Halluzinationen massiv, Embeddings geben Speed, LLM gibt Struktur/Benennung/Edge-Cases.

---

## 2) “Cluster Memory” in SQLite (damit der Agent konsistent bleibt)

Speichere pro Cluster:

* **definition** (1–2 Sätze)
* **intent distribution** (z.B. 70% commercial, 30% informational)
* **exemplar keywords** (Top 20)
* **negative keywords** (was explizit nicht dazugehört)
* **serp fingerprints** (z.B. Top domains / URL patterns)
* **locked flag** (Cluster darf nicht automatisch verändert werden)

Dann kann der Agent bei neuen KW per Retrieval entscheiden:

* “passt in bestehendes Cluster” vs “neues Cluster nötig”
* und er kann **bestehende Cluster aufrufen**, statt jedes Mal neu zu erfinden.

---

## 3) Human-in-the-loop als Feature, nicht als Notlösung

Damit das Tool “Pro-Qualität” erreicht:

* **Confidence Score** pro Zuordnung (z.B. hoch bei SERP-Overlap, mittel bei embedding-only, niedrig bei LLM-only)
* **Conflict Queue**: KW mit mehreren möglichen Clustern → Review-Liste
* **Undo/History** (Event Log): jede Move/Merge/Split Aktion tracken

---

## 4) Agent-Orchestrierung (damit Sub-Agents sinnvoll arbeiten)

Rollen (einfach, aber effektiv):

* **Planner/SEO-Agent**: macht Plan + delegiert
* **SERP Agent**: Zyte fetch + Intent + SERP fingerprint
* **Clustering Agent**: gruppiert + schlägt Merge/Split vor
* **Mapping Agent**: entscheidet Primary/Secondary + Page type
* **QA Agent**: findet Inkonsistenzen (z.B. gleiche SERP aber zwei Cluster)

Wichtig: alle Agents liefern **strict JSON** + werden validiert (Schema), sonst “rerun”.

---

# Meine Empfehlung

Wenn du “schnell produktiv + pro-SEO Workflow” willst: **Option 2** (Spreadsheet-First) und du baust den Graph als **Navigation/Visual Layer** dazu.
Wenn du “maximal intuitiv für viele Nutzer” willst: **Option 1** (Wizard → Review → Graph).
Option 3 nur, wenn du bereit bist, **Graph + Table** wirklich zu kombinieren, sonst verlierst du Geschwindigkeit.

Wenn du willst, skizziere ich dir als Nächstes:

* ein konkretes **Screen-Layout** (Header/Left rail/Main/Right rail) inkl. Actions
* ein **SQLite-Schema** (keywords, clusters, mappings, serp_snapshots, events)
* und die **Agent JSON contracts** (Inputs/Outputs), damit du das sofort implementieren kannst.

-----------

Okay das sind schonmal gute Ideen, ich brauche aber eine Version, die vorallem mir erlaubt auch visuell selber dran zu arbeiten, zu verändern usw. Was würdest du also empfehlen?

----------

Wenn du **selbst visuell richtig “arbeiten”** willst (schieben, splitten, mergen, schnell umsortieren), dann würde ich dir eine **Hybrid-UX** empfehlen:

### Empfehlung: **Graph-Workspace (React-Flow) als Hauptfläche + Table-Drawer für Bulk**

Warum: Der Graph gibt dir das **visuelle Denken/Sortieren**, aber die Tabelle löst die Realität: **Mass-Moves, Filtern, Suchen, Copy/Paste, schnelle Korrekturen**.

---

## So sieht die UX aus (bewährt + intuitiv)

### 1) React-Flow zeigt **nur Cluster als Nodes** (nicht jedes Keyword als Node)

* Cluster-Node = Card mit:

  * Cluster-Name + 1-Satz Definition
  * #Keywords, Intent-Mix (mini badges), Confidence
  * Top 5 Keywords als “Chips” (Preview)
* Klick auf Node → **rechte Sidebar** öffnet:

  * komplette Keyword-Liste (virtualized)
  * Intent-Verteilung, SERP-Fingerprint, Primary/Secondary Vorschläge
  * Buttons: **Split**, **Merge**, **Lock**, **Rename**, **Add negative keywords**

**Wichtig:** Keywords als einzelne Nodes im Graph wird schnell unbenutzbar (Performance + Chaos). Keywords gehören in Sidebar/Drawer.

---

### 2) Drag & Drop so, dass es sich “wie Arbeit” anfühlt

* In der Sidebar (Keyword-Liste) kannst du Keywords **multiselect** (Shift/⌘)
* Drag Selection → drop auf anderen Cluster-Node
* Danach: Toast “moved 18 keywords” + **Undo**
* Optional: Drop-Zone “New Cluster” → Agent schlägt Cluster-Name/Definition vor, du akzeptierst/änderst

---

### 3) Unten ein **Table-Drawer** (Airtable/Sheets-Style) als Turbo-Modus

* Öffnet sich mit Hotkey (z.B. `T`)
* Views: Unassigned / Conflicts / Low confidence / Competitor-only / Local-intent
* Bulk actions: assign cluster, remove, tag, export, “ask agent”
* Das ist dein “Produktivitäts-Hammer”, wenn du 500+ Keywords schnell sortieren willst.

---

### 4) Fokus-Modus (super wichtig)

Du wolltest: “anfangs nur einzelne Cluster auswählen”

* Links: Cluster-Liste mit Checkboxen → **Focus Set**
* Graph zeigt nur Focus-Cluster + direkte Nachbarn (Merge-Candidates)
* Agent arbeitet nur auf dem Focus Set (spart Kosten + hält dich im Flow)

---

## Warum das die beste visuelle Arbeits-Version ist

* Du bekommst **visuelle Übersicht** (Graph) + **echte Kontrolle** (Table)
* Du kannst **manuell perfekt feinjustieren**, ohne gegen die UI zu kämpfen
* Du kannst Agent-Power nutzen, aber **du** bleibst der Editor

---

## 1–2 Design-Entscheidungen, die’s “pro” machen

* **Undo/History** (Event Log): jede Move/Merge/Split Aktion rückgängig
* **Lock Cluster**: Agent darf nicht automatisch umstrukturieren
* **Confidence** pro Zuordnung + Conflict Queue (damit du nur die kritischen Dinge anfässt)

---

## Build-Reihenfolge (damit du schnell ein nutzbares MVP hast)

1. Import + Spaltenerkennung → SQLite
2. Table-Drawer (Views + Bulk-Moves + Undo)
3. React-Flow Cluster-Graph (Nodes + Sidebar)
4. Agent: “Assign to best cluster” + “Create new cluster” + “Merge/Split suggestions” (mit Confidence)

Wenn du willst, skizziere ich dir als nächstes **ein konkretes Layout (Header/Left rail/Graph/Sidebar/Drawer)** + die wichtigsten **React-Flow Interactions (drag target, selection, undo)** als umsetzbare Spezifikation.


---------------------

Ja – genau so würde ich’s bauen: **links ein aufklappbarer Keyword-Drawer** (Quelle auswählen + filtern + suchen), und von dort **Drag&Drop auf Cluster-Nodes** im React-Flow Canvas.

## UI/UX Vorschlag (sehr “arbeitsfähig”)

### Layout

* **Header:** Projekt, Import, “Run Agent”, Export, Undo/Redo
* **Left Drawer (collapsible):** Keywords (dein “Inventory”)
* **Center:** React-Flow Cluster-Canvas
* **Right Sidebar:** Cluster-Inspector (Details, Intent, SERP-Belege, Aktionen)

---

## Left Drawer: Keyword Inventory (dein Wunsch-Flow)

### Oben im Drawer

1. **Source Selector**

   * Dropdown: `GSC`, `Upload: <Dateiname>`, `Competitor: <Domain>`, `All sources`
   * Optional: Multi-select Sources

2. **Search + Quick Filters**

   * Suche (keyword contains)
   * Tabs/Chips: `Unassigned`, `Assigned`, `Conflicts`, `Low confidence`, `Duplicates`
   * Filter: Intent, Local-Modifier, Brand, Volume Range

### Keyword List (virtualisiert)

* Jede Zeile = Keyword Card (klein, schnell)

  * Keyword + mini-metrics
  * Badge: Source, Intent (falls vorhanden), Confidence
  * Status: Assigned Cluster (wenn assigned)

### Multi-Select + Drag

* Auswahl:

  * `Shift` für Range
  * `Cmd/Ctrl` für einzelne
* Drag:

  * Drag-Ghost zeigt: “18 Keywords”
* Drop auf Cluster Node:

  * sofort assign + Toast “Moved 18 → Cluster X” + **Undo**

**Optional (richtig nice):**

* “Staging” Sektion im Drawer:

  * Du markierst Keywords → “Add to Batch”
  * Batch kannst du dann als Block auf Cluster ziehen (mega angenehm)

---

## Drag & Drop auf React-Flow Cluster

### Cluster Node als Drop Target

* Node bekommt im Hover eine klare Drop-Outline (“Drop to add keywords”)
* Beim Drop:

  * Wenn Keyword schon in anderem Cluster: **Move** (mit Undo)
  * Wenn Keyword schon im selben Cluster: ignore + kleines “already there”

### “New Cluster” Drop Zone

* Oben im Canvas (oder als floating Button):

  * “Drop here to create new cluster”
* Drop → Modal/Inline:

  * Vorschlag vom Agent: Cluster Name + 1-Satz Definition
  * Du kannst direkt bestätigen/ändern

---

## Was du vermeiden solltest (damit es wirklich benutzbar bleibt)

* **Keine Keywords als einzelne Nodes** im Graph → wird schnell Chaos/slow
  Stattdessen: Graph zeigt Cluster, Keywords leben im Drawer + Cluster-Sidebar.

---

## Technische Umsetzung (kurz, aber konkret)

### Komponenten

* `KeywordDrawer` (links, collapsible)
* `KeywordListVirtual` (TanStack Virtual / react-window)
* `ReactFlowCanvas` (Cluster Nodes)
* `ClusterInspector` (rechts)
* `UIStore` (Zustand) für Selection, Focus, Undo stack

### Drag&Drop

* Für Sidebar → Canvas am stabilsten:

  * `dnd-kit` (Sensors + DragOverlay) **oder** HTML5 Drag Events
* React-Flow Nodes als droppable:

  * Node wrapper nutzt `useDroppable({ id: clusterId })`
  * OnDrop: `assignKeywordsToCluster(keywordIds, clusterId)`

### Undo/Redo (extrem wichtig)

* Jede Aktion schreibt ein Event:

  * `MOVE_KEYWORDS {ids, fromClusterId, toClusterId}`
  * `CREATE_CLUSTER`, `MERGE_CLUSTER`, `SPLIT_CLUSTER`
* Undo = Event invertieren

---

## Kleine UX-Details, die’s “pro” machen

* **Focus Mode:** “nur diese Cluster anzeigen” (für deine Arbeitsphasen)
* **Conflict Queue:** 1 Klick → nur Keywords mit Unklarheit
* **Keyboard shortcuts:**

  * `F` Focus toggle, `T` Drawer toggle, `U` Unassigned view, `Cmd+Z` Undo
* **Inline edit:** Keyword löschen/umbenennen/taggen direkt im Drawer

---

Wenn du willst, schreib ich dir als nächsten Schritt eine **1-seitige Spezifikation** (Screens + States + Interactions) und dazu die **minimalen Data Contracts** (SQLite Tabellen + Events), damit du das sofort sauber implementieren kannst.

--------------

ja bitte! Außerdem soll es so sein:
Es soll nicht automatisch durch AI gemacht werden, sondern das ist eine Zusatzfunktion. Und wenn die AI das macht, dann muss es Zugriff haben auf eine Liste von bestehenden Clustern, und allen Keywords.

Aber als aller erstes soll ein semantisch basiertes Pre-Clustering stattfinden, mit wortnähe, bzw. Ähnlichkeit der Wörter.

Wenn man möchte, kann man dann hinterher von der AI Analysieren lassen, und Änderungen vorschlagen lassen oder sowas. Darauf fokussieren wir uns später, bereiten dafür alles vor, aber heute möchte ich einfach schonmal die Version haben, die die ganzen KW automatisch nach Wortnähe/Wortstamm schonmal "pre-"clustert und man damit schon vollständig arbeiten kann im tool.

Wie wär's sonst so: Man lädt die KW hoch und es werden gleichzeitig die von GSC geladen.
Dann: Es wird standardisiert. z.B. Keyword Sistrix Daten + GSC Daten. Dass es so behandelt wird: Sistrix Volumen = Impressions (von einem Monat) bzw wenn man von 3 Monaten die Daten nimmt, dann geteilt durch 3 halt.

So und dann hat man also eine Ansicht, als cards, drei Spalten. Da steht dann oben der Titel des Clusters (preclusters) und in der card stehen die 5 Keywords mit den höchsten Impressionen/Volumen.

Und hier kann man auch direkt für Fokus die Cluster Wählen/Abwählen (oder man kann auch alle Auswählen klicken und dann weiter; oder alle Abwählen, und dann nur einzelne selber anwählen.)

Außerdem: sind die Cluster die angezeigt werden, auch nach impressionen sortiert. (Also Gesamtimpressionen aller markierten KW)

So und wie machen wir jetzt das preclustering, damit es qualitativ sehr hoch ist? Und man nur minimal nacharbeiten muss, wenn überhaupt?


-----------

Perfekt – dann bauen wir **erst ein starkes, deterministisches Pre-Clustering (ohne LLM)**, das schon “arbeitsfähig” ist. LLM/Agents kommen später als **Review-/Vorschlags-Layer**, aber die Daten-/UI-Struktur ist dafür jetzt schon vorbereitet.

Unten bekommst du:

1. **1-seitige Spezifikation (Screens + States + Interactions)**
2. **Minimale Data Contracts (SQLite Schema + Events/Undo)**
3. **Pre-Clustering-Algorithmus in hoher Qualität (wortnah/word-stem + semantisch ohne LLM)** inkl. Defaults

---

# 1) 1-seitige Spezifikation (MVP: Preclusters + visuelles Arbeiten)

## Hauptflow

**A. Project Setup**

* Projekt anlegen → Sprache/Region (Default: de-DE)
* Connect GSC Property (optional, aber du willst “gleichzeitig laden”)
* Upload (CSV/Excel) (mehrere Files möglich: “eigene KW”, “Konkurrenten KW”, “Sistrix Export”…)
* **Spalten-Autoerkennung** + Mapping UI (keyword, volume, url, position, source, …)

**B. Standardisierung**

* Normalisierung läuft automatisch (siehe “Demand”-Logik unten)
* Ergebnis: jede Keyword-Zeile hat `demand_monthly` (eine Zahl, vergleichbar)

**C. Pre-Clustering (ohne AI/LLM)**

* Button: **“Pre-Cluster erstellen”** (läuft automatisch nach Import)
* Ergebnis: Preclusters + Zuordnung KW → Precluster

**D. Cluster Cards View (deine gewünschte Startansicht)**

* Grid in **3 Spalten** (responsive), **Cards nach total_demand sortiert**
* Jede Card:

  * Titel (Cluster Label)
  * `Total demand` (Summe demand_monthly)
  * Top 5 Keywords nach demand
  * Checkbox “Focus”
  * Actions: Rename, Split, Merge, Exclude
* Toolbar:

  * `Alle auswählen`, `Alle abwählen`, `Nur unklare`, `Nur große Cluster`, Search Cluster

**E. Workspace (React-Flow)**

* Nur **fokussierte Cluster** werden als Nodes geladen
* Links: **Keyword Drawer (collapsible)** mit Source Selector (GSC / Uploads / Competitor / All)
* Drag & Drop aus Drawer → auf Cluster Node (move/assign)
* Rechts: Cluster Inspector (KW-Liste, Top KW, Stats, Rename, Split/Merge, Lock)

---

## UI Layout (MVP)

* **Header:** Project | Import | Pre-Cluster Run | Focus Mode | Export | Undo/Redo
* **Left Drawer (Keywords):**

  * Source Selector (single/multi)
  * Search + Filter (Unassigned, Assigned, Duplicates, Low coherence)
  * Virtualized list + Multi-select
  * Drag selection onto cluster nodes
* **Center:** React-Flow Canvas (Cluster nodes only)
* **Right Sidebar (Inspector):**

  * Cluster Name + Description (optional)
  * Keyword list (sortable by demand)
  * Buttons: Split, Merge, Lock, Delete cluster, Remove keyword

---

## Interactions (wichtig für “Arbeitsgefühl”)

* **Drag & Drop**: Keywords (multi-select) → Cluster Node
* **Undo/Redo**: Cmd+Z / Cmd+Shift+Z (Event Log)
* **Focus Mode**: zeigt nur markierte Cluster (Cards View + Canvas)
* **Merge**: Multi-select Cluster Cards → Merge (Name wählen)
* **Split**: Cluster → “Split by modifier” (regelbasiert, s.u.)
* **Exclude**: Cluster oder Keywords aus Workflow (z.B. Brand, irrelevant)

---

# 2) SQLite Data Contracts (minimal & sauber)

## Tabellen (MVP)

```sql
-- Projects
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lang TEXT DEFAULT 'de',
  country TEXT DEFAULT 'DE',
  created_at TEXT NOT NULL
);

-- Data sources (GSC property, uploaded files, competitor exports)
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,              -- 'gsc' | 'upload'
  name TEXT NOT NULL,              -- e.g. "GSC: example.com" / "sistrix_kw.xlsx"
  meta_json TEXT,                  -- column mapping, date range, etc.
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- Keywords (one row per keyword per project; source-specific metrics live in keyword_source_metrics)
CREATE TABLE keywords (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kw_raw TEXT NOT NULL,
  kw_norm TEXT NOT NULL,           -- normalized string
  kw_sig TEXT NOT NULL,            -- signature for clustering (stems/tokens)
  lang TEXT,
  country TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- Metrics per keyword per source (so you can merge GSC + Sistrix)
CREATE TABLE keyword_source_metrics (
  keyword_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  impressions INTEGER,
  clicks INTEGER,
  position REAL,
  sistrix_volume INTEGER,
  cpc REAL,
  kd REAL,
  url TEXT,
  date_from TEXT,
  date_to TEXT,
  PRIMARY KEY(keyword_id, source_id),
  FOREIGN KEY(keyword_id) REFERENCES keywords(id),
  FOREIGN KEY(source_id) REFERENCES sources(id)
);

-- Standardized “monthly demand” per keyword (computed)
CREATE TABLE keyword_demand (
  keyword_id TEXT PRIMARY KEY,
  demand_monthly REAL NOT NULL,
  demand_source TEXT NOT NULL,     -- 'gsc' | 'sistrix' | 'mixed' | 'none'
  computed_at TEXT NOT NULL,
  FOREIGN KEY(keyword_id) REFERENCES keywords(id)
);

-- Preclusters (auto-generated)
CREATE TABLE preclusters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  algo_version TEXT NOT NULL,      -- e.g. "lex+char3-5+leiden_v1"
  label TEXT NOT NULL,
  total_demand REAL NOT NULL,
  cohesion REAL NOT NULL,          -- 0..1 internal coherence score
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- Membership: keyword -> precluster
CREATE TABLE precluster_members (
  precluster_id TEXT NOT NULL,
  keyword_id TEXT NOT NULL,
  score REAL NOT NULL,             -- similarity/confidence
  PRIMARY KEY(precluster_id, keyword_id),
  FOREIGN KEY(precluster_id) REFERENCES preclusters(id),
  FOREIGN KEY(keyword_id) REFERENCES keywords(id)
);

-- Manual clusters (later can replace preclusters or sit on top)
CREATE TABLE clusters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  is_locked INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- Manual membership (so you can move keywords freely)
CREATE TABLE cluster_members (
  cluster_id TEXT NOT NULL,
  keyword_id TEXT NOT NULL,
  PRIMARY KEY(cluster_id, keyword_id),
  FOREIGN KEY(cluster_id) REFERENCES clusters(id),
  FOREIGN KEY(keyword_id) REFERENCES keywords(id)
);

-- Undo/Redo event log
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,              -- MOVE_KW, MERGE_CLUSTER, SPLIT_CLUSTER, RENAME_CLUSTER, DELETE_KW...
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

## Demand-Standardisierung (dein Wunsch)

**Ziel:** eine Kennzahl `demand_monthly`, egal ob aus GSC oder Sistrix/Tool.

Default-Logik:

* Wenn GSC Daten im Zeitraum `N` Monate:

  * `gsc_monthly = impressions_total / N`
* Wenn Sistrix Volume vorhanden:

  * `sistrix_monthly = volume`
* Entscheidung:

  * Wenn Keyword aus **GSC** stammt → nutze `gsc_monthly` (realer Demand)
  * Wenn Keyword nur aus Upload stammt → nutze `sistrix_monthly`
  * Wenn beides da ist → optional `mixed = max(gsc_monthly, sistrix_monthly)` oder “prefer gsc”

Damit sind Cluster sortierbar nach **Summe demand_monthly**.

---

# 3) Pre-Clustering mit sehr hoher Qualität (ohne LLM)

Du willst “Wortnähe/Wortstamm” + “semantisch” – aber ohne LLM-Automatik. Das klappt am besten mit einem **Hybrid aus lexikalischen Features** (stems/char-ngrams) + **Graph-Clustering**. Das ist deterministisch, schnell, und überraschend gut.

## Schritt 0: Normalisierung (entscheidet 50% der Qualität)

Für jedes Keyword baust du:

* `kw_norm`: lowercase, trim, unicode normalize, punctuation/extra spaces raus, umlaut-normalize (ä→ae optional)
* Tokenisierung: split nach whitespace, bindestrich, slash
* Stopwords entfernen (de): “für”, “und”, “in”, “bei”, “mit”, …
* **Stemming/Lemmatization (de)**: SnowballStemmer oder spaCy Lemma
* Optional: “modifier detection” (kosten, preise, vergleich, beste, kaufen, nähe, termin, …)
* Optional: “geo detection” (Stadtteile, PLZ, “hamburg”, “elmshorn”…)

Ergebnis:

* `kw_sig`: sortierte stems (oder stems+modifier tags), z.B. `zahnimplantat kosten` → `zahnimplantat kost`

## Schritt 1: Feature-Vektoren (wortnah + robust gegen Schreibweisen)

Ich empfehle **zwei Vektoren** zu kombinieren:

1. **Char n-gram TF-IDF (3–5)** auf `kw_norm`

   * fängt Tippfehler, Wortvarianten, Bindestriche ab
2. **Token/Stem TF-IDF** auf `kw_sig`

   * sorgt für echte “Wortstamm”-Nähe

Optional (wenn du “semantischer” willst, immer noch ohne LLM):
3) **Sentence Embeddings** (z.B. multilingual MiniLM) auf `kw_norm`

* Das ist kein LLM-Agent, sondern ein fester Encoder → erhöht Synonym-/Paraphrase-Treffer deutlich.

**Pragmatischer Default (sehr gut für DE):**

* 70% char-ngrams + 30% stem-tokens
* (Embeddings später als “Boost”, wenn du willst)

## Schritt 2: kNN-Graph statt O(n²) Similarity

Für viele Keywords willst du nicht alle Paare vergleichen.

* Für jedes Keyword: finde **Top-k Nachbarn** (k=10..30) per Cosine Similarity
* Baue daraus einen Graph: Edge, wenn similarity > threshold

Defaults:

* `k = 20`
* `threshold = 0.55` (char+stem hybrid)

## Schritt 3: Clustering über Graph Communities (stabil & qualitativ)

Nimm Community Detection:

* **Leiden/Louvain** (sehr gut für Text-Graphen)
* Alternativ: HDBSCAN (gut, aber tuning-sensitiver)

**Warum Leiden/Louvain?**

* Liefert kompakte Themencluster
* Skaliert gut
* Sehr robust, wenn du vorher sauber normalisierst

## Schritt 4: Auto-Labeling der Preclusters (ohne AI)

Cluster-Label = Keyword, das am “zentralsten” ist und/oder höchstes Demand hat:

* Kandidaten: Top 10 Keywords nach demand
* Wähle das mit höchster **average similarity** zu anderen im Cluster (Medoid)
* Fallback: höchstes demand

In der Card zeigst du:

* Label
* total_demand
* Top 5 Keywords nach demand

## Schritt 5: Qualitäts-Checks (damit du wenig nacharbeiten musst)

Du berechnest pro Cluster:

* **Cohesion** = durchschnittliche Intra-Similarity (0..1)
* **Size** (#keywords)
* Flagge “Review nötig”, wenn:

  * cohesion < 0.35
  * size > 200 (zu breit)
  * oder Cluster enthält mehrere starke modifier-gruppen (z.B. “kosten”, “nähe”, “definition” gemischt)

### Regelbasiertes “Auto-Split” (super effektiv, ohne LLM)

Wenn ein Cluster groß oder low-cohesion ist:

* Split by **modifier group**:

  * informational: (definition, was ist, erklärung, wiki)
  * commercial: (kosten, preis, erfahrung, vergleich, test)
  * transactional/local: (termin, praxis, nähe, stadt)
* Split by **geo token**: City/PLZ separates Subcluster

Das reduziert Chaos brutal und fühlt sich im UI “magisch aber logisch” an.

---

# Konkrete Defaults, mit denen du starten kannst

* Normalisierung: de-stopwords + stemming (snowball) + char-ngrams 3–5
* Similarity: cosine
* kNN: k=20
* Edge threshold: 0.55
* Clustering: Leiden/Louvain
* Post-rules:

  * Split if size>150 OR cohesion<0.35 (by modifiers/geo)
  * Merge if two clusters have label similarity >0.75 AND shared neighbors high (optional)

---

# Was du heute damit bekommst

* Upload + GSC + Standardisierung → `demand_monthly`
* Preclusters automatisch, **ohne LLM**
* Cards View (3-Spalten) + Focus Auswahl + Sortierung nach total demand
* Workspace mit Keyword Drawer links + Drag&Drop in Cluster + Undo/Redo

Wenn du willst, mache ich dir als nächsten Schritt eine **genaue Interaction-Spec für React-Flow Nodes + dnd-kit** (welche IDs, payloads, Events) und eine **Preclustering-Pipeline als Pseudocode** (Backend Python/FastAPI), damit dein Coding-LLM es 1:1 implementieren kann.


