export const EXTRACTION_SYSTEM_PROMPT = `Du analysierst einen einzelnen Webseiten-Text und extrahierst dessen semantische Struktur für SEO Topic Cluster Analyse und Themenautoritäts-Bewertung. Arbeite die folgenden 6 Phasen strikt nacheinander ab.

# Phase 1 — Domänen-Erkennung

Lies den vollständigen Text und bestimme:
- domain: Branche/Fachgebiet so SPEZIFISCH wie möglich. Nicht "Business" sondern z.B. "B2B-Industriefertigung Apparatebau", nicht "Gesundheit" sondern "Pädiatrische Physiotherapie". 5–10 Wörter.
- page_type: pillar_page | service_page | product_detail | blog_article | faq | category_page | location_page | about_page | landing_page | other
- intent: informational | commercial | transactional | navigational
- audience: Wer ist die explizite oder implizite Zielgruppe? (kurze Beschreibung)

# Phase 2 — Adaptive Kategorien-Ableitung

Leite aus der erkannten Domäne 6–12 Entity-/Konzept-Kategorien ab, die FÜR DIESEN TEXT bedeutungsvoll sind. Die Kategorien müssen:
- domänenspezifisch sein (nicht generisch)
- voneinander unterscheidbar sein
- in der Sprache des Textes benannt sein

VERBOTEN sind generische Labels: "Entity", "Thing", "Concept", "Topic", "Item", "Object", "OTHER".

Beispiele guter Kategorien-Sets:
- Industriefertigung: Werkstoff, Verfahren, Norm, Bauteil, Branche, Anwendungsfall, Eigenschaft, Zertifizierung, Maschine, Prüfverfahren
- Rechtsberatung: Rechtsgebiet, Verfahrensart, Mandantengruppe, Anspruchsgrundlage, Instanz, Frist, Dokument, Honorarmodell
- E-Commerce Skincare: Produkttyp, Wirkstoff, Hauttyp, Hautanliegen, Anwendung, Marke, Inhaltsstoff-Klasse, Zertifizierung
- SaaS B2B: Produkt-Feature, Use-Case, Integration, Zielrolle, Branche, Pricing-Tier, Metrik, Compliance

# Phase 3 — Entity-Extraktion

Für JEDE in Phase 2 definierte Kategorie extrahiere alle vorkommenden Entitäten:
- name: exakt wie im Text (erste oder häufigste Schreibung)
- canonical_name: normalisierte Form (z.B. "Hastelloy C-22" statt "C22", "DIN EN ISO 3834-3" statt "3834-3")
- category: eine der Phase-2-Kategorien
- mentions: Anzahl der Erwähnungen im Text
- definition_in_text: Wenn die Seite die Entität erklärt/definiert, der Erklärungssatz (string), sonst null
- semantic_role: "pillar" (zentral) | "supporting" (stützt Pillar) | "peripheral" (Randerwähnung)

Keine Duplikate. Wenn unsicher zwischen Kategorien, wähle die spezifischste.

# Phase 4 — Relations-Extraktion

Extrahiere alle bedeutungsvollen Beziehungen zwischen zwei Entitäten:
- subject: Entity-name (verwende canonical_name aus Phase 3)
- predicate: domänenspezifisches Verb/Phrase (z.B. "besteht_aus", "erfüllt", "eingesetzt_bei", "ist_typ_von", "ersetzt", "kombiniert_mit"). Snake_case, in der Sprache des Textes.
- object: Entity-name (verwende canonical_name aus Phase 3)
- evidence: Der konkrete Satz/Halbsatz aus dem Text, der die Relation belegt.

REGELN:
- Nur EXPLIZITE oder stark implizierte Relationen. Keine Halluzinationen.
- Eine Relation muss durch evidence belegbar sein.
- Symmetrische Relationen nur einmal aufführen.
- subject und object MÜSSEN als Entity in Phase 3 existieren (canonical_name match).

# Phase 5 — SEO Topic Signals

- pillar_topic: Das EINE dominante Thema der Seite (3–6 Wörter, in der Sprache des Textes)
- subtopics: 3–8 Sub-Themen, die der Pillar untergliedern
- semantic_field: 10–20 thematisch eng verwandte Begriffe, die das topical lexicon der Seite definieren (kann Begriffe enthalten, die NICHT im Text stehen, aber semantisch klar mitschwingen)
- coverage_depth: "shallow" | "moderate" | "deep" — wie gründlich wird der Pillar elaboriert?
  - shallow: Pillar wird nur benannt, kaum erklärt
  - moderate: Pillar erklärt + einige Subtopics behandelt
  - deep: Pillar + die meisten Subtopics elaboriert + Beispiele/Belege
- content_gaps: 3–8 Subtopics oder Aspekte, die ERWÄHNT aber NICHT ausgeführt werden (= Cluster-Expansion-Potenzial!)
- related_clusters: 3–5 angrenzende Topic-Cluster, zu denen interne Verlinkung sinnvoll wäre
- competing_topics: 0–3 Themen, die zusätzlich behandelt werden und den Fokus VERWÄSSERN (leer lassen wenn Fokus klar ist)
- target_queries: 3–6 Suchanfragen, für die diese Seite plausibel ranken sollte/könnte

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

# Output-Format

Gib AUSSCHLIESSLICH dieses JSON-Objekt zurück. Kein Preamble, keine Markdown-Fences, keine Erklärungen.

{
  "meta": {
    "language": "<ISO 639-1>",
    "domain": "<string>",
    "page_type": "<enum>",
    "intent": "<enum>",
    "audience": "<string>"
  },
  "schema": {
    "categories": ["<kat1>", "<kat2>", ...]
  },
  "entities": [
    {
      "name": "<string>",
      "canonical_name": "<string>",
      "category": "<string>",
      "mentions": <int>,
      "definition_in_text": "<string|null>",
      "semantic_role": "<pillar|supporting|peripheral>"
    }
  ],
  "relations": [
    {
      "subject": "<string>",
      "predicate": "<string>",
      "object": "<string>",
      "evidence": "<string>"
    }
  ],
  "seo": {
    "pillar_topic": "<string>",
    "subtopics": ["<string>"],
    "semantic_field": ["<string>"],
    "coverage_depth": "<shallow|moderate|deep>",
    "content_gaps": ["<string>"],
    "related_clusters": ["<string>"],
    "competing_topics": ["<string>"],
    "target_queries": ["<string>"]
  },
  "recommended_sitemap": {
    "pages": [
      {
        "slug": "<string>",
        "parent_slug": "<string|null>",
        "h1": "<string>",
        "page_role": "<pillar|cluster_overview|service_page|info_page|location_page|about_page|faq|blog_article>",
        "status": "<covered_on_page|content_gap|likely_exists_elsewhere>",
        "target_queries": ["<string>"],
        "covers_entities": ["<canonical_name>"],
        "covers_subtopics": ["<string>"],
        "rationale": "<string>"
      }
    ]
  }
}`;

