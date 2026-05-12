# Umsetzungsplan: "Empfohlene Sitemap"-Map als zweite React-Flow-Visualisierung

## 0. Executive Summary

Wir bauen eine zweite Graph-Visualisierung neben der Entity Map: einen Top-Down-Sitemap-Baum, der aus einer neuen LLM-Phase 6 (`recommended_sitemap`) gefüttert wird. Wir wiederverwenden die React-Flow-Infrastruktur (Sidebar, Hover/Click-Logik, Dagre-Layout, Orphan-Filter, MiniMap), bauen aber einen **eigenen Transformer**, einen **eigenen Node-Typ** und einen **eigenen Detail-Panel**. Der Tab-Switcher landet als Sub-Tab in `app/(dashboard)/nlp/page.tsx`. Schema-Erweiterung erfolgt rückwärtskompatibel (`recommended_sitemap?: ...` optional).

---

## 1. Phase-6-Prompt-Design

### 1.1 Was Phase 6 leisten muss

- Aus den Phase-1–5-Erkenntnissen einen **plausiblen Ziel-Site-Tree** für die analysierte Domain ableiten.
- Drei Status-Klassen pro empfohlener Page klar trennen.
- Eine **Parent-Child-Struktur über Slugs** aufbauen (keine separaten IDs — wir nutzen den Slug als Primary Key).
- Pro empfohlener Page sichtbar machen, *welche* Phase-3-Entities und Phase-5-Subtopics sie thematisch abdeckt.

### 1.2 Vorgeschlagener Prompt-Text (Phase 6 ergänzend zu `EXTRACTION_SYSTEM_PROMPT`)

Stilistisch im exakt selben Ton wie Phase 1–5 (deutsch, imperativ, mit Constraints und Beispielen):

```
# Phase 6 — Empfohlene Sitemap (Site-Tree für SEO Topical Authority)

Basierend auf Phase 1 (Domäne), Phase 3 (Entities) und Phase 5 (Pillar, Subtopics, Content Gaps): entwirf einen IDEALEN Site-Tree für die Domäne dieser Seite. Ziel: vollständige Themen-Abdeckung, klare Hub-Spoke-Struktur, jede Page hat einen eindeutigen Slug und eine H1.

Die Seitenstruktur hat genau EINE Pillar-Page (Wurzel, slug "/") und 2–4 Ebenen darunter. Höchstens 30 Pages gesamt.

Für JEDE empfohlene Page:
- slug: URL-Pfad ab Domain-Root, immer mit führendem "/". Pillar = "/". Sonst lowercase, kebab-case, sprachspezifisch ("/leistungen/implantologie", nicht "/services/implants" wenn die Seite deutsch ist). Slugs MÜSSEN eindeutig sein.
- parent_slug: Slug der Eltern-Page. NULL nur für die Pillar-Page. Jeder andere parent_slug MUSS einer in dieser Liste vorkommenden Slug sein.
- h1: vorgeschlagene Hauptüberschrift, 2–8 Wörter, in der Sprache des Textes.
- page_role: "pillar" | "cluster_overview" | "service_page" | "info_page" | "location_page" | "about_page" | "faq" | "blog_article"
- status: "covered_on_page" wenn die analysierte URL diese Page IST oder ihren Inhalt vollständig abdeckt; "content_gap" wenn ein Phase-5-content_gap diese Page motiviert ODER die Page klar nötig wäre und im Text nicht behandelt wird; "likely_exists_elsewhere" wenn diese Page typischerweise auf der Website existiert (z.B. /impressum, /team, /kontakt), aber im analysierten Text nicht behandelt wird.
- target_queries: 1–3 Suchanfragen, für die diese Page ranken soll. Leer für Pillar/Cluster-Overview wenn nicht eindeutig.
- covers_entities: Liste der canonical_names aus Phase 3, die diese Page abdecken sollte. Kann leer sein.
- covers_subtopics: Liste der Subtopics aus Phase 5 (subtopics oder content_gaps), die diese Page abdeckt. Kann leer sein.
- rationale: ein Satz, warum diese Page existieren sollte (1 Halbsatz, in der Sprache des Textes).

REGELN:
- Genau eine Page mit parent_slug = null (die Pillar).
- Die analysierte URL (extrahiert aus Phase 1: page_type + Inhalt) MUSS als EINE der Pages auftauchen mit status = "covered_on_page". Falls die analysierte Seite eine Child-Page ist und keine Pillar-Übersicht existiert, schlage die Pillar trotzdem als "content_gap" oder "likely_exists_elsewhere" vor.
- Keine zirkulären Eltern-Referenzen.
- Keine Self-References (page.parent_slug != page.slug).
- Slugs sind hypothetisch und KEIN Garant, dass die URL real existiert. Status "likely_exists_elsewhere" markiert genau diese Vermutung.
- Wenn der Text fast keinen verwertbaren SEO-Kontext liefert (z.B. nur ein Kontaktformular), gib eine minimale Sitemap mit 1–3 Pages aus statt zu halluzinieren.

Beispiele plausibler Trees (NICHT 1:1 übernehmen, nur Stil):
- Zahnarzt-Praxis: Pillar "/" → Cluster "/leistungen" → Service-Pages "/leistungen/implantologie", "/leistungen/prophylaxe", ... + Cluster "/praxis" → "/praxis/team", "/praxis/anfahrt" + "/notfall" + "/preise".
- SaaS-B2B: Pillar "/" → "/produkt" → Feature-Pages, + "/anwendungsfaelle/<branche>", + "/preise", + "/blog/<thema>".
```

