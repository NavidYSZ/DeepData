# NLP Tool

Two-mode SEO-Content-Analyzer. Eine URL einwerfen → Body-Content extrahieren → entweder klassische Google-Cloud-NLP-Analyse oder LLM-basierte 5-Phasen-Semantik-Extraktion (DeepSeek v4 Pro) mit React-Flow Entity-Map + Page-Profile.

## Modi

Toggle-Switch im Page-Header der `/nlp` Seite:

- **Google** (Default): Sentiment, Entities, Categories über Google Cloud Natural Language API. Wie vorher.
- **LLM** (DeepSeek v4 Pro): Liefert ein strukturiertes JSON mit `meta`, `entities`, `relations`, `seo` und rendert daraus eine interaktive Entity-Map + Page-Profile-Karte.

Mode-State liegt im Component-State, kein Persistenz.

## Routes

| Endpoint | Verwendung |
|---|---|
| `POST /api/nlp` | Google NLP, Body: `{ url, features: { sentiment, entities, entitySentiment, classify } }` |
| `POST /api/nlp/llm` | DeepSeek, Body: `{ url }`, Response enthält `extraction` (siehe `lib/nlp/types.ts`) plus Diagnose-Felder (`_routeVersion`, `firstChunkMs`, `usage`, `finishReason`) |

Beide Routes nutzen denselben Body-Content-Extractor in `lib/nlp/extract.ts`: Timeout 15s, max 4 MB HTML, `<article>` → `<main>` → `<body>` Fallback, mit Cleanup von `<script>`, `<style>`, `<nav>`, Cookie-Bannern etc.

## File-Layout

```
app/(dashboard)/nlp/page.tsx          UI: Mode-Switch, Inputs, Result-Rendering
app/api/nlp/route.ts                   Google-NLP-Endpoint
app/api/nlp/llm/route.ts               DeepSeek-Endpoint (direkter fetch, streaming)
lib/nlp/extract.ts                     URL → Plaintext Extraktor (shared)
lib/nlp/extraction-prompt.ts           5-Phasen-System-Prompt (deutsch)
lib/nlp/types.ts                       ExtractionOutput-Typen
lib/nlp/entity-map.ts                  Transform entities+relations → React-Flow Nodes+Edges (dagre LR)
components/nlp/entity-map.tsx          React-Flow Container, Hover-Highlight, MiniMap
components/nlp/entity-card-node.tsx    Custom Node (Card mit Category-Header, Pillar-Badge)
components/nlp/entity-sidebar.tsx      Hover-Expand Sidebar (Entity-Detail oder SEO-Insights)
components/nlp/page-profile.tsx        Hub-vs-Child-Page Karte oberhalb der Map
```

## DeepSeek-Konfiguration

Environment-Variablen (in Coolify-Env oder `.env.local`):

| Var | Default | Zweck |
|---|---|---|
| `DEEPSEEK_API_KEY` | (required) | Auth-Token |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OHNE `/v1` — SDK ruft `${baseURL}/chat/completions` |
| `DEEPSEEK_MODEL` | `deepseek-v4-pro` | Alternativ: `deepseek-v4-flash` (schneller, aber weniger akkurat) |
| `DEEPSEEK_DISABLE_THINKING` | `true` | Deaktiviert Reasoning-Mode (`thinking: { type: "disabled" }`). Auf `false` setzen falls man Thinking-Output braucht |

### Warum direkter `fetch` statt `@ai-sdk/openai`

`@ai-sdk/openai` v3 routet die callable-Form (`provider(modelId)`) an die neue OpenAI **Responses API** (`/responses`), die DeepSeek nicht implementiert — gibt 404. `.chat(modelId)` würde theoretisch `/chat/completions` benutzen, aber die Indirection macht Debugging hart (Request-URL, Body, Headers sind nicht direkt im Code sichtbar).

Daher: handgeschriebener `fetch` an `${baseURL}/chat/completions`. Body und Headers exakt wie in DeepSeek-Docs. Server-Logging des tatsächlichen Endpoints. Errors enthalten `endpoint`, `statusCode`, `responseBody`, `_routeVersion` und (bei Stream-Aborts) `firstChunkMs` plus `partial`-Buffer.