// ============================================================================
// Multi-Step Pipeline Prompts
// ----------------------------------------------------------------------------
// The single-shot EXTRACTION_SYSTEM_PROMPT above runs Phase 1–6 in one call.
// The multi-step pipeline (see lib/nlp/pipeline.ts) splits this into 2, 3 or
// 4 sequential LLM calls. Each step has its own focused system prompt and
// returns a smaller JSON object that the orchestrator merges back into the
// canonical ExtractionOutput shape.
// ============================================================================

const PHASE_1 = `# Phase 1 — Domänen-Erkennung

Lies den vollständigen Text und bestimme:
- domain: Branche/Fachgebiet so SPEZIFISCH wie möglich. Nicht "Business" sondern z.B. "B2B-Industriefertigung Apparatebau", nicht "Gesundheit" sondern "Pädiatrische Physiotherapie". 5–10 Wörter.
- page_type: pillar_page | service_page | product_detail | blog_article | faq | category_page | location_page | about_page | landing_page | other
- intent: informational | commercial | transactional | navigational
- audience: Wer ist die explizite oder implizite Zielgruppe? (kurze Beschreibung)`;

const PHASE_2 = `# Phase 2 — Adaptive Kategorien-Ableitung

Leite aus der erkannten Domäne 6–12 Entity-/Konzept-Kategorien ab, die FÜR DIESEN TEXT bedeutungsvoll sind. Die Kategorien müssen:
- domänenspezifisch sein (nicht generisch)
- voneinander unterscheidbar sein
- in der Sprache des Textes benannt sein

VERBOTEN sind generische Labels: "Entity", "Thing", "Concept", "Topic", "Item", "Object", "OTHER".

Beispiele guter Kategorien-Sets:
- Industriefertigung: Werkstoff, Verfahren, Norm, Bauteil, Branche, Anwendungsfall, Eigenschaft, Zertifizierung, Maschine, Prüfverfahren
- Rechtsberatung: Rechtsgebiet, Verfahrensart, Mandantengruppe, Anspruchsgrundlage, Instanz, Frist, Dokument, Honorarmodell
- E-Commerce Skincare: Produkttyp, Wirkstoff, Hauttyp, Hautanliegen, Anwendung, Marke, Inhaltsstoff-Klasse, Zertifizierung
- SaaS B2B: Produkt-Feature, Use-Case, Integration, Zielrolle, Branche, Pricing-Tier, Metrik, Compliance`;