Und im **Output-Format** wird das JSON-Objekt um folgenden Block erweitert (am Ende, nach `seo`):

```json
"recommended_sitemap": {
  "pages": [
    {
      "slug": "<string>",
      "parent_slug": "<string|null>",
      "h1": "<string>",
      "page_role": "<enum>",
      "status": "<covered_on_page|content_gap|likely_exists_elsewhere>",
      "target_queries": ["<string>"],
      "covers_entities": ["<canonical_name>"],
      "covers_subtopics": ["<string>"],
      "rationale": "<string>"
    }
  ]
}
```

### 1.3 Begründungen einzelner Design-Entscheidungen

- **Slug als Primary Key statt UUID/ID**: das Mockup zeigt Slugs prominent; ein zweiter Identifier wäre redundant und vergrößert den LLM-Output unnötig. Slug-Eindeutigkeit erzwingen wir clientseitig im Transformer (s.u.).
- **`parent_slug = null` für Wurzel** statt eigenem Boolean `is_pillar`: einfacher zu validieren ("exakt eine Page mit parent_slug = null").
- **`covers_entities` referenziert `canonical_name`**: konsistent mit Phase-3/Phase-4-Konvention (siehe `lib/entity-graph/transform.ts:60-66`).
- **`page_role` separat von `status`**: Rolle ist semantisch (was IST das für eine Page?), Status ist deskriptiv (haben wir das?). Die Mockup-Filter-Bar filtert auf Status, nicht Rolle.
- **`rationale` als kurzer Erklärtext**: macht den Detail-Panel reichhaltig, ohne dass die LLM einen ganzen Brief schreibt.

---

## 2. Schema-Erweiterung (TypeScript)

### 2.1 Neue Typen in `lib/nlp/types.ts`

```typescript
export type SitemapPageStatus =
  | "covered_on_page"
  | "content_gap"
  | "likely_exists_elsewhere";

export type SitemapPageRole =
  | "pillar"
  | "cluster_overview"
  | "service_page"
  | "info_page"
  | "location_page"
  | "about_page"
  | "faq"
  | "blog_article";

export type RecommendedPage = {
  slug: string;
  parent_slug: string | null;
  h1: string;
  page_role: SitemapPageRole | string;
  status: SitemapPageStatus | string;
  target_queries: string[];
  covers_entities: string[];
  covers_subtopics: string[];
  rationale: string;
};

export type RecommendedSitemap = {
  pages: RecommendedPage[];
};

export type ExtractionOutput = {
  meta: ExtractionMeta;
  schema: { categories: string[] };
  entities: ExtractionEntity[];
  relations: ExtractionRelation[];
  seo: ExtractionSeo;
  recommended_sitemap?: RecommendedSitemap;  // <-- NEU, optional
};
```

**Schlüsseldetail**: `recommended_sitemap` ist **optional**. Old responses aus dem Cache (falls jemals welche existieren) und alle Fehlerfälle, in denen die LLM keine Phase 6 liefert, sollen die UI nicht crashen.

`SitemapPageStatus`/`SitemapPageRole` sind als Union mit `string`-Fallback typisiert (gleiche Konvention wie `PageType` in der existierenden `types.ts`).

### 2.2 Was sich NICHT ändert

- `lib/entity-graph/types.ts` bleibt unverändert.
- `ExtractionEntity`, `ExtractionRelation`, `ExtractionSeo` bleiben unverändert.
- Die Google-NLP-Response-Struktur ist nicht betroffen.

---

## 3. Backwards-Compatibility

### 3.1 Server-Seite (`route.ts`)

- Bereits jetzt: das LLM-Output wird via `parseJsonFromText` geparst und unverändert als `extraction` durchgereicht. Da `recommended_sitemap` nur optional ergänzt wird, ist nichts zu ändern.
- Empfehlung: `ROUTE_VERSION` bumpen (z.B. `"2026-05-12.1-phase6-sitemap"`), damit der Client sofort sieht, ob ein deployter Backend-Stand Phase 6 erzeugt.

### 3.2 Client-Seite

- Im Sitemap-Tab: wenn `llmData.extraction.recommended_sitemap` fehlt oder `pages` leer ist, rendern wir einen klaren leeren Zustand:
  > "Diese Analyse enthält noch keine Sitemap-Empfehlung. Wahrscheinlich wurde die URL mit einem älteren Backend-Stand analysiert — bitte erneut analysieren."
- Solange `recommended_sitemap` fehlt: kein Crash, kein leeres Canvas, sondern obiger Hint plus ein "Erneut analysieren"-Button-Link auf den Hauptanalyse-Button.

