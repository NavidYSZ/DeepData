import {
  EXTRACTION_PROMPT_ENTITIES,
  EXTRACTION_PROMPT_KEYWORD_FULL_SYNTHESIS,
  EXTRACTION_PROMPT_KG,
  EXTRACTION_PROMPT_KG_AND_SEO,
  EXTRACTION_PROMPT_PER_URL_LIGHT,
  EXTRACTION_PROMPT_RELATIONS,
  EXTRACTION_PROMPT_SEO,
  EXTRACTION_PROMPT_SITEMAP
} from "./extraction-prompt";
import { runLlmJsonCall, type LlmJsonCallOptions } from "./llm";
import type {
  ExtractionEntity,
  ExtractionMeta,
  ExtractionOutput,
  ExtractionRelation,
  ExtractionSeo,
  RecommendedSitemap
} from "./types";

export type PipelineMode = "single" | "2step" | "3step" | "4step" | "mapreduce";

export const PIPELINE_MODES: PipelineMode[] = [
  "single",
  "2step",
  "3step",
  "4step",
  "mapreduce"
];

export function isPipelineMode(value: unknown): value is PipelineMode {
  return typeof value === "string" && PIPELINE_MODES.includes(value as PipelineMode);
}

export type PipelineStepMetric = {
  step: string;
  model: string;
  durationMs: number;
  firstChunkMs: number | null;
  finishReason: string | null;
  usage: unknown;
};

export type PipelineSuccess = {
  ok: true;
  mode: Exclude<PipelineMode, "single">;
  extraction: ExtractionOutput;
  steps: PipelineStepMetric[];
  totalDurationMs: number;
};

export type PipelineFailure = {
  ok: false;
  status: number;
  body: Record<string, unknown>;
  failedStep: string;
  stepsCompleted: PipelineStepMetric[];
  totalDurationMs: number;
};

export type PipelineResult = PipelineSuccess | PipelineFailure;

export type PipelineProgressEvent =
  | { type: "step-start"; step: string }
  | { type: "step-done"; metric: PipelineStepMetric }
  | { type: "step-failed"; step: string; error: string };

export type PipelineOptions = {
  text: string;
  routeVersion: string;
  routeLogPrefix: string;
  /**
   * Builds the user message for the FIRST step (which receives the raw text).
   * Defaults to `# Der zu analysierende Text:\n\n<text>`. Keyword mode
   * overrides this to add a multi-source header.
   */
  userMessageBuilder?: (text: string) => string;
  /**
   * Enables reasoning/thinking for every step. Defaults to true for
   * multi-step pipelines (user opted in via UI).
   */
  enableThinking?: boolean;
  /**
   * Optional progress callback fired before each step starts and after
   * it completes. Routes use this to push SSE events to the client.
   */
  onProgress?: (event: PipelineProgressEvent) => void;
};

// Per-step max output tokens (passed as max_completion_tokens to OpenAI).
// URL-mode multi-step pipelines (single/2step/3step/4step) keep the full
// 380k budget because their outputs can be large and reasoning runs on the
// default model (gpt-5.4). Map-Reduce caps each step tight: Phase 1 runs
// on the fast model (gpt-5.4-mini) with reasoning_effort=minimal and
// produces tiny slim entities; Phase 3 (combined synthesis+sitemap) runs
// with reasoning_effort=medium capped so it doesn't drift.
const TOKENS = {
  entities: 380_000,
  relations: 380_000,
  seo: 380_000,
  kg: 380_000,
  kgAndSeo: 380_000,
  sitemap: 380_000,
  mapreducePerUrl: 32_000,
  mapreduceFullSynthesis: 64_000
} as const;

const defaultUserMessageBuilder = (text: string) =>
  `# Der zu analysierende Text:\n\n${text}`;

// ---------- Step result types ----------

type Step1EntitiesData = {
  meta: ExtractionMeta;
  schema: { categories: string[] };
  entities: ExtractionEntity[];
};

type Step1KGData = Step1EntitiesData & {
  relations: ExtractionRelation[];
};