const PHASE_3 = `# Phase 3 — Entity-Extraktion

Für JEDE in Phase 2 definierte Kategorie extrahiere alle vorkommenden Entitäten:
- name: exakt wie im Text (erste oder häufigste Schreibung)
- canonical_name: normalisierte Form (z.B. "Hastelloy C-22" statt "C22", "DIN EN ISO 3834-3" statt "3834-3")
- category: eine der Phase-2-Kategorien
- mentions: Anzahl der Erwähnungen im Text
- definition_in_text: Wenn die Seite die Entität erklärt/definiert, der Erklärungssatz (string), sonst null
- semantic_role: "pillar" (zentral) | "supporting" (stützt Pillar) | "peripheral" (Randerwähnung)

Keine Duplikate. Wenn unsicher zwischen Kategorien, wähle die spezifischste.`;

const PHASE_3_SLIM = `# Phase 3 — Entity-Extraktion (light)

Für JEDE in Phase 2 definierte Kategorie extrahiere alle vorkommenden Entitäten:
- name: exakt wie im Text (erste oder häufigste Schreibung)
- canonical_name: normalisierte Form (z.B. "Hastelloy C-22" statt "C22", "DIN EN ISO 3834-3" statt "3834-3")
- category: eine der Phase-2-Kategorien
- semantic_role: "pillar" (zentral) | "supporting" (stützt Pillar) | "peripheral" (Randerwähnung)

Diese Light-Version SKIPPT bewusst die Felder \`mentions\` und \`definition_in_text\` — sie werden downstream nicht verwendet. Liefere sie NICHT.

Keine Duplikate. Wenn unsicher zwischen Kategorien, wähle die spezifischste.`;

const PHASE_4 = `# Phase 4 — Relations-Extraktion

Extrahiere alle bedeutungsvollen Beziehungen zwischen zwei Entitäten:
- subject: Entity-name (verwende canonical_name aus Phase 3)
- predicate: domänenspezifisches Verb/Phrase (z.B. "besteht_aus", "erfüllt", "eingesetzt_bei", "ist_typ_von", "ersetzt", "kombiniert_mit"). Snake_case, in der Sprache des Textes.
- object: Entity-name (verwende canonical_name aus Phase 3)
- evidence: Der konkrete Satz/Halbsatz aus dem Text, der die Relation belegt.

REGELN:
- Nur EXPLIZITE oder stark implizierte Relationen. Keine Halluzinationen.
- Eine Relation muss durch evidence belegbar sein.
- Symmetrische Relationen nur einmal aufführen.
- subject und object MÜSSEN als Entity in Phase 3 existieren (canonical_name match).`;

const PHASE_5 = `# Phase 5 — SEO Topic Signals

- pillar_topic: Das EINE dominante Thema der Seite (3–6 Wörter, in der Sprache des Textes)
- subtopics: 3–8 Sub-Themen, die der Pillar untergliedern
- semantic_field: 10–20 thematisch eng verwandte Begriffe, die das topical lexicon der Seite definieren (kann Begriffe enthalten, die NICHT im Text stehen, aber semantisch klar mitschwingen)
- coverage_depth: "shallow" | "moderate" | "deep" — wie gründlich wird der Pillar elaboriert?
  - shallow: Pillar wird nur benannt, kaum erklärt
  - moderate: Pillar erklärt + einige Subtopics behandelt
  - deep: Pillar + die meisten Subtopics elaboriert + Beispiele/Belege
- content_gaps: 3–8 Subtopics oder Aspekte, die ERWÄHNT aber NICHT ausgeführt werden (= Cluster-Expansion-Potenzial!)
- related_clusters: 3–5 angrenzende Topic-Cluster, zu denen interne Verlinkung sinnvoll wäre
- competing_topics: 0–3 Themen, die zusätzlich behandelt werden und den Fokus VERWÄSSERN (leer lassen wenn Fokus klar ist)
- target_queries: 3–6 Suchanfragen, für die diese Seite plausibel ranken sollte/könnte`;

const NO_PREAMBLE = `Gib AUSSCHLIESSLICH das nachfolgende JSON-Objekt zurück. Kein Preamble, keine Markdown-Fences, keine Erklärungen.`;

const META_SCHEMA = `  "meta": {
    "language": "<ISO 639-1>",
    "domain": "<string>",
    "page_type": "<enum>",
    "intent": "<enum>",
    "audience": "<string>"
  },
  "schema": {
    "categories": ["<kat1>", "<kat2>"]
  }`;

const ENTITIES_SCHEMA = `  "entities": [
    {
      "name": "<string>",
      "canonical_name": "<string>",
      "category": "<string>",
      "mentions": <int>,
      "definition_in_text": "<string|null>",
      "semantic_role": "<pillar|supporting|peripheral>"
    }
  ]`;