### 3.3 Wenn LLM Phase 6 weglässt obwohl der Prompt sie verlangt

- Wir filtern keine Felder weg. Der Detail-Panel zeigt nur, was da ist (alle Sektionen sind `if (items?.length) return ... else null` — gleicher Stil wie `seo-insights-panel.tsx:72`).

---

## 4. Transformer-Design — `lib/sitemap-graph/transform.ts`

### 4.1 Verantwortung

Aus `RecommendedSitemap` einen `{ nodes, edges, orphans, stats }`-Output bauen, der direkt in React Flow gefüttert werden kann. Architektonisches Vorbild: `lib/entity-graph/transform.ts`.

### 4.2 Konkretes Interface

```typescript
export const PAGE_NODE_WIDTH = 220;
export const PAGE_NODE_HEIGHT = 120;

export type SitemapNodeData = {
  page: RecommendedPage;
  childCount: number;
  isRoot: boolean;
};

export type SitemapEdgeData = {
  // immer "is_child_of" — kein Predicate-Feld nötig, aber wir behalten den
  // Slot für späteren Ausbau (z.B. "weak_link" oder "cross_cluster_link").
  kind: "is_child_of";
};

export type SitemapStats = {
  total: number;
  covered: number;
  gap: number;
  likely: number;
  byRole: Record<string, number>;
  maxDepth: number;
};

export type SitemapGraphResult = {
  nodes: Node<SitemapNodeData>[];
  edges: Edge<SitemapEdgeData>[];
  orphans: RecommendedPage[];   // Pages deren parent_slug nicht auflösbar war
  stats: SitemapStats;
  // Layout-Richtung für späteren Toggle (TB/LR)
  direction: "TB" | "LR";
};

export type SitemapTransformOptions = {
  direction?: "TB" | "LR";
  visibleStatuses?: Set<SitemapPageStatus>;   // für Filter-Bar
};
```

### 4.3 Algorithmus

1. **Dedup & Sanitisierung**:
   - Trim alle Slugs, lowercase **nicht** erzwingen (LLM bestimmt Schreibung).
   - Bei doppelten Slugs: erste Vorkommnis gewinnt, Duplikate landen in `orphans`. Log für Debugging.

2. **Eindeutigen Wurzelknoten finden**:
   - Filtere Pages mit `parent_slug === null`. Wenn 0 → komplett leerer Tree, gib leeres Result mit Hinweis zurück (UI rendert Empty-State).
   - Wenn >1 → behalte die *erste* als Pillar, drop die anderen *nicht*, sondern reparent sie auf die erste Pillar (gemilderter Fallback, weil die LLM bei seltenen Edge-Cases zwei Wurzeln liefern kann). Logge das.
   - Wenn exakt 1 → ideal.

3. **Slug-Resolver bauen** (analog `buildNameResolver` in `transform.ts:59-66`):
   ```typescript
   const slugMap = new Map<string, RecommendedPage>();
   for (const p of pages) slugMap.set(p.slug.trim(), p);
   ```

4. **Orphan-Filter**:
   - Iteriere alle nicht-Pillar-Pages. Wenn `parent_slug` weder `null` ist noch in `slugMap` existiert → in `orphans` schieben.
   - Wenn `parent_slug === page.slug` (Self-Reference) → in `orphans` schieben.

5. **Zyklus-Check**:
   - Für jede Page: traversiere Eltern-Kette via `parent_slug`. Falls dabei der gleiche Slug zweimal vorkommt → Zyklus, Page raus → `orphans`.
   - Maximum-Tiefe-Cap: 10 (Schutz vor Eskalation).

6. **Edge-Erzeugung**: Für jede gültige Page mit `parent_slug !== null` → eine Edge `{ id, source: parent_slug, target: child.slug, kind: "is_child_of" }`.

7. **Dagre-Layout**:
   ```typescript
   const g = new dagre.graphlib.Graph();
   g.setGraph({
     rankdir: options.direction ?? "TB",   // Mockup zeigt TB als Default
     nodesep: 40,
     ranksep: 90,
     marginx: 24,
     marginy: 24,
     align: "UL"
   });
   ```
   Begründung Konstanten: bei TB sind Knoten breit (220) und niedrig (120), Geschwister-Pages liegen horizontal nebeneinander → `nodesep` kann kleiner als bei Entity Map (60→40), `ranksep` größer für klare vertikale Trennung der Levels.

8. **Stats-Berechnung**:
   - `total = pages.length`
   - `covered = pages.filter(p => p.status === "covered_on_page").length`
   - `gap`, `likely` analog
   - `byRole`: Map nach `page_role`
   - `maxDepth`: tiefste Eltern-Kette in der gefilterten Liste

9. **Filter anwenden** (falls `visibleStatuses` gesetzt):
   - Nicht in Transformer — der Transformer liefert *immer den vollen Baum*. Filterung passiert clientseitig auf der Node-/Edge-Liste in der UI-Komponente (Hide-Mechanik wie `styledNodes` mit `opacity: 0.35` in `entity-map.tsx:118-129`). Begründung: keine erneute Berechnung des Layouts beim Toggle, smoothere UX.