type Step1KGAndSeoData = Step1KGData & {
  seo: ExtractionSeo;
};

type StepRelationsData = {
  relations: ExtractionRelation[];
};

type StepSeoData = {
  seo: ExtractionSeo;
};

type StepSitemapData = {
  recommended_sitemap: RecommendedSitemap;
};

// ---------- Helpers ----------

function compactEntitiesForContext(entities: ExtractionEntity[]) {
  // Strip mentions/definition_in_text to save tokens in downstream steps.
  return entities.map((e) => ({
    canonical_name: e.canonical_name,
    name: e.name,
    category: e.category,
    semantic_role: e.semantic_role
  }));
}

function compactRelationsForContext(relations: ExtractionRelation[]) {
  // Drop evidence to save tokens once relations have been confirmed.
  return relations.map((r) => ({
    subject: r.subject,
    predicate: r.predicate,
    object: r.object
  }));
}

function metricFromCall(
  step: string,
  call: { model: string; durationMs: number; firstChunkMs: number | null; finishReason: string | null; usage: unknown }
): PipelineStepMetric {
  return {
    step,
    model: call.model,
    durationMs: call.durationMs,
    firstChunkMs: call.firstChunkMs,
    finishReason: call.finishReason,
    usage: call.usage
  };
}

function failure(
  step: string,
  status: number,
  body: Record<string, unknown>,
  stepsCompleted: PipelineStepMetric[],
  startedAt: number
): PipelineFailure {
  return {
    ok: false,
    status,
    body: { ...body, failedStep: step },
    failedStep: step,
    stepsCompleted,
    totalDurationMs: Date.now() - startedAt
  };
}

type ProgressEmitter = {
  onProgress?: (event: PipelineProgressEvent) => void;
};

async function executeStep<T>(
  emitter: ProgressEmitter,
  steps: PipelineStepMetric[],
  startedAt: number,
  step: string,
  callArgs: LlmJsonCallOptions
): Promise<{ ok: true; data: T } | PipelineFailure> {
  emitter.onProgress?.({ type: "step-start", step });
  const result = await runLlmJsonCall<T>(callArgs);
  if (!result.ok) {
    emitter.onProgress?.({
      type: "step-failed",
      step,
      error: String((result.body as Record<string, unknown>)?.error ?? "step failed")
    });
    return failure(step, result.status, result.body, steps, startedAt);
  }
  const metric = metricFromCall(step, result);
  steps.push(metric);
  emitter.onProgress?.({ type: "step-done", metric });
  return { ok: true, data: result.data };
}

// ---------- Pipeline orchestrators ----------

/**
 * 2-step pipeline:
 *   Step A: Phases 1–5 (meta, schema, entities, relations, seo)
 *   Step B: Phase 6 (recommended_sitemap) — receives only structured data, no text.
 */
export async function run2StepPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const buildUserMessage = options.userMessageBuilder ?? defaultUserMessageBuilder;
  const startedAt = Date.now();
  const steps: PipelineStepMetric[] = [];

  const stepA = await executeStep<Step1KGAndSeoData>(
    options,
    steps,
    startedAt,
    "2step/A-kg+seo",
    {
      systemPrompt: EXTRACTION_PROMPT_KG_AND_SEO,
      userMessage: buildUserMessage(options.text),
      routeVersion: options.routeVersion,
      routeLogPrefix: options.routeLogPrefix,
      maxTokens: TOKENS.kgAndSeo,
      enableThinking: options.enableThinking,
      stepLabel: "2step/A-kg+seo"
    }
  );
  if (!stepA.ok) return stepA;

  const stepB = await executeStep<StepSitemapData>(
    options,
    steps,
    startedAt,
    "2step/B-sitemap",
    {
      systemPrompt: EXTRACTION_PROMPT_SITEMAP,
      userMessage: buildSitemapUserMessage({
        meta: stepA.data.meta,
        entities: stepA.data.entities,
        relations: stepA.data.relations,
        seo: stepA.data.seo
      }),
      routeVersion: options.routeVersion,
      routeLogPrefix: options.routeLogPrefix,
      maxTokens: TOKENS.sitemap,
      enableThinking: options.enableThinking,
      stepLabel: "2step/B-sitemap"
    }
  );
  if (!stepB.ok) return stepB;

  return {
    ok: true,
    mode: "2step",
    extraction: {
      meta: stepA.data.meta,
      schema: stepA.data.schema,
      entities: stepA.data.entities,
      relations: stepA.data.relations,
      seo: stepA.data.seo,
      recommended_sitemap: stepB.data.recommended_sitemap
    },
    steps,
    totalDurationMs: Date.now() - startedAt
  };
}