const ENTITIES_SCHEMA_SLIM = `  "entities": [
    {
      "name": "<string>",
      "canonical_name": "<string>",
      "category": "<string>",
      "semantic_role": "<pillar|supporting|peripheral>"
    }
  ]`;

const RELATIONS_SCHEMA = `  "relations": [
    {
      "subject": "<canonical_name>",
      "predicate": "<string>",
      "object": "<canonical_name>",
      "evidence": "<string>"
    }
  ]`;

const SEO_SCHEMA = `  "seo": {
    "pillar_topic": "<string>",
    "subtopics": ["<string>"],
    "semantic_field": ["<string>"],
    "coverage_depth": "<shallow|moderate|deep>",
    "content_gaps": ["<string>"],
    "related_clusters": ["<string>"],
    "competing_topics": ["<string>"],
    "target_queries": ["<string>"]
  }`;

const SITEMAP_SCHEMA = `  "recommended_sitemap": {
    "pages": [
      {
        "slug": "<string>",
        "parent_slug": "<string|null>",
        "h1": "<string>",
        "page_role": "<pillar|cluster_overview|service_page|info_page|location_page|about_page|faq|blog_article>",
        "status": "<covered_on_page|content_gap|likely_exists_elsewhere>",
        "target_queries": ["<string>"],
        "covers_entities": ["<canonical_name>"],
        "covers_subtopics": ["<string>"],
        "rationale": "<string>"
      }
    ]
  }`;

// ----------------------------------------------------------------------------
// 4-step pipeline: Entities → Relations → SEO → Sitemap
// ----------------------------------------------------------------------------

export const EXTRACTION_PROMPT_ENTITIES = [
  `Du analysierst einen Webseiten-Text und legst die Grundlage für eine SEO Topic Cluster Analyse. Arbeite die folgenden 3 Phasen strikt nacheinander ab. Die Relationen zwischen den Entitäten kommen in einem SEPARATEN späteren Aufruf — extrahiere sie hier NICHT.`,
  PHASE_1,
  PHASE_2,
  PHASE_3,
  `# Output-Format\n\n${NO_PREAMBLE}\n\n{\n${META_SCHEMA},\n${ENTITIES_SCHEMA}\n}`
].join("\n\n");

export const EXTRACTION_PROMPT_RELATIONS = [
  `Du erhältst im User-Message (1) den Webseiten-Text und (2) die bereits extrahierten Entitäten als JSON-Kontext (\`entities\` mit canonical_names). Deine einzige Aufgabe: bedeutungsvolle Beziehungen zwischen diesen Entitäten extrahieren.`,
  PHASE_4 + `\n\nWICHTIG: subject und object MÜSSEN canonical_names aus der im User-Message bereitgestellten entities-Liste sein. Erfinde KEINE neuen Entities.`,
  `# Output-Format\n\n${NO_PREAMBLE}\n\n{\n${RELATIONS_SCHEMA}\n}`
].join("\n\n");

// ----------------------------------------------------------------------------
// 3-step pipeline: Knowledge Graph → SEO → Sitemap
// ----------------------------------------------------------------------------

export const EXTRACTION_PROMPT_KG = [
  `Du analysierst einen Webseiten-Text und extrahierst den Wissensgraphen (Entitäten + Relationen). Arbeite die folgenden 4 Phasen strikt nacheinander ab. Die SEO-Signale und die Sitemap-Empfehlung kommen in SEPARATEN späteren Aufrufen — extrahiere sie hier NICHT.`,
  PHASE_1,
  PHASE_2,
  PHASE_3,
  PHASE_4,
  `# Output-Format\n\n${NO_PREAMBLE}\n\n{\n${META_SCHEMA},\n${ENTITIES_SCHEMA},\n${RELATIONS_SCHEMA}\n}`
].join("\n\n");

// ----------------------------------------------------------------------------
// 2-step pipeline: Phases 1–5 in one call → Sitemap
// ----------------------------------------------------------------------------

export const EXTRACTION_PROMPT_KG_AND_SEO = [
  `Du analysierst einen Webseiten-Text und extrahierst dessen semantische Struktur. Arbeite die folgenden 5 Phasen strikt nacheinander ab. Die Sitemap-Empfehlung kommt in einem SEPARATEN späteren Aufruf — entwirf sie hier NICHT.`,
  PHASE_1,
  PHASE_2,
  PHASE_3,
  PHASE_4,
  PHASE_5,
  `# Output-Format\n\n${NO_PREAMBLE}\n\n{\n${META_SCHEMA},\n${ENTITIES_SCHEMA},\n${RELATIONS_SCHEMA},\n${SEO_SCHEMA}\n}`
].join("\n\n");

// ----------------------------------------------------------------------------
// SEO step (used by 3-step Step 2 and 4-step Step 3)
// ----------------------------------------------------------------------------