### 4.4 Helper-Export

Analog `relationsForEntity` exportieren wir einen Helper:

```typescript
export function findChildPages(slug: string, pages: RecommendedPage[]): RecommendedPage[];
export function findParentPage(slug: string, pages: RecommendedPage[]): RecommendedPage | null;
export function findPageBySlug(slug: string, pages: RecommendedPage[]): RecommendedPage | null;
```

Der Detail-Panel nutzt sie zum Anzeigen von Parent/Children.

---

## 5. UI-Komponenten-Plan

### 5.1 SitemapMap vs. Generalisierung der EntityMap

**Empfehlung: eigene `SitemapMap`-Komponente** in `components/sitemap-graph/sitemap-map.tsx`.

Trade-offs:

| | Generalisierung der EntityMap | Eigene SitemapMap |
|---|---|---|
| Code-Duplikation | Niedrig | Mittel (~30% Duplikation für React-Flow-Wrapper, Hover-Logik) |
| Lesbarkeit | Beide Use-Cases müssen sich im Typ einigen → Generics-Höhle | Jede Komponente ist single-purpose |
| Risiko bei Änderungen | Entity-Map-Änderung kann Sitemap brechen | Isoliert |
| Custom Overlays (Stats, Filter-Bar) | Müssten via slots reingereicht werden | Direkt in der Komponente |
| Mockup-Treue | Eingeschränkt — abweichende Overlays/Filter passen schlecht in Slots | 1:1 möglich |

Die Entity Map hat keine Filter-Bar, kein Stats-Overlay, kein Status-Konzept. Die Generalisierung würde die EntityMap-Props auf 10+ Optional-Felder aufblähen. Lieber zwei fokussierte Komponenten. Den **Sidebar-Mechanismus** (`EntitySidebar` in `components/entity-graph/entity-sidebar.tsx`) extrahieren wir aber zur Wiederverwendung — siehe 5.4.

### 5.2 PageCardNode (eigener Custom-Node)

Neue Datei: `components/sitemap-graph/page-card-node.tsx`. Vorbild: `entity-card-node.tsx`. Konkrete Anforderungen aus dem Mockup:

- **Stripe oben** (4px hoch, farbig nach Status): Pillar = Gradient amber→yellow; covered = solid emerald; gap = solid amber; likely = solid zinc.
- **Border-Style** abhängig vom Status: Pillar `border-amber-500 ring-amber-500/15`, gap `border-amber-500 border-dashed`, covered `border-emerald-500`, likely `border-zinc-300`. (CSS-Klassen aus dem Mockup `rf-node-pillar`, `rf-node-gap`, `rf-node-covered`, `rf-node-likely`.)
- **Pillar-Badge** oben links (Star-Icon + Label "Pillar Page"), analog Entity-Card.
- **Slug-Code-Tag**: `<code className="font-mono text-[11px] text-zinc-500">{slug}</code>`.
- **H1**: `<div className="text-sm font-bold">` (für Pillar) bzw. `text-xs font-semibold` für Cluster/Service-Pages.
- **Status-Chip** unten: "auf dieser Seite" (emerald), "content gap" (amber), "likely exists" (zinc).
- **Optional Metadaten-Zeile**: "X entities · target: 'foo'" nur wenn `target_queries[0]` und `covers_entities.length` sinnvoll.
- **React-Flow-Handles**: bei `TB`-Layout: `Top` als Target, `Bottom` als Source. Bei `LR`: `Left`/`Right` wie bei Entity-Card.

Pseudo-Signatur:

```typescript
function PageCardNodeInner({ data, selected }: NodeProps<SitemapNodeData>) {
  const { page, isRoot, childCount } = data;
  // ... Status-→-Tailwind-Class-Mapping, Handle-Position abhängig vom rankdir
}
```

Die `rankdir`-Info muss in die Node-Data hineingereicht werden (damit Handle-Positions korrekt sind), oder wir setzen die Handles für *beide* Richtungen sichtbar — Entscheidung: einfacher, beide setzen und CSS-Display über data-attribute schalten. Da das Layout-Toggle (TB/LR) im Initialwurf wahrscheinlich auf TB-only beschränkt bleibt (offene Frage 11.1), nehmen wir hartkodiert `Top`/`Bottom`.

### 5.3 SitemapDetailPanel

Neue Datei: `components/nlp/sitemap-detail-panel.tsx`. Aufgabe: rechts in der Sidebar bei Klick auf eine Page-Node die Detail-Informationen anzeigen. Inhalt nach Mockup:

```
- Header-Block (color-codiert nach Status):
    code(slug) · H1 · Status-Chip
- "Target Queries" Block (chips, schwarz/grau)
- "deckt ab (Entities)" Block (chips, lila Hintergrund + Klick öffnet ggf. nichts oder bringt User in den EntityMap-Tab — siehe offene Frage 11.4)
- "deckt ab (Subtopics)" Block
- "Begründung / Rationale" Block (kursiv, schmalere Schrift)
- "Eltern-Page" und "Child-Pages" Block (Listen mit Click-Handlern, die selectedSlug umsetzen — analog RelationRow in entity-detail-panel.tsx:103-137)
- "Evidence aus Phase 3" Block: zeige die Phase-3-Definition-Texte oder Phase-4-Evidences derjenigen Entities, die die Page abdeckt. Optional und nur wenn vorhanden.
```