/**
 * 3-step pipeline:
 *   Step A: Phases 1–4 (Knowledge Graph)
 *   Step B: Phase 5 (SEO) — receives text + entities + relations
 *   Step C: Phase 6 (Sitemap) — receives only structured data, no text
 */
export async function run3StepPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const buildUserMessage = options.userMessageBuilder ?? defaultUserMessageBuilder;
  const startedAt = Date.now();
  const steps: PipelineStepMetric[] = [];

  const stepA = await executeStep<Step1KGData>(options, steps, startedAt, "3step/A-kg", {
    systemPrompt: EXTRACTION_PROMPT_KG,
    userMessage: buildUserMessage(options.text),
    routeVersion: options.routeVersion,
    routeLogPrefix: options.routeLogPrefix,
    maxTokens: TOKENS.kg,
    enableThinking: options.enableThinking,
    stepLabel: "3step/A-kg"
  });
  if (!stepA.ok) return stepA;

  const stepB = await executeStep<StepSeoData>(options, steps, startedAt, "3step/B-seo", {
    systemPrompt: EXTRACTION_PROMPT_SEO,
    userMessage: buildSeoUserMessage({
      text: options.text,
      entities: stepA.data.entities,
      relations: stepA.data.relations,
      buildBaseUserMessage: buildUserMessage
    }),
    routeVersion: options.routeVersion,
    routeLogPrefix: options.routeLogPrefix,
    maxTokens: TOKENS.seo,
    enableThinking: options.enableThinking,
    stepLabel: "3step/B-seo"
  });
  if (!stepB.ok) return stepB;

  const stepC = await executeStep<StepSitemapData>(
    options,
    steps,
    startedAt,
    "3step/C-sitemap",
    {
      systemPrompt: EXTRACTION_PROMPT_SITEMAP,
      userMessage: buildSitemapUserMessage({
        meta: stepA.data.meta,
        entities: stepA.data.entities,
        relations: stepA.data.relations,
        seo: stepB.data.seo
      }),
      routeVersion: options.routeVersion,
      routeLogPrefix: options.routeLogPrefix,
      maxTokens: TOKENS.sitemap,
      enableThinking: options.enableThinking,
      stepLabel: "3step/C-sitemap"
    }
  );
  if (!stepC.ok) return stepC;

  return {
    ok: true,
    mode: "3step",
    extraction: {
      meta: stepA.data.meta,
      schema: stepA.data.schema,
      entities: stepA.data.entities,
      relations: stepA.data.relations,
      seo: stepB.data.seo,
      recommended_sitemap: stepC.data.recommended_sitemap
    },
    steps,
    totalDurationMs: Date.now() - startedAt
  };
}

/**
 * 4-step pipeline:
 *   Step A: Phases 1–3 (Entities only)
 *   Step B: Phase 4 (Relations) — receives text + entities
 *   Step C: Phase 5 (SEO) — receives text + entities + relations
 *   Step D: Phase 6 (Sitemap) — receives only structured data, no text
 */