export const EXTRACTION_PROMPT_SEO = [
  `Du erhältst im User-Message (1) den Webseiten-Text und (2) die bereits extrahierten Entitäten und Relationen als JSON-Kontext. Deine einzige Aufgabe: SEO Topic Signals extrahieren.`,
  PHASE_5,
  `# Output-Format\n\n${NO_PREAMBLE}\n\n{\n${SEO_SCHEMA}\n}`
].join("\n\n");

// ----------------------------------------------------------------------------
// Sitemap step (final step in all multi-step pipelines)
// ----------------------------------------------------------------------------

export const EXTRACTION_PROMPT_SITEMAP = [
  `Du erhältst im User-Message die bereits aus einer Webseite extrahierten Daten als JSON: \`meta\`, \`entities\`, \`relations\`, \`seo\`. Du erhältst NICHT den Original-Text — arbeite ausschließlich mit den bereitgestellten strukturierten Daten. Deine einzige Aufgabe: Empfohlene Sitemap entwerfen.`,
  `# Aufgabe: Empfohlene Sitemap (Site-Tree für SEO Topical Authority)

Basierend auf den bereitgestellten Daten (Domäne aus meta, Entities, Pillar-Topic, Subtopics, Content-Gaps aus seo): entwirf einen IDEALEN Site-Tree für die Domäne. Ziel: vollständige Themen-Abdeckung, klare Hub-Spoke-Struktur, jede Page hat einen eindeutigen Slug und eine H1.

Die Seitenstruktur hat genau EINE Pillar-Page (Wurzel, slug "/") und 2–4 Ebenen darunter. Höchstens 30 Pages gesamt.

Für JEDE empfohlene Page:
- slug: URL-Pfad ab Domain-Root, immer mit führendem "/". Pillar = "/". Sonst lowercase, kebab-case, in der Sprache aus meta.language. Slugs MÜSSEN eindeutig sein.
- parent_slug: Slug der Eltern-Page. NULL nur für die Pillar-Page. Jeder andere parent_slug MUSS einer in dieser Liste vorkommenden Slug sein.
- h1: vorgeschlagene Hauptüberschrift, 2–8 Wörter, in der Sprache aus meta.language.
- page_role: "pillar" | "cluster_overview" | "service_page" | "info_page" | "location_page" | "about_page" | "faq" | "blog_article"
- status: "covered_on_page" wenn die analysierte URL (laut meta.page_type) diese Page IST oder ihren Inhalt vollständig abdeckt; "content_gap" wenn ein content_gap aus seo diese Page motiviert ODER die Page klar nötig wäre; "likely_exists_elsewhere" wenn diese Page typischerweise auf der Website existiert (/impressum, /team, /kontakt), aber nicht extrahiert wurde.
- target_queries: 1–3 Suchanfragen. Bevorzuge Werte aus seo.target_queries und seo.content_gaps. Leer für Pillar/Cluster-Overview wenn nicht eindeutig.
- covers_entities: Liste der canonical_names. MUSS ausschließlich aus der bereitgestellten entities-Liste stammen — erfinde KEINE neuen Entity-Namen. Kann leer sein.
- covers_subtopics: Liste der Subtopics aus seo.subtopics oder seo.content_gaps. MUSS aus diesen Listen stammen. Kann leer sein.
- rationale: ein Satz, warum diese Page existieren sollte (1 Halbsatz, in der Sprache aus meta.language).

REGELN:
- Genau eine Page mit parent_slug = null (die Pillar).
- Die analysierte URL (laut meta.page_type) MUSS als EINE der Pages auftauchen mit status = "covered_on_page". Falls die analysierte Seite eine Child-Page ist und keine Pillar-Übersicht existiert, schlage die Pillar trotzdem als "content_gap" oder "likely_exists_elsewhere" vor.
- Keine zirkulären Eltern-Referenzen.
- Keine Self-References (page.parent_slug != page.slug).
- covers_entities und covers_subtopics MÜSSEN ausschließlich Werte aus den im User-Message bereitgestellten Listen verwenden.
- Wenn der Kontext kaum verwertbar ist (z.B. <3 Entities), gib eine minimale Sitemap mit 1–3 Pages aus statt zu halluzinieren.

Beispiele plausibler Trees (NICHT 1:1 übernehmen, nur Stil):
- Zahnarzt-Praxis: Pillar "/" → Cluster "/leistungen" → Service-Pages "/leistungen/implantologie", "/leistungen/prophylaxe", ... + Cluster "/praxis" → "/praxis/team", "/praxis/anfahrt" + "/notfall" + "/preise".
- SaaS-B2B: Pillar "/" → "/produkt" → Feature-Pages, + "/anwendungsfaelle/<branche>", + "/preise", + "/blog/<thema>".`,
  `# Output-Format\n\n${NO_PREAMBLE}\n\n{\n${SITEMAP_SCHEMA}\n}`
].join("\n\n");

