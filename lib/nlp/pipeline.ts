import {
  EXTRACTION_PROMPT_ENTITIES,
  EXTRACTION_PROMPT_KG,
  EXTRACTION_PROMPT_KG_AND_SEO,
  EXTRACTION_PROMPT_RELATIONS,
  EXTRACTION_PROMPT_SEO,
  EXTRACTION_PROMPT_SITEMAP
} from "./extraction-prompt";
import { runDeepSeekJsonCall } from "./deepseek";
import type {
  ExtractionEntity,
  ExtractionMeta,
  ExtractionOutput,
  ExtractionRelation,
  ExtractionSeo,
  RecommendedSitemap
} from "./types";

export type PipelineMode = "single" | "2step" | "3step" | "4step";

export const PIPELINE_MODES: PipelineMode[] = ["single", "2step", "3step", "4step"];

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
};

// Per-step max output tokens. DeepSeek v4-pro supports up to 380k output
// (verified by user) and max_tokens covers reasoning + content together,
// so every step gets the full budget — reasoning never starves content.
const TOKENS = {
  entities: 380_000,
  relations: 380_000,
  seo: 380_000,
  kg: 380_000,
  kgAndSeo: 380_000,
  sitemap: 380_000
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

  const stepA = await runDeepSeekJsonCall<Step1KGAndSeoData>({
    systemPrompt: EXTRACTION_PROMPT_KG_AND_SEO,
    userMessage: buildUserMessage(options.text),
    routeVersion: options.routeVersion,
    routeLogPrefix: options.routeLogPrefix,
    maxTokens: TOKENS.kgAndSeo,
    enableThinking: options.enableThinking,
    stepLabel: "2step/A-kg+seo"
  });
  if (!stepA.ok) return failure("2step/A-kg+seo", stepA.status, stepA.body, steps, startedAt);
  steps.push(metricFromCall("2step/A-kg+seo", stepA));

  const stepB = await runDeepSeekJsonCall<StepSitemapData>({
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
  });
  if (!stepB.ok) return failure("2step/B-sitemap", stepB.status, stepB.body, steps, startedAt);
  steps.push(metricFromCall("2step/B-sitemap", stepB));

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

  const stepA = await runDeepSeekJsonCall<Step1KGData>({
    systemPrompt: EXTRACTION_PROMPT_KG,
    userMessage: buildUserMessage(options.text),
    routeVersion: options.routeVersion,
    routeLogPrefix: options.routeLogPrefix,
    maxTokens: TOKENS.kg,
    enableThinking: options.enableThinking,
    stepLabel: "3step/A-kg"
  });
  if (!stepA.ok) return failure("3step/A-kg", stepA.status, stepA.body, steps, startedAt);
  steps.push(metricFromCall("3step/A-kg", stepA));

  const stepB = await runDeepSeekJsonCall<StepSeoData>({
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
  if (!stepB.ok) return failure("3step/B-seo", stepB.status, stepB.body, steps, startedAt);
  steps.push(metricFromCall("3step/B-seo", stepB));

  const stepC = await runDeepSeekJsonCall<StepSitemapData>({
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
  });
  if (!stepC.ok) return failure("3step/C-sitemap", stepC.status, stepC.body, steps, startedAt);
  steps.push(metricFromCall("3step/C-sitemap", stepC));

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

  const stepA = await runDeepSeekJsonCall<Step1EntitiesData>({
    systemPrompt: EXTRACTION_PROMPT_ENTITIES,
    userMessage: buildUserMessage(options.text),
    routeVersion: options.routeVersion,
    routeLogPrefix: options.routeLogPrefix,
    maxTokens: TOKENS.entities,
    enableThinking: options.enableThinking,
    stepLabel: "4step/A-entities"
  });
  if (!stepA.ok) return failure("4step/A-entities", stepA.status, stepA.body, steps, startedAt);
  steps.push(metricFromCall("4step/A-entities", stepA));

  const stepB = await runDeepSeekJsonCall<StepRelationsData>({
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
  });
  if (!stepB.ok) return failure("4step/B-relations", stepB.status, stepB.body, steps, startedAt);
  steps.push(metricFromCall("4step/B-relations", stepB));

  const stepC = await runDeepSeekJsonCall<StepSeoData>({
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
  if (!stepC.ok) return failure("4step/C-seo", stepC.status, stepC.body, steps, startedAt);
  steps.push(metricFromCall("4step/C-seo", stepC));

  const stepD = await runDeepSeekJsonCall<StepSitemapData>({
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
  });
  if (!stepD.ok) return failure("4step/D-sitemap", stepD.status, stepD.body, steps, startedAt);
  steps.push(metricFromCall("4step/D-sitemap", stepD));

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
  mode: Exclude<PipelineMode, "single">,
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