export async function run4StepPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const buildUserMessage = options.userMessageBuilder ?? defaultUserMessageBuilder;
  const startedAt = Date.now();
  const steps: PipelineStepMetric[] = [];

  const stepA = await executeStep<Step1EntitiesData>(
    options,
    steps,
    startedAt,
    "4step/A-entities",
    {
      systemPrompt: EXTRACTION_PROMPT_ENTITIES,
      userMessage: buildUserMessage(options.text),
      routeVersion: options.routeVersion,
      routeLogPrefix: options.routeLogPrefix,
      maxTokens: TOKENS.entities,
      enableThinking: options.enableThinking,
      stepLabel: "4step/A-entities"
    }
  );
  if (!stepA.ok) return stepA;

  const stepB = await executeStep<StepRelationsData>(
    options,
    steps,
    startedAt,
    "4step/B-relations",
    {
      systemPrompt: EXTRACTION_PROMPT_RELATIONS,
      userMessage: buildRelationsUserMessage({
        text: options.text,
        entities: stepA.data.entities,
        buildBaseUserMessage: buildUserMessage
      }),
      routeVersion: options.routeVersion,
      routeLogPrefix: options.routeLogPrefix,
      maxTokens: TOKENS.relations,
      enableThinking: options.enableThinking,
      stepLabel: "4step/B-relations"
    }
  );
  if (!stepB.ok) return stepB;

  const stepC = await executeStep<StepSeoData>(options, steps, startedAt, "4step/C-seo", {
    systemPrompt: EXTRACTION_PROMPT_SEO,
    userMessage: buildSeoUserMessage({
      text: options.text,
      entities: stepA.data.entities,
      relations: stepB.data.relations,
      buildBaseUserMessage: buildUserMessage
    }),
    routeVersion: options.routeVersion,
    routeLogPrefix: options.routeLogPrefix,
    maxTokens: TOKENS.seo,
    enableThinking: options.enableThinking,
    stepLabel: "4step/C-seo"
  });
  if (!stepC.ok) return stepC;

  const stepD = await executeStep<StepSitemapData>(
    options,
    steps,
    startedAt,
    "4step/D-sitemap",
    {
      systemPrompt: EXTRACTION_PROMPT_SITEMAP,
      userMessage: buildSitemapUserMessage({
        meta: stepA.data.meta,
        entities: stepA.data.entities,
        relations: stepB.data.relations,
        seo: stepC.data.seo
      }),
      routeVersion: options.routeVersion,
      routeLogPrefix: options.routeLogPrefix,
      maxTokens: TOKENS.sitemap,
      enableThinking: options.enableThinking,
      stepLabel: "4step/D-sitemap"
    }
  );
  if (!stepD.ok) return stepD;

  return {
    ok: true,
    mode: "4step",
    extraction: {
      meta: stepA.data.meta,
      schema: stepA.data.schema,
      entities: stepA.data.entities,
      relations: stepB.data.relations,
      seo: stepC.data.seo,
      recommended_sitemap: stepD.data.recommended_sitemap
    },
    steps,
    totalDurationMs: Date.now() - startedAt
  };
}

export async function runPipeline(
  mode: Exclude<PipelineMode, "single" | "mapreduce">,
  options: PipelineOptions
): Promise<PipelineResult> {
  switch (mode) {
    case "2step":
      return run2StepPipeline(options);
    case "3step":
      return run3StepPipeline(options);
    case "4step":
      return run4StepPipeline(options);
  }
}

// ---------- Per-step user message builders ----------

function buildRelationsUserMessage(args: {
  text: string;
  entities: ExtractionEntity[];
  buildBaseUserMessage: (text: string) => string;
}): string {
  const compactEntities = compactEntitiesForContext(args.entities);
  return [
    `# Bereits extrahierte Entitäten (canonical_names)\n\nVerwende AUSSCHLIESSLICH diese canonical_names als subject/object in den Relationen:\n\n\`\`\`json\n${JSON.stringify(compactEntities, null, 2)}\n\`\`\``,
    args.buildBaseUserMessage(args.text)
  ].join("\n\n");
}

function buildSeoUserMessage(args: {
  text: string;
  entities: ExtractionEntity[];
  relations: ExtractionRelation[];
  buildBaseUserMessage: (text: string) => string;
}): string {
  const compactEntities = compactEntitiesForContext(args.entities);
  const compactRelations = compactRelationsForContext(args.relations);
  return [
    `# Bereits extrahierte Entitäten\n\n\`\`\`json\n${JSON.stringify(compactEntities, null, 2)}\n\`\`\``,
    `# Bereits extrahierte Relationen\n\n\`\`\`json\n${JSON.stringify(compactRelations, null, 2)}\n\`\`\``,
    args.buildBaseUserMessage(args.text)
  ].join("\n\n");
}