// ----------------------------------------------------------------------------
// Keyword Map-Reduce pipeline (keyword mode only)
// ----------------------------------------------------------------------------
// Phase 1 (5× parallel per SERP URL): EXTRACTION_PROMPT_PER_URL_LIGHT
//   → entities + relations + schema.categories (no meta, no seo, no sitemap)
// Phase 2 (programmatic merge in JS): dedupe entities by canonical_name,
//   dedupe relations by (subject, predicate, object), union categories.
// Phase 3 (1× LLM): EXTRACTION_PROMPT_KEYWORD_SYNTHESIS
//   → consolidated meta + seo from merged structured data + source headers.
// Phase 4 (1× LLM): EXTRACTION_PROMPT_SITEMAP (reused, no text input).

export const EXTRACTION_PROMPT_PER_URL_LIGHT = [
  `Du analysierst EINEN von mehreren Webseiten-Texten, die alle in den Top-Suchergebnissen für ein gemeinsames Keyword ranken. Deine Extraktion wird später mit denen aus den anderen Quellen zu einer konsolidierten Topic-Map gemerged.

Im User-Message bekommst du das gemeinsame Keyword UND den Body-Text DIESER einen Quelle. Konzentriere dich auf den Body-Text — das Keyword dient nur als Domänen-Hinweis.

Arbeite die folgenden Phasen strikt nacheinander ab. SEO-Signale, page_type/intent/audience und Sitemap werden in SEPARATEN späteren Aufrufen aus der gemergten Sicht synthetisiert — extrahiere sie hier NICHT.

Diese Light-Variante läuft OHNE Chain-of-Thought-Reasoning. Sei direkt und mechanisch: Domäne erkennen → Kategorien ableiten → Entities + Relations extrahieren.`,
  `# Phase 1 (intern) — Domäne erkennen

Bestimme die Domäne dieser Quelle nur intern, um Kategorien sauber ableiten zu können. Gib sie NICHT als Feld aus.`,
  PHASE_2,
  PHASE_3_SLIM,
  PHASE_4,
  `# Output-Format\n\n${NO_PREAMBLE}\n\n{\n  "schema": {\n    "categories": ["<kat1>", "<kat2>"]\n  },\n${ENTITIES_SCHEMA_SLIM},\n${RELATIONS_SCHEMA}\n}`
].join("\n\n");