Stil: gleiche `Block`/`ChipBlock`-Pattern wie `entity-detail-panel.tsx`. Wir importieren die Helper aus dem neuen Transformer.

### 5.4 SidebarShell wiederverwenden

Empfehlung: **direkt aus `components/entity-graph/entity-sidebar` importieren**. Die Komponente ist schon generisch parametrisiert mit `collapsedLabel`, `headerTitle`, `body` — Umbenennung/Refactor lohnt sich nicht (YAGNI).

### 5.5 Filter-Bar (eigene Komponente)

Neue Datei: `components/sitemap-graph/sitemap-filter-bar.tsx`. Inhalt:

- 4 Toggle-Buttons (Pillar/covered/gap/likely_exists_elsewhere), die jeweils einen Status aus einem `Set<SitemapPageStatus>` togglen.
- "Top-Down" / "Left-Right"-Buttons (visuell vorhanden, im Initialwurf disabled außer Top-Down — siehe offene Frage 11.1).
- "Als JSON kopieren"-Button: `navigator.clipboard.writeText(JSON.stringify(recommended_sitemap.pages, null, 2))` + Toast-Feedback.

State: lebt in der `SitemapMap`-Komponente, wird per Props an die Filter-Bar gereicht.

### 5.6 Stats-Overlay (absolute pos top-left)

Direkt in `sitemap-map.tsx` inline gerendert als `<div className="absolute left-3 top-3 ...">` — exakt wie der `orphans`-Hint in `entity-map.tsx:180-185`. Ein eigener Komponentenfile lohnt sich nicht (~30 Zeilen JSX). Inhalte aus `SitemapStats`.

### 5.7 MiniMap

Wir nutzen React-Flows eingebaute `<MiniMap>` (wie `entity-map.tsx:171-177`) mit `nodeColor`-Callback, der die Status-Farbe ausgibt (amber/emerald/zinc).

---

## 6. Wo lebt der Tab-Switcher?

### 6.1 Empfehlung

**In `app/(dashboard)/nlp/page.tsx` als Sub-Tabs im LLM-Bereich**, NICHT als eigene Sub-Route.

### 6.2 Begründung

- Der gesamte LLM-Ergebnis-Block wird heute mit `mode === "llm" && llmData?.extraction` konditional gerendert. Es wäre semantisch sauber, denselben State auch für die Tab-Auswahl zu nutzen — der User analysiert einmal eine URL und schaltet dann lokal zwischen "Page Profile" / "Entity Map" / "Sitemap Map" hin und her.
- Eine eigene Sub-Route (`/nlp/sitemap`) hätte keinen eigenen State (die Analyse ist ephemer, kein DB-Backing siehe `CLAUDE.md:85-86`) → die Sub-Route müsste den State weiterhin in einem Context speichern oder die Analyse erneut auslösen. Kein Mehrwert, mehr Komplexität.

### 6.3 Umsetzungsdetail

Aktuell rendert die Seite den LLM-Bereich als zwei SectionCards: "Page Profile" + "Entity Map". Wir bauen das um zu einem Tab-Switcher:

```typescript
type LlmView = "profile" | "entities" | "sitemap";
const [llmView, setLlmView] = useState<LlmView>("profile");

// In dem Block, der heute Page Profile + EntityMap rendert:
//   <TabsBar value={llmView} onChange={setLlmView} ... />
//   {llmView === "profile" && <SectionCard><PageProfile .../></SectionCard>}
//   {llmView === "entities" && <SectionCard><EntityMap .../></SectionCard>}
//   {llmView === "sitemap" && <SectionCard><SitemapMap .../></SectionCard>}
```

Für `TabsBar` benutzen wir entweder das vorhandene shadcn `Tabs` aus `components/ui/` (üblich im Repo, lt. CLAUDE.md:90), oder bauen einen kleinen Inline-Toggle analog `ModeSwitch`. **Empfehlung**: shadcn-Tabs wenn verfügbar (`components/ui/tabs.tsx`), sonst Inline.

### 6.4 Wann ist welcher Tab sichtbar?

- "Page Profile" — immer.
- "Entity Map" — immer (kann leer sein wenn keine Entities, das ist heute schon der Fall).
- "Sitemap Map" — immer als Tab sichtbar; bei fehlendem `recommended_sitemap` zeigt der Tab-Inhalt den Empty-State (Section 3.2).

---

## 7. Edge-Cases & Risiken