function buildSitemapUserMessage(args: {
  meta: ExtractionMeta;
  entities: ExtractionEntity[];
  relations: ExtractionRelation[];
  seo: ExtractionSeo;
}): string {
  const compactEntities = compactEntitiesForContext(args.entities);
  const compactRelations = compactRelationsForContext(args.relations);
  return `# Bereits extrahierte Daten der analysierten Seite\n\nNutze ausschließlich diese strukturierten Daten als Grundlage für die Sitemap. Der Original-Text steht dir NICHT zur Verfügung.\n\n\`\`\`json\n${JSON.stringify(
    {
      meta: args.meta,
      entities: compactEntities,
      relations: compactRelations,
      seo: args.seo
    },
    null,
    2
  )}\n\`\`\``;
}

// ============================================================================
// Keyword Map-Reduce pipeline (keyword mode only)
// ----------------------------------------------------------------------------
// Phase 1 (5× parallel): per-URL light extraction (entities + relations + categories)
// Phase 2 (programmatic): merge entities/relations/categories across URLs
// Phase 3 (1× LLM): consolidated meta + schema + seo from merged structured data
// Phase 4 (1× LLM): sitemap from all structured data (existing prompt reused)
// ============================================================================

export type KeywordMapReduceSource = {
  position: number;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
  text: string;
};

export type KeywordMapReduceOptions = {
  keyword: string;
  sources: KeywordMapReduceSource[];
  routeVersion: string;
  routeLogPrefix: string;
  enableThinking?: boolean;
  onProgress?: (event: PipelineProgressEvent) => void;
};

type SlimExtractionEntity = Omit<ExtractionEntity, "mentions" | "definition_in_text"> & {
  mentions?: number;
  definition_in_text?: string | null;
};

type PerUrlExtraction = {
  schema: { categories: string[] };
  entities: SlimExtractionEntity[];
  relations: ExtractionRelation[];
};

type MapReduceFullSynthesisData = {
  meta: ExtractionMeta;
  schema: { categories: string[] };
  seo: ExtractionSeo;
  recommended_sitemap: RecommendedSitemap;
};