export const EXTRACTION_PROMPT_KEYWORD_FULL_SYNTHESIS = [
  `Du synthetisierst die konsolidierte semantische Sicht auf ein Keyword UND entwirfst die empfohlene Sitemap für die zugehörige Topical Authority — beides in EINEM JSON-Output.

Im User-Message bekommst du:
- Das Keyword
- Die Headers der Top-5 SERP-Quellen (URL, title, description, position)
- Die bereits gemergten \`entities\` (über alle Quellen dedupliziert nach canonical_name)
- Die bereits gemergten \`relations\` (über alle Quellen dedupliziert nach subject+predicate+object)
- Die gemergten \`categories\` (Union der per-Quelle Kategorien-Sets)

Du erhältst NICHT die Original-Texte der Quellen — arbeite ausschließlich mit dem bereitgestellten strukturierten Material plus den Quell-Headers.

Deine Aufgabe: produziere meta + schema + seo + recommended_sitemap für die GESAMTE Topic-Map des Keywords. Arbeite die Phasen 1–4 strikt nacheinander ab. Reasoning ist aktiviert; nutze es für Phase 3 (SEO-Synthese) und Phase 4 (Sitemap-Architektur), nicht für Phase 1/2.`,
  `# Phase 1 — Konsolidierte Meta

- language: ISO 639-1, abgeleitet aus den Quell-Headers (alle deutsch → "de", alle englisch → "en", gemischt → dominante Sprache)
- domain: das Fachgebiet des Keywords spezifisch (5–10 Wörter), z.B. "B2B-Industriefertigung Behälter- und Tankbau"
- page_type: IMMER "pillar_page" — diese konsolidierte Sicht IST die Pillar-Topic-Map zum Keyword
- intent: was suchen User typischerweise mit DIESEM Keyword? informational | commercial | transactional | navigational
- audience: gemeinsame Zielgruppe der Top-SERP-Quellen (kurze Beschreibung)`,
  `# Phase 2 — Konsolidiertes Schema

Bereinige und verdichte die im User-Message bereitgestellten \`categories\` zu 6–12 finalen Kategorien:
- Duplikate/Synonyme verschmelzen ("Material" + "Werkstoff" → "Werkstoff")
- Generische Labels entfernen ("Entity", "Thing", "OTHER")
- An die Domäne anpassen, in der Sprache aus meta.language

VERBOTEN sind generische Labels: "Entity", "Thing", "Concept", "Topic", "Item", "Object", "OTHER".`,
  `# Phase 3 — Konsolidierte SEO Topic Signals

Leite ausschließlich aus den bereitgestellten Strukturdaten (entities + relations + source headers + keyword) ab:

- pillar_topic: das EINE dominante Thema des Keywords (3–6 Wörter, Sprache aus meta.language). Bevorzuge die canonical_names der Entities mit semantic_role="pillar".
- subtopics: 3–8 Sub-Themen, ableitbar aus pillar-Entities + ihren Relations + Quell-Titles
- semantic_field: 10–20 thematisch eng verwandte Begriffe (kann Begriffe enthalten, die nicht in entities stehen, aber semantisch klar mitschwingen)
- coverage_depth: "shallow" | "moderate" | "deep" — wie tief decken die Top-5 SERPs zusammen das Thema ab? shallow=meist Landing-Pages mit wenig Tiefe, moderate=Pillar + einige Subtopics, deep=mehrere ausführliche Pillar-Pages.
- content_gaps: 3–8 Aspekte/Subtopics, die in den Quell-Headers/entities ERWÄHNT aber kaum belegt sind — also Ranking-Lücken, die eine eigene Seite schließen könnte
- related_clusters: 3–5 angrenzende Topic-Cluster, zu denen interne Verlinkung Sinn machen würde
- competing_topics: 0–3 Themen, die in den Quellen mitlaufen aber den Keyword-Fokus VERWÄSSERN (leer wenn Fokus klar)
- target_queries: 3–6 Suchanfragen rund um das Keyword, für die die Pillar-Page ranken sollte. Das Keyword selbst MUSS unter target_queries auftauchen.`,
  `# Phase 4 — Empfohlene Sitemap (Site-Tree für SEO Topical Authority)

Basierend auf Phase 1 (meta) + den bereitgestellten entities + Phase 3 (seo): entwirf einen IDEALEN Site-Tree für die Domäne des Keywords. Ziel: vollständige Themen-Abdeckung, klare Hub-Spoke-Struktur, jede Page hat einen eindeutigen Slug und eine H1.

Die Seitenstruktur hat genau EINE Pillar-Page (Wurzel, slug "/") und 2–4 Ebenen darunter. Höchstens 30 Pages gesamt.

Für JEDE empfohlene Page:
- slug: URL-Pfad ab Domain-Root, immer mit führendem "/". Pillar = "/". Sonst lowercase, kebab-case, in der Sprache aus meta.language. Slugs MÜSSEN eindeutig sein.
- parent_slug: Slug der Eltern-Page. NULL nur für die Pillar-Page. Jeder andere parent_slug MUSS einer in dieser Liste vorkommenden Slug sein.
- h1: vorgeschlagene Hauptüberschrift, 2–8 Wörter, in der Sprache aus meta.language.
- page_role: "pillar" | "cluster_overview" | "service_page" | "info_page" | "location_page" | "about_page" | "faq" | "blog_article"
- status: "covered_on_page" (Pillar selbst, da meta.page_type = "pillar_page"); "content_gap" wenn aus seo.content_gaps motiviert ODER die Page klar nötig wäre; "likely_exists_elsewhere" wenn die Page typischerweise auf einer Site existiert (/impressum, /team, /kontakt).
- target_queries: 1–3 Suchanfragen. Bevorzuge Werte aus seo.target_queries und seo.content_gaps. Leer für Pillar/Cluster-Overview wenn nicht eindeutig.
- covers_entities: Liste der canonical_names. MUSS ausschließlich aus der im User-Message bereitgestellten entities-Liste stammen — erfinde KEINE neuen Entity-Namen. Kann leer sein.
- covers_subtopics: Liste der Subtopics aus seo.subtopics oder seo.content_gaps. MUSS aus diesen Listen stammen. Kann leer sein.
- rationale: ein Satz, warum diese Page existieren sollte (1 Halbsatz, in der Sprache aus meta.language).

REGELN:
- Genau eine Page mit parent_slug = null (die Pillar mit status "covered_on_page").
- Keine zirkulären Eltern-Referenzen.
- Keine Self-References (page.parent_slug != page.slug).
- covers_entities und covers_subtopics MÜSSEN ausschließlich Werte aus den bereitgestellten Listen verwenden.
- Wenn der Kontext kaum verwertbar ist (z.B. <3 Entities), gib eine minimale Sitemap mit 1–3 Pages aus statt zu halluzinieren.

Beispiele plausibler Trees (NICHT 1:1 übernehmen, nur Stil):
- Zahnarzt-Praxis: Pillar "/" → Cluster "/leistungen" → Service-Pages "/leistungen/implantologie", "/leistungen/prophylaxe", ... + Cluster "/praxis" → "/praxis/team", "/praxis/anfahrt" + "/notfall" + "/preise".
- SaaS-B2B: Pillar "/" → "/produkt" → Feature-Pages, + "/anwendungsfaelle/<branche>", + "/preise", + "/blog/<thema>".`,
  `# Output-Format\n\n${NO_PREAMBLE}\n\n{\n${META_SCHEMA},\n${SEO_SCHEMA},\n${SITEMAP_SCHEMA}\n}`
].join("\n\n");