| # | Szenario | Handling |
|---|---|---|
| 1 | LLM liefert kein `recommended_sitemap` | Empty-State im Sitemap-Tab; Tab bleibt sichtbar, kein Crash. |
| 2 | `parent_slug` zeigt auf nicht-existierende Page | Page geht in `orphans`-Liste; Hint-Banner oben links wie bei Entity Map. |
| 3 | Tiefer Baum (4+ Ebenen) | Dagre handhabt es; Canvas ist scrollbar; MiniMap hilft bei Übersicht. Cap im Transformer bei 10 Ebenen. |
| 4 | Sehr breite Bäume (>15 Children unter einem Parent) | Wir lassen Dagre auto-layouten; `nodesep: 40` ergibt bei 15 Kindern ~3900px Breite, scrollbar auf dem Canvas. Falls UX schlecht: in V2 ein Cluster-Collapsing-Mechanismus (out of scope V1). |
| 5 | Slugs sind LLM-Halluzination | Visuelles Disclaimer im Page-Profile-Tab UND als persistenter kleiner Hint unter dem Stats-Overlay: "Slugs sind Empfehlungen — Verifikation via Crawl folgt in einer späteren Version." |
| 6 | Self-Reference (`parent_slug === slug`) | Transformer filtert in `orphans`. |
| 7 | Zirkuläre Eltern-Referenzen | Tiefen-Limit-Traversal mit Set-Check → Pages mit Zyklus in `orphans`. |
| 8 | Mehrere Pages mit `parent_slug === null` | Erste gewinnt als Pillar, restliche reparenten auf sie. |
| 9 | LLM gibt `covers_entities` mit Namen die nicht in Phase 3 sind | Detail-Panel zeigt die Strings als Chips; kein Cross-Link in die Entity-Map (graceful). |
| 10 | Doppelte Slugs | Erste gewinnt, Duplikat in `orphans` mit Reason="duplicate_slug". |
| 11 | Sehr kleiner Tree (nur Pillar) | Renderbar; Stats-Overlay zeigt 1/0/0/0. Kein Edge-Case-Crash. |
| 12 | `covers_subtopics` referenziert subtopic-Strings, die nicht in `seo.subtopics` sind | Wir matchen NICHT strikt — wir zeigen den String einfach an. |
| 13 | Status-Filter blendet ALLES aus | Stats-Overlay bleibt unverändert (gesamt-Zahlen), Canvas zeigt Empty-State-Hinweis "Alle Status ausgefiltert"; Filter wieder togglen reaktiviert. |
| 14 | Filter blendet nur die Pillar aus → Children werden Waisen visuell | Wir blenden Pillar-Edges mit aus, Children rutschen visuell hoch. Akzeptabel — Filter ist Interaktion, kein Layout-Trigger. |

---

## 8. Test-Strategie (manuell, kein Test-Runner — siehe CLAUDE.md:19)

### 8.1 Validierung pre-implementation

- `npx tsc --noEmit` nach jeder Schicht.
- `npm run lint` vor Commit.

### 8.2 URL-Test-Matrix

Drei URLs mit unterschiedlichen Charakteristika durchspielen:

1. **Spoke/Child-Seite einer KMU-Website**, z.B. `https://www.sabah-dentalmedizin.de/` (die Mockup-Referenz). Erwartung: Pillar = "/" als content_gap oder likely_exists_elsewhere; mehrere Cluster (/leistungen, /praxis); Mix aller drei Statuses.
2. **Pillar/Übersichtsseite** eines Themas, z.B. `https://en.wikipedia.org/wiki/Photosynthesis`. Erwartung: covered_on_page = die analysierte URL selbst, viele content_gaps für Aspekte (Lichtreaktion etc.), wenig likely_exists_elsewhere.
3. **Sehr kurze/dünne Seite**, z.B. ein Kontakt-/Landing-Page. Erwartung: minimaler Tree (1–3 Pages), kein Crash bei `pages.length === 1`.

### 8.3 Sub-Szenarien pro URL

- Hover auf Pillar-Node → alle Edges highlighted? Children opacity 1, Rest 0.35?
- Klick auf eine Service-Page → Detail-Panel zeigt Target Queries, Entities, Rationale, Evidence?
- Filter "nur content_gap": Pillar und covered/likely werden ausgeblendet?
- "Als JSON kopieren": Clipboard enthält valides JSON-Array? `JSON.parse` succeed?
- Tab-Wechsel "Entity Map" → "Sitemap Map" → "Entity Map" → selectedId reset oder beibehalten? (Spec: jedem Tab seinen eigenen selectedId — beim Wechsel des Tabs *nicht* automatisch resetten, aber Detail-Panels sind getrennt.)
- Re-Analyse einer neuen URL → vorheriger Tree wird ersetzt? (`useEffect` mit `setNodes(initialNodes)` analog `entity-map.tsx:69-74`.)

### 8.4 Validierung der LLM-Outputs

- Bei der ersten realen Analyse: Console-Log der `recommended_sitemap` ansehen, manuell auf:
  - Genau eine Page mit `parent_slug === null`?
  - Alle anderen `parent_slug` zeigen auf existierende Slugs?
  - Status-Werte aus dem Enum?
  - Slug-Format konsistent (kebab-case, sprachgleich)?

---

## 9. Reihenfolge der Implementierung (inkrementell)