### Warum Streaming + Thinking-Disabled

- `deepseek-v4-pro` ist per Default im Thinking-Mode. Für unseren komplexen 5-Phasen-JSON-Output produziert das Modell zig-Tausende Reasoning-Tokens → Latenz von 3-5+ Minuten. Mit `thinking: { type: "disabled" }` antwortet das Modell direkt: 15-30s typisch.
- Streaming (`stream: true`, SSE) wird serverseitig gelesen und akkumuliert; **wir streamen nicht zum Client weiter** (UI bleibt synchron-Spinner). Vorteil: Time-To-First-Chunk wird gemessen und im Error-Fall mitgegeben → man sieht, ob DeepSeek queued (kein erster Chunk) oder bloß langsam generiert.
- `response_format: { type: "json_object" }` zwingt DeepSeek zu validem JSON ohne Markdown-Fences.

### `_routeVersion` Marker

In jeder Antwort steckt `_routeVersion: "<datum>-<beschreibung>"`. Wird in der Client-Error-Pille mit angezeigt. Bei Deploy-Problemen sieht man sofort, ob neuer Code läuft oder noch die alte Version aktiv ist.

## 5-Phasen-Prompt

Vollständig in `lib/nlp/extraction-prompt.ts`. Zusammenfassung:

1. **Domänen-Erkennung**: Sehr spezifischer Domain-String, Page-Type, Intent, Audience.
2. **Adaptive Kategorien**: 6-12 domänenspezifische Entity-Kategorien (KEIN generisches "Entity"/"Concept").
3. **Entity-Extraktion**: Pro Kategorie alle Entities mit `name`, `canonical_name`, `mentions`, `definition_in_text`, `semantic_role` (`pillar` | `supporting` | `peripheral`).
4. **Relations**: `subject`-`predicate`-`object`-`evidence` Tripel. Predicate als snake_case in Textsprache. Subject/Object müssen als Entity existieren.
5. **SEO Topic Signals**: `pillar_topic`, `subtopics`, `semantic_field`, `coverage_depth`, `content_gaps`, `related_clusters`, `competing_topics`, `target_queries`.

Output strikt JSON-only (durch `response_format: { type: "json_object" }` erzwungen).

## Entity-Map

### Transform (`lib/nlp/entity-map.ts`)

1. **Name-Resolver**: Map von `name.toLowerCase()` UND `canonical_name.toLowerCase()` → `canonical_name`. Relations können beide Formen referenzieren, dieser Lookup vereinheitlicht.
2. **Orphan-Filter**: Relations, deren Subject oder Object nicht in `entities[]` zu finden ist, werden geloggt und übersprungen (statt zu crashen). Count wird in der UI als Badge oben links angezeigt.
3. **Stabile Category-Palette**: 12 Farben (`CATEGORY_PALETTE`), Index-basiert pro Category zugewiesen. Gleiche Category → gleiche Farbe bei Re-Renders.
4. **Dagre LR Layout**: `nodesep: 60`, `ranksep: 120`, fixe Node-Größen 240×100. (Frühere Versuche mit per-node `rank: "min"` Hints oder Pillar-spezifischen Größen haben das Layout inkonsistent gemacht — verworfen.)
5. **Edges**: `smoothstep`, Predicate humanisiert (Underscores → Spaces). `evidence` als `data` für Sidebar.

### Custom Node (`entity-card-node.tsx`)

Card mit:
- Category-getöntem Header (12er-Palette, 22% Alpha als Background)
- `canonical_name` als Titel (line-clamp 2)
- Mention-Count + total Link-Count (Incoming + Outgoing)
- **Pillar-Entities**: Amber Border + Ring + "PILLAR"-Badge oben links
- **Peripheral-Entities**: 70% Opacity (visuell zurückgenommen)
- Source-/Target-Handles an Right/Left für Edges

### Hover-Interaktion (`entity-map.tsx`)

- Hover auf Node → Incident Edges in Primary-Color, andere auf 20% Opacity. Connected Nodes bleiben sichtbar, unconnected werden auf 35% Opacity gedimmt.
- Click auf Node → Selection toggle. Sidebar öffnet/wechselt zu Entity-Detail.
- Click auf Pane → Selection clear.