function mergeEntities(all: SlimExtractionEntity[]): ExtractionEntity[] {
  const groups = new Map<string, SlimExtractionEntity[]>();
  for (const e of all) {
    const key = e.canonical_name?.trim();
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  const merged: ExtractionEntity[] = [];
  for (const [canonical_name, entries] of groups) {
    // Slim entities may omit `mentions`; default each to 1 so the sum
    // reflects "seen in N sources" at minimum.
    const totalMentions = entries.reduce((s, e) => s + (e.mentions ?? 1), 0);
    const rep = entries.reduce((best, e) =>
      (e.mentions ?? 1) > (best.mentions ?? 1) ? e : best
    );
    const catCount = new Map<string, number>();
    for (const e of entries) {
      const c = e.category;
      if (!c) continue;
      catCount.set(c, (catCount.get(c) ?? 0) + 1);
    }
    const category =
      [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? rep.category;
    const roles = new Set(entries.map((e) => e.semantic_role));
    const semantic_role: ExtractionEntity["semantic_role"] = roles.has("pillar")
      ? "pillar"
      : roles.has("supporting")
        ? "supporting"
        : "peripheral";
    const definition_in_text =
      entries.find((e) => e.definition_in_text)?.definition_in_text ?? null;
    merged.push({
      name: rep.name,
      canonical_name,
      category,
      mentions: totalMentions,
      definition_in_text,
      semantic_role
    });
  }
  return merged.sort((a, b) => b.mentions - a.mentions);
}

function mergeRelations(all: ExtractionRelation[]): ExtractionRelation[] {
  const seen = new Map<string, ExtractionRelation>();
  for (const r of all) {
    const subj = r.subject?.trim();
    const pred = r.predicate?.trim();
    const obj = r.object?.trim();
    if (!subj || !pred || !obj) continue;
    const key = `${subj}|||${pred}|||${obj}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, r);
    } else if (!existing.evidence?.trim() && r.evidence?.trim()) {
      seen.set(key, r);
    }
  }
  return [...seen.values()];
}

function mergeCategories(all: string[]): string[] {
  const seen = new Map<string, string>();
  for (const c of all) {
    const t = c?.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  }
  return [...seen.values()];
}

function buildKeywordSynthesisUserMessage(args: {
  keyword: string;
  sources: KeywordMapReduceSource[];
  entities: ExtractionEntity[];
  relations: ExtractionRelation[];
  categories: string[];
}): string {
  const compactEntities = compactEntitiesForContext(args.entities);
  const compactRelations = compactRelationsForContext(args.relations);
  const sourceHeaders = args.sources.map((s) => ({
    position: s.position,
    finalUrl: s.finalUrl,
    title: s.title,
    description: s.description
  }));
  return [
    `# Keyword\n\n${args.keyword}`,
    `# SERP-Quellen (Headers)\n\n\`\`\`json\n${JSON.stringify(sourceHeaders, null, 2)}\n\`\`\``,
    `# Gemergte Kategorien (Phase 2)\n\n\`\`\`json\n${JSON.stringify(args.categories, null, 2)}\n\`\`\``,
    `# Gemergte Entities (Phase 2)\n\n\`\`\`json\n${JSON.stringify(compactEntities, null, 2)}\n\`\`\``,
    `# Gemergte Relations (Phase 2)\n\n\`\`\`json\n${JSON.stringify(compactRelations, null, 2)}\n\`\`\``
  ].join("\n\n");
}

async function runPerUrlLightExtraction(
  source: KeywordMapReduceSource,
  index: number,
  options: KeywordMapReduceOptions
): Promise<
  | { ok: true; data: PerUrlExtraction; metric: PipelineStepMetric }
  | { ok: false; error: string; metric: PipelineStepMetric }
> {
  const step = `mapreduce/1-extract-${index + 1}`;
  options.onProgress?.({ type: "step-start", step });
  const userMessage = [
    `# Keyword (gemeinsamer Topic der Top-SERP-Quellen)\n\n${options.keyword}`,
    `# Diese Quelle\n\nPosition: ${source.position}\nURL: ${source.finalUrl ?? "?"}\nTitle: ${source.title ?? "?"}\n\n## Body-Text\n\n${source.text}`
  ].join("\n\n");
  const result = await runLlmJsonCall<PerUrlExtraction>({
    systemPrompt: EXTRACTION_PROMPT_PER_URL_LIGHT,
    userMessage,
    routeVersion: options.routeVersion,
    routeLogPrefix: options.routeLogPrefix,
    maxTokens: TOKENS.mapreducePerUrl,
    // Phase 1 is mechanical entity/relation extraction — reasoning adds
    // latency without quality, so we hardcode `enableThinking: false`
    // (maps to OpenAI reasoning_effort=minimal). The "fast" hint routes
    // to OPENAI_MODEL_FAST (default gpt-5.4-mini).
    enableThinking: false,
    modelHint: "fast",
    stepLabel: step
  });
  if (!result.ok) {
    const error = String((result.body as Record<string, unknown>)?.error ?? "extract failed");
    const metric: PipelineStepMetric = {
      step,
      model: "",
      durationMs: 0,
      firstChunkMs: null,
      finishReason: null,
      usage: { error }
    };
    options.onProgress?.({ type: "step-failed", step, error });
    return { ok: false, error, metric };
  }
  const metric = metricFromCall(step, result);
  options.onProgress?.({ type: "step-done", metric });
  return { ok: true, data: result.data, metric };
}

/**
 * Map-Reduce pipeline for keyword mode:
 *   Phase 1: 5× parallel light extraction per SERP URL (entities + relations + categories)
 *   Phase 2: programmatic merge in JS (dedupe + union)
 *   Phase 3: LLM synthesis → consolidated meta + schema + seo
 *   Phase 4: LLM sitemap from structured data only
 */
export async function runKeywordMapReducePipeline(
  options: KeywordMapReduceOptions
): Promise<PipelineResult> {
  const startedAt = Date.now();
  const steps: PipelineStepMetric[] = [];

  // ---------- Phase 1: per-URL light extraction (parallel) ----------
  const perUrlResults = await Promise.all(
    options.sources.map((s, i) => runPerUrlLightExtraction(s, i, options))
  );
  for (const r of perUrlResults) steps.push(r.metric);
  const successful = perUrlResults
    .map((r, i) => (r.ok ? { source: options.sources[i], data: r.data } : null))
    .filter(
      (x): x is { source: KeywordMapReduceSource; data: PerUrlExtraction } => x !== null
    );

  if (successful.length === 0) {
    return failure(
      "mapreduce/1-extract",
      502,
      {
        _routeVersion: options.routeVersion,
        error: "All per-URL extractions failed",
        details: perUrlResults.map((r, i) => ({
          position: options.sources[i].position,
          finalUrl: options.sources[i].finalUrl,
          error: r.ok ? null : r.error
        }))
      },
      steps,
      startedAt
    );
  }

  // ---------- Phase 2: programmatic merge ----------
  const mergeStart = Date.now();
  const mergeStep = "mapreduce/2-merge";
  options.onProgress?.({ type: "step-start", step: mergeStep });
  const allEntities = successful.flatMap((s) => s.data.entities);
  const allRelations = successful.flatMap((s) => s.data.relations);
  const allCategories = successful.flatMap((s) => s.data.schema.categories);
  const mergedEntities = mergeEntities(allEntities);
  const mergedRelations = mergeRelations(allRelations);
  const mergedCategories = mergeCategories(allCategories);
  const mergeMetric: PipelineStepMetric = {
    step: mergeStep,
    model: "programmatic",
    durationMs: Date.now() - mergeStart,
    firstChunkMs: null,
    finishReason: "merge",
    usage: {
      sources_succeeded: successful.length,
      sources_total: options.sources.length,
      entities_before: allEntities.length,
      entities_after: mergedEntities.length,
      relations_before: allRelations.length,
      relations_after: mergedRelations.length,
      categories_before: allCategories.length,
      categories_after: mergedCategories.length
    }
  };
  steps.push(mergeMetric);
  options.onProgress?.({ type: "step-done", metric: mergeMetric });

  // ---------- Phase 3 + Phase 4 merged: meta + schema + seo + sitemap in one call ----------
  // Saves one HTTP round-trip + reasoning startup vs the previous two-call
  // synthesis→sitemap chain. The sitemap part of the prompt only needs
  // structured data which is already in the user message, so collapsing
  // them is loss-free.
  const stepFull = await executeStep<MapReduceFullSynthesisData>(
    options,
    steps,
    startedAt,
    "mapreduce/3-synthesis+sitemap",
    {
      systemPrompt: EXTRACTION_PROMPT_KEYWORD_FULL_SYNTHESIS,
      userMessage: buildKeywordSynthesisUserMessage({
        keyword: options.keyword,
        sources: options.sources,
        entities: mergedEntities,
        relations: mergedRelations,
        categories: mergedCategories
      }),
      routeVersion: options.routeVersion,
      routeLogPrefix: options.routeLogPrefix,
      maxTokens: TOKENS.mapreduceFullSynthesis,
      enableThinking: options.enableThinking,
      stepLabel: "mapreduce/3-synthesis+sitemap"
    }
  );
  if (!stepFull.ok) return stepFull;

  return {
    ok: true,
    mode: "mapreduce",
    extraction: {
      meta: stepFull.data.meta,
      schema: { categories: stepFull.data.schema.categories },
      entities: mergedEntities,
      relations: mergedRelations,
      seo: stepFull.data.seo,
      recommended_sitemap: stepFull.data.recommended_sitemap
    },
    steps,
    totalDurationMs: Date.now() - startedAt
  };
}