Jeder Schritt ist für sich lauffähig und endet idealerweise in einem `npx tsc --noEmit` + Lint-Green-State.

### Schritt 1 — Schema-Erweiterung (Backend-only, kein UI-Effekt)
- `lib/nlp/types.ts`: `SitemapPageStatus`, `SitemapPageRole`, `RecommendedPage`, `RecommendedSitemap`, `recommended_sitemap?` an `ExtractionOutput`.
- **Test**: TS compile.
- **Liefert**: Typen stehen, alles andere kompiliert weiter.

### Schritt 2 — Prompt-Erweiterung
- `lib/nlp/extraction-prompt.ts`: Phase 6 einfügen (zwischen Phase 5 und Output-Format). Output-Format-JSON um `recommended_sitemap` ergänzen. Intro-Satz "Arbeite die folgenden 5 Phasen" → "6 Phasen" anpassen.
- `app/api/nlp/llm/route.ts`: `ROUTE_VERSION` bumpen.
- **Test**: einmal eine reale URL analysieren, in Browser-DevTools die Response inspecten → `extraction.recommended_sitemap` ist da, Pages-Array nicht leer, Statuses sehen plausibel aus.
- **Liefert**: Daten fließen end-to-end (ohne UI), die alten Tabs funktionieren weiter.

### Schritt 3 — Transformer
- `lib/sitemap-graph/transform.ts` neu anlegen mit allem aus 4.2/4.3 plus Helper-Funktionen aus 4.4.
- **Test**: TS compile.
- **Liefert**: Funktion ist da, in der UI noch ungenutzt.

### Schritt 4 — PageCardNode
- `components/sitemap-graph/page-card-node.tsx` neu anlegen.
- **Test**: TS compile. Nicht rendert, kein Effekt.
- **Liefert**: Custom-Node ist da, in der Komponente noch ungenutzt.

### Schritt 5 — SitemapMap (mit MiniMap, Stats-Overlay, ohne Filter-Bar)
- `components/sitemap-graph/sitemap-map.tsx` neu anlegen — Grundgerüst: `ReactFlowProvider`, `useNodesState`, `useEdgesState`, Hover/Click-Logik *kopiert* aus `entity-map.tsx:65-130` (anstatt extrahiert), Sidebar via `EntitySidebar`, Stats-Overlay inline.
- Default-Sidebar-Body: Empty-Hint "Klick auf eine Page für Details".
- Detail-Panel als Inline-Platzhalter (noch nicht in eigene Datei) — z.B. einfach `pre`-Block mit `JSON.stringify(page)`.
- **Test**: Manuell. Komponente wird im Tab gerendert (Schritt 7), aber noch ohne perfekten Detail-Panel.
- **Liefert**: Visualisierung funktioniert, Klick zeigt rudimentäre Page-JSON-Vorschau.

### Schritt 6 — SitemapDetailPanel & Filter-Bar
- `components/nlp/sitemap-detail-panel.tsx` mit allen Blocks aus 5.3.
- `components/sitemap-graph/sitemap-filter-bar.tsx` mit Status-Toggles, Layout-Toggles (TB enabled, LR disabled), "Als JSON kopieren".
- `sitemap-map.tsx` einbinden: Filter-Bar oberhalb des Canvas, Detail-Panel im Sidebar-Body.
- **Test**: Manuell.
- **Liefert**: Vollständiges Mockup-Verhalten.

### Schritt 7 — Tab-Switcher in der NLP-Page
- `app/(dashboard)/nlp/page.tsx`: `llmView` State + Tabs-Komponente; Sitemap-Tab importiert `SitemapMap`.
- Empty-State im Sitemap-Tab falls `recommended_sitemap` fehlt.
- **Test**: alle drei URLs aus 8.2 durchspielen.
- **Liefert**: Feature ist nutzbar, Plan abgeschlossen.

### Schritt 8 — Polish & Doku
- Hint-Banner "Slugs sind Empfehlungen" im Page-Profile-Tab oder als Footer-Disclaimer auf der Sitemap-Map.
- Manuell `npx tsc --noEmit` + `npm run lint`.
- `mockups/nlp-views/...` nicht ändern (Quellmaterial bleibt).

---

## 10. Was wir explizit NICHT machen (Scope-Disziplin)

- **Keine Persistierung**: Das NLP-Modul ist ephemer. Keine neuen Prisma-Models, kein Cache (lt. CLAUDE.md:85-86 + 96).
- **Keine Crawl-Verifikation der `likely_exists_elsewhere`-Status**: das ist V2. Im V1 ist Status eine reine LLM-Vermutung.
- **Kein Multi-URL/Cross-Page-Mode**: jede Analyse ist single-URL.
- **Keine Editierbarkeit der Sitemap durch User**: read-only Visualisierung. Drag-positions sind erlaubt (kommt durch `nodesDraggable=true` gratis), aber nicht persistent.
- **Kein LR-Toggle im Initialwurf**: Button im UI vorhanden aber disabled. TB-only.
- **Keine Animation der Edges** über das React-Flow-Default hinaus.
- **Kein eigenes Routing** `/nlp/sitemap` — die View lebt in derselben Page.
- **Keine Sub-Status-Filter** (z.B. nur "service_page-Gaps") — nur die 4 Mockup-Toggles.
- **Kein automatischer Cross-Tab-Sprung** "Klick auf Entity-Chip im Sitemap-Detail → Sprung in Entity-Map mit selectedId". Out of scope V1 (offene Frage 11.4).