### Sidebar (`entity-sidebar.tsx`)

- 44px collapsed Rail mit vertikalem Label, auf Hover → 380px expanded.
- Pin-Button (Chevron) fixiert die offene Sidebar; X clearer Selection.
- **Selected Entity**:
  - Category-Chip, Semantic-Role-Badge, Mention-Count
  - Definition (falls vorhanden, kursiv)
  - Outgoing Relations als Liste mit Predicate-Chip + Evidence-Quote, Other-Entity-Name klickbar (springt zur verlinkten Entity)
  - Incoming Relations analog
- **Nichts selektiert** (Default-State): SEO-Insights — Pillar-Topic, Page-Type-Badges, Domain, Audience, 3 Stat-Cards (Entities/Relations/Categories), Subtopics, Content-Gaps (amber), Target-Queries, Related-Clusters, Semantic-Field (muted), Competing-Topics (rose).

### Page-Profile (`page-profile.tsx`)

Karte oberhalb der Map. Beantwortet sofort die Frage: **"Ist das hier eine Hub-/Übersichtsseite oder eine Child-Page?"**

- **Hub vs Child Verdict**: `meta.page_type` ∈ {`pillar_page`, `category_page`} → grünes "Hub / Übersichtsseite" Badge. Sonst blaues "Child-Page / Spoke" Badge. Mit Klartext-Satz darunter.
- **Pillar-Topic** als großer Heading.
- Domain, Audience, Stats (Entities/Relations/Pillar-Count).
- **Subtopics-Sektion**: Framing hängt vom Page-Typ ab — wenn Hub: "Kandidaten für eigene Child-Pages". Wenn Spoke: "was diese Seite bereits abdeckt".
- **Content-Gaps** (amber): wenn Hub: "Mögliche weitere Child-Pages (Content-Gaps)". Wenn Spoke: "Lücken auf dieser Seite".
- **Related-Clusters**: angrenzende Topics für interne Verlinkung.
- **Target-Queries** (muted): Suchanfragen, für die die Seite ranken könnte.
- **Competing-Topics** (rose, nur bei vorhandenen): Fokus-Verwässerung.

## Operationale Notes

- `maxDuration = 300` auf `/api/nlp/llm`. Falls Coolify-Traefik vorher abbricht → in den Service-Advanced-Settings die Read/Write-Timeouts auf ≥300s setzen.
- Server-Logs auf der LLM-Route (sichtbar im Coolify-Container-Log):
  ```
  [nlp/llm <ver>] POST <endpoint> model=<id> thinking=<state> stream=true
  [nlp/llm <ver>] headers status=<n> in <ms>ms
  [nlp/llm <ver>] first chunk after <ms>ms
  [nlp/llm <ver>] stream complete in <ms>ms, <chars> chars, finish=<reason>
  ```
- Bei Timeout enthält die JSON-Error-Response zusätzlich `firstChunkMs` und `partial` (was bisher gestreamt wurde) für Diagnose.

## Bekannte Limitations / mögliche Erweiterungen

- **Kein Streaming-zum-Client**: Spinner läuft 15-30s synchron. Bei Wunsch nach progressivem Output müsste die Server-Route den DeepSeek-Stream weiterstreamen (SSE oder ReadableStream) und der Client einen Parser für inkrementelles JSON haben.
- **Single-Page-Mode**: Keine Aggregation über mehrere URLs eines Kunden. Spec sah "Cross-Page-Modus" mit gemeinsamen `canonical_names` als Merge-Points vor — nicht umgesetzt.
- **Keine Persistenz**: Extractions werden nicht in der DB gespeichert. Jeder Klick auf "Semantik extrahieren" macht einen neuen LLM-Call.
- **Filter-Toolbar**: Keine UI-Filter für Semantic-Role oder einzelne Kategorien. Bei großen Graphen (50+ Nodes) wird's visuell dicht.
- **Layout-Strategy**: Aktuell dagre LR. Bei sehr dichten Graphen wäre `elk.js` oder ein radiales Layout mit Pillar im Zentrum potenziell lesbarer.