export const EXTRACTION_PROMPT_KEYWORD_SYNTHESIS = [
  `Du synthetisierst die konsolidierte semantische Sicht auf ein Keyword aus den bereits aus den Top-SERP-Ergebnissen extrahierten Strukturdaten.

Im User-Message bekommst du:
- Das Keyword
- Die Headers der Top-5 SERP-Quellen (URL, title, description, position)
- Die bereits gemergten \`entities\` (über alle Quellen dedupliziert nach canonical_name)
- Die bereits gemergten \`relations\` (über alle Quellen dedupliziert nach subject+predicate+object)
- Die gemergten \`categories\` (Union der per-Quelle Kategorien-Sets)

Du erhältst NICHT die Original-Texte der Quellen — arbeite ausschließlich mit dem bereitgestellten strukturierten Material plus den Quell-Headers.

Deine Aufgabe: produziere meta + schema + seo für die GESAMTE Topic-Map des Keywords (nicht für eine einzelne Quelle). Die Sitemap kommt in einem SEPARATEN späteren Aufruf — entwirf sie hier NICHT.`,
  `# Phase 1 — Konsolidierte Meta

- language: ISO 639-1, abgeleitet aus den Quell-Headers (alle deutsch → "de", alle englisch → "en", gemischt → dominante Sprache)
- domain: das Fachgebiet des Keywords spezifisch (5–10 Wörter), z.B. "B2B-Industriefertigung Behälter- und Tankbau"
- page_type: IMMER "pillar_page" — diese konsolidierte Sicht IST die Pillar-Topic-Map zum Keyword
- intent: was suchen User typischerweise mit DIESEM Keyword? informational | commercial | transactional | navigational
- audience: gemeinsame Zielgruppe der Top-SERP-Quellen (kurze Beschreibung)`,
  `# Phase 2 — Konsolidiertes Schema

Bereinige und verdichte die im User-Message bereitgestellten \`categories\` zu 6–12 finalen Kategorien:
- Duplikate/Synonyme verschmelzen ("Material" + "Werkstoff" → "Werkstoff")
- Generische Labels entfernen ("Entity", "Thing", "OTHER")
- An die Domäne anpassen, in der Sprache aus meta.language

VERBOTEN sind generische Labels: "Entity", "Thing", "Concept", "Topic", "Item", "Object", "OTHER".`,
  `# Phase 3 — Konsolidierte SEO Topic Signals

Leite ausschließlich aus den bereitgestellten Strukturdaten (entities + relations + source headers + keyword) ab:

- pillar_topic: das EINE dominante Thema des Keywords (3–6 Wörter, Sprache aus meta.language). Bevorzuge die canonical_names der Entities mit semantic_role="pillar".
- subtopics: 3–8 Sub-Themen, ableitbar aus pillar-Entities + ihren Relations + Quell-Titles
- semantic_field: 10–20 thematisch eng verwandte Begriffe (kann Begriffe enthalten, die nicht in entities stehen, aber semantisch klar mitschwingen)
- coverage_depth: "shallow" | "moderate" | "deep" — wie tief decken die Top-5 SERPs zusammen das Thema ab? shallow=meist Landing-Pages mit wenig Tiefe, moderate=Pillar + einige Subtopics, deep=mehrere ausführliche Pillar-Pages.
- content_gaps: 3–8 Aspekte/Subtopics, die in den Quell-Headers/entities ERWÄHNT aber kaum belegt sind — also Ranking-Lücken, die eine eigene Seite schließen könnte
- related_clusters: 3–5 angrenzende Topic-Cluster, zu denen interne Verlinkung Sinn machen würde
- competing_topics: 0–3 Themen, die in den Quellen mitlaufen aber den Keyword-Fokus VERWÄSSERN (leer wenn Fokus klar)
- target_queries: 3–6 Suchanfragen rund um das Keyword, für die die Pillar-Page ranken sollte. Das Keyword selbst MUSS unter target_queries auftauchen.`,
  `# Output-Format\n\n${NO_PREAMBLE}\n\n{\n${META_SCHEMA},\n${SEO_SCHEMA}\n}`
].join("\n\n");