---

## 11. Offene Fragen für den User

| # | Frage | Default falls keine Antwort |
|---|---|---|
| 11.1 | **LR-Toggle aktivieren?** Das Mockup zeigt ihn disabled. Implementieren wir ihn im V1 (1h Aufwand, dagre kann es), oder lassen wir den Button visuell vorhanden aber disabled? | Disabled lassen (Mockup-Treue). |
| 11.2 | **Exakte Feld-Namen verbindlich?** Aktuell vorgeschlagen: `parent_slug`, `page_role`, `covers_entities`, `covers_subtopics`, `rationale`. Alternativen wären `parentSlug` (camelCase) — passt aber nicht zu den existierenden Phase-1–5-Feldnamen, die snake_case sind (`canonical_name`, `pillar_topic`). Bestätigung? | snake_case wie vorgeschlagen. |
| 11.3 | **Tab-Bar-Styling**: shadcn-Tabs oder Inline-Toggle? Tabs sind UI-typischer für drei Views; ModeSwitch wäre konsistent zum Google/LLM-Toggle. | shadcn-Tabs für die drei LLM-Sub-Views; ModeSwitch bleibt für Google/LLM. |
| 11.4 | **Cross-Tab-Linking**: Soll ein Klick auf einen Entity-Chip im Sitemap-Detail-Panel direkt in den Entity-Map-Tab springen und dort selectedEntity setzen? Schöne UX, aber neuer Cross-Tab-State nötig (Context oder Lift-State-up). | Out of scope V1 — Entity-Chip ist nur visuell, nicht klickbar. V2-Item. |
| 11.5 | **Filter-Bar-Counts**: Im Mockup zeigen die Filter-Buttons Zahlen ("content_gap (10)"). Wir zeigen die *Gesamt*-Zahl pro Status (nicht "von wievielen sichtbar"). Bestätigt? | Ja — Gesamt-Counts pro Status, statisch nach Initial-Transform. |
| 11.6 | **JSON-Export-Format**: Nur `pages[]` oder das ganze `recommended_sitemap`-Objekt? Mit Pretty-Print? | `pages`-Array, pretty-printed mit `JSON.stringify(p, null, 2)`. |
| 11.7 | **Backward-Compat-Stärke**: Falls die LLM bei der ersten realen Anfrage *gar keine* Phase 6 liefert (z.B. wegen Token-Limit-Cap), zeigen wir den leeren State **oder** retryen wir mit nur Phase 6 als zweite Anfrage? | Empty-State zeigen, kein automatischer Retry — User kann manuell erneut auf "Semantik extrahieren" klicken. (Retry-Logik wäre V2.) |
| 11.8 | **`coverage_subtopics` vs. `coverage_entities` Anzeige-Priorität**: Im Mockup-Detail-Panel zeigen wir "deckt ab (Entities)" als Chips. Soll Subtopics auch als Chips daneben oder darunter? | Beides als Chips, zwei separate `ChipBlock`s untereinander (Entities zuerst, dann Subtopics). |
| 11.9 | **MaxDepth-Cap im Transformer**: Hard-Cap bei 10 Ebenen (Schutz vor Zyklen). Höher/niedriger? | 10 ist konservativ — real wird kein Tree tiefer als 4. |
| 11.10 | **Filter-Default-State**: Alle Statuses initial sichtbar? Oder Pillar ausgeblendet (weil er den Tree dominiert)? | Alle initial sichtbar. |

---

## 12. Architektur-Überblick (Datei-Topologie nach Umsetzung)

```
lib/
  nlp/
    extraction-prompt.ts        # CHANGED: + Phase 6
    types.ts                    # CHANGED: + Sitemap-Typen
    extract.ts                  # unchanged
  entity-graph/
    transform.ts                # unchanged
    types.ts                    # unchanged
  sitemap-graph/                # NEW dir
    transform.ts                # NEW

app/api/nlp/llm/route.ts        # CHANGED: ROUTE_VERSION bump only

app/(dashboard)/nlp/page.tsx    # CHANGED: + Tab-Switcher

components/
  entity-graph/
    entity-map.tsx              # unchanged
    entity-card-node.tsx        # unchanged
    entity-sidebar.tsx          # unchanged (importiert auch von SitemapMap)
  nlp/
    page-profile.tsx            # unchanged
    seo-insights-panel.tsx      # unchanged
    entity-detail-panel.tsx     # unchanged
    sitemap-detail-panel.tsx    # NEW
  sitemap-graph/                # NEW dir
    sitemap-map.tsx             # NEW
    page-card-node.tsx          # NEW
    sitemap-filter-bar.tsx      # NEW
```
