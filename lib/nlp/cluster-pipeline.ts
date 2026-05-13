import {
  compactEntitiesForContext,
  compactRelationsForContext,
  mergeCategories,
  mergeEntities,
  mergeRelations,
  type KeywordMapReduceSource,
  type PerUrlExtraction,
  type PipelineProgressEvent,
  type PipelineStepMetric,
  type SlimExtractionEntity
} from "./pipeline";
import {
  EXTRACTION_PROMPT_CLUSTERS_FULL_SYNTHESIS,
  EXTRACTION_PROMPT_PER_URL_LIGHT
} from "./extraction-prompt";
import { runLlmJsonCall } from "./llm";
import type {
  ExtractionEntity,
  ExtractionMeta,
  ExtractionOutput,
  ExtractionRelation,
  ExtractionSeo,
  RecommendedSitemap
} from "./types";

// ============================================================================
// Multi-cluster analysis pipeline for /api/nlp/clusters/analyze
// ----------------------------------------------------------------------------
// Input: N user-selected SerpSubclusters, each with its already-fetched
//        SERP-top-N sources (URL/title/text per source) + the cluster's
//        top-demand keyword.
//
// Phase 1 (per cluster, parallel within cluster):
//   For each source → light entity+relation extraction (gpt-5.4-mini,
//   reasoning_effort=none, max_completion_tokens=32k).
//   Then programmatic per-cluster merge.
//
// Phase 2 (cross-cluster, programmatic):
//   Union all per-cluster entities/relations/categories with dedupe.
//
// Phase 3 (synthesis, single LLM call):
//   gpt-5.4 with reasoning_effort=medium, max_completion_tokens=96k.
//   Produces meta + schema + seo + recommended_sitemap for the
//   over-arching topical authority that spans all clusters together.
// ============================================================================

export type ClusterAnalysisInput = {
  subclusterId: string;
  name: string;
  topKeyword: string;
  sources: KeywordMapReduceSource[];
};

export type AnalyzedClusterSummary = {
  subclusterId: string;
  name: string;
  topKeyword: string;
  sourceCount: number;
  entityCount: number;
  relationCount: number;
  errored: boolean;
  errorReason: string | null;
};

export type ClustersAnalysisOptions = {
  clusters: ClusterAnalysisInput[];
  routeVersion: string;
  routeLogPrefix: string;
  onProgress?: (event: PipelineProgressEvent) => void;
};

export type ClustersAnalysisSuccess = {
  ok: true;
  extraction: ExtractionOutput;
  clusters: AnalyzedClusterSummary[];
  steps: PipelineStepMetric[];
  totalDurationMs: number;
};

export type ClustersAnalysisFailure = {
  ok: false;
  status: number;
  body: Record<string, unknown>;
  failedStep: string;
  stepsCompleted: PipelineStepMetric[];
  totalDurationMs: number;
};

export type ClustersAnalysisResult = ClustersAnalysisSuccess | ClustersAnalysisFailure;

const TOKENS = {
  perUrl: 32_000,
  synthesis: 96_000
} as const;

type FullSynthesisData = {
  meta: ExtractionMeta;
  schema: { categories: string[] };
  seo: ExtractionSeo;
  recommended_sitemap: RecommendedSitemap;
};

export async function runClustersAnalysisPipeline(
  options: ClustersAnalysisOptions
): Promise<ClustersAnalysisResult> {
  const startedAt = Date.now();
  const steps: PipelineStepMetric[] = [];

  // ---------- Per-cluster Phase 1 + per-cluster merge ----------
  type ClusterAccumulator = {
    input: ClusterAnalysisInput;
    entities: ExtractionEntity[];
    relations: ExtractionRelation[];
    categories: string[];
    errored: boolean;
    errorReason: string | null;
  };
  const accumulators: ClusterAccumulator[] = [];

  for (const cluster of options.clusters) {
    const clusterStartedAt = Date.now();
    const clusterStepLabel = `clusters/1-cluster-${cluster.subclusterId}`;
    options.onProgress?.({ type: "step-start", step: clusterStepLabel });

    const perUrlResults = await Promise.all(
      cluster.sources.map((s, i) =>
        runPerUrlForCluster(
          s,
          i,
          cluster,
          options.routeVersion,
          options.routeLogPrefix,
          options.onProgress
        )
      )
    );

    for (const r of perUrlResults) steps.push(r.metric);

    const successful = perUrlResults.filter(
      (r): r is { ok: true; data: PerUrlExtraction; metric: PipelineStepMetric } => r.ok
    );

    if (successful.length === 0) {
      accumulators.push({
        input: cluster,
        entities: [],
        relations: [],
        categories: [],
        errored: true,
        errorReason: "All per-URL extractions failed for this cluster"
      });
      options.onProgress?.({
        type: "step-failed",
        step: clusterStepLabel,
        error: "All per-URL extractions failed for this cluster"
      });
      continue;
    }

    const clusterEntities = mergeEntities(
      successful.flatMap((r) => r.data.entities as SlimExtractionEntity[])
    );
    const clusterRelations = mergeRelations(successful.flatMap((r) => r.data.relations));
    const clusterCategories = mergeCategories(
      successful.flatMap((r) => r.data.schema.categories)
    );

    const clusterMetric: PipelineStepMetric = {
      step: clusterStepLabel,
      model: "programmatic",
      durationMs: Date.now() - clusterStartedAt,
      firstChunkMs: null,
      finishReason: "merge",
      usage: {
        cluster_id: cluster.subclusterId,
        cluster_name: cluster.name,
        sources_succeeded: successful.length,
        sources_total: cluster.sources.length,
        entities: clusterEntities.length,
        relations: clusterRelations.length,
        categories: clusterCategories.length
      }
    };
    steps.push(clusterMetric);
    options.onProgress?.({ type: "step-done", metric: clusterMetric });

    accumulators.push({
      input: cluster,
      entities: clusterEntities,
      relations: clusterRelations,
      categories: clusterCategories,
      errored: false,
      errorReason: null
    });
  }

  const usableClusters = accumulators.filter((a) => !a.errored && a.entities.length > 0);

  if (usableClusters.length === 0) {
    return {
      ok: false,
      status: 502,
      body: {
        _routeVersion: options.routeVersion,
        error: "No clusters produced usable extractions",
        details: accumulators.map((a) => ({
          subclusterId: a.input.subclusterId,
          name: a.input.name,
          errored: a.errored,
          errorReason: a.errorReason,
          entityCount: a.entities.length
        }))
      },
      failedStep: "clusters/1-per-cluster",
      stepsCompleted: steps,
      totalDurationMs: Date.now() - startedAt
    };
  }

  // ---------- Phase 2: cross-cluster programmatic merge ----------
  const mergeStartedAt = Date.now();
  const mergeStep = "clusters/2-cross-cluster-merge";
  options.onProgress?.({ type: "step-start", step: mergeStep });
  const allEntities = usableClusters.flatMap((c) => c.entities);
  const allRelations = usableClusters.flatMap((c) => c.relations);
  const allCategories = usableClusters.flatMap((c) => c.categories);
  const mergedEntities = mergeEntities(allEntities);
  const mergedRelations = mergeRelations(allRelations);
  const mergedCategories = mergeCategories(allCategories);
  const mergeMetric: PipelineStepMetric = {
    step: mergeStep,
    model: "programmatic",
    durationMs: Date.now() - mergeStartedAt,
    firstChunkMs: null,
    finishReason: "merge",
    usage: {
      clusters_used: usableClusters.length,
      clusters_total: options.clusters.length,
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

  // ---------- Phase 3: synthesis + sitemap in one LLM call ----------
  const synthStep = "clusters/3-synthesis+sitemap";
  const synthUserMessage = buildClustersSynthesisUserMessage({
    clusters: usableClusters.map((c) => c.input),
    entities: mergedEntities,
    relations: mergedRelations,
    categories: mergedCategories
  });
  options.onProgress?.({ type: "step-start", step: synthStep });
  const synthResult = await runLlmJsonCall<FullSynthesisData>({
    systemPrompt: EXTRACTION_PROMPT_CLUSTERS_FULL_SYNTHESIS,
    userMessage: synthUserMessage,
    routeVersion: options.routeVersion,
    routeLogPrefix: options.routeLogPrefix,
    maxTokens: TOKENS.synthesis,
    enableThinking: true,
    stepLabel: synthStep
  });
  if (!synthResult.ok) {
    const errorMsg = String(
      (synthResult.body as Record<string, unknown>)?.error ?? "synthesis failed"
    );
    options.onProgress?.({ type: "step-failed", step: synthStep, error: errorMsg });
    return {
      ok: false,
      status: synthResult.status,
      body: synthResult.body,
      failedStep: synthStep,
      stepsCompleted: steps,
      totalDurationMs: Date.now() - startedAt
    };
  }
  const synthMetric: PipelineStepMetric = {
    step: synthStep,
    model: synthResult.model,
    durationMs: synthResult.durationMs,
    firstChunkMs: synthResult.firstChunkMs,
    finishReason: synthResult.finishReason,
    usage: synthResult.usage
  };
  steps.push(synthMetric);
  options.onProgress?.({ type: "step-done", metric: synthMetric });

  const summaries: AnalyzedClusterSummary[] = accumulators.map((a) => ({
    subclusterId: a.input.subclusterId,
    name: a.input.name,
    topKeyword: a.input.topKeyword,
    sourceCount: a.input.sources.length,
    entityCount: a.entities.length,
    relationCount: a.relations.length,
    errored: a.errored,
    errorReason: a.errorReason
  }));

  return {
    ok: true,
    extraction: {
      meta: synthResult.data.meta,
      schema: { categories: synthResult.data.schema.categories },
      entities: mergedEntities,
      relations: mergedRelations,
      seo: synthResult.data.seo,
      recommended_sitemap: synthResult.data.recommended_sitemap
    },
    clusters: summaries,
    steps,
    totalDurationMs: Date.now() - startedAt
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function runPerUrlForCluster(
  source: KeywordMapReduceSource,
  index: number,
  cluster: ClusterAnalysisInput,
  routeVersion: string,
  routeLogPrefix: string,
  onProgress?: (event: PipelineProgressEvent) => void
): Promise<
  | { ok: true; data: PerUrlExtraction; metric: PipelineStepMetric }
  | { ok: false; error: string; body: Record<string, unknown>; metric: PipelineStepMetric }
> {
  const step = `clusters/1-${cluster.subclusterId}-url-${index + 1}`;
  onProgress?.({ type: "step-start", step });
  const userMessage = [
    `# Keyword (Top-Demand für diesen Cluster)\n\n${cluster.topKeyword}`,
    `# Diese Quelle\n\nPosition: ${source.position}\nURL: ${source.finalUrl ?? "?"}\nTitle: ${source.title ?? "?"}\n\n## Body-Text\n\n${source.text}`
  ].join("\n\n");
  const result = await runLlmJsonCall<PerUrlExtraction>({
    systemPrompt: EXTRACTION_PROMPT_PER_URL_LIGHT,
    userMessage,
    routeVersion,
    routeLogPrefix,
    maxTokens: TOKENS.perUrl,
    enableThinking: false,
    modelHint: "fast",
    stepLabel: step
  });
  if (!result.ok) {
    const body = result.body as Record<string, unknown>;
    const error = String(body?.error ?? "extract failed");
    const metric: PipelineStepMetric = {
      step,
      model: String(body?.model ?? ""),
      durationMs: 0,
      firstChunkMs: null,
      finishReason: null,
      usage: { error, hint: body?.hint, responseBody: body?.responseBody }
    };
    onProgress?.({ type: "step-failed", step, error });
    return { ok: false, error, body, metric };
  }
  const metric: PipelineStepMetric = {
    step,
    model: result.model,
    durationMs: result.durationMs,
    firstChunkMs: result.firstChunkMs,
    finishReason: result.finishReason,
    usage: result.usage
  };
  onProgress?.({ type: "step-done", metric });
  return { ok: true, data: result.data, metric };
}

function buildClustersSynthesisUserMessage(args: {
  clusters: ClusterAnalysisInput[];
  entities: ExtractionEntity[];
  relations: ExtractionRelation[];
  categories: string[];
}): string {
  const clustersBlock = args.clusters.map((c) => ({
    cluster: c.name,
    topKeyword: c.topKeyword,
    sources: c.sources.map((s) => ({
      position: s.position,
      finalUrl: s.finalUrl,
      title: s.title,
      description: s.description
    }))
  }));
  const compactEntities = compactEntitiesForContext(args.entities);
  const compactRelations = compactRelationsForContext(args.relations);
  return [
    `# Ausgewählte Cluster (mit Top-Keyword + SERP-Quell-Headers)\n\n\`\`\`json\n${JSON.stringify(clustersBlock, null, 2)}\n\`\`\``,
    `# Gemergte Kategorien (Cross-Cluster)\n\n\`\`\`json\n${JSON.stringify(args.categories, null, 2)}\n\`\`\``,
    `# Gemergte Entities (Cross-Cluster)\n\n\`\`\`json\n${JSON.stringify(compactEntities, null, 2)}\n\`\`\``,
    `# Gemergte Relations (Cross-Cluster)\n\n\`\`\`json\n${JSON.stringify(compactRelations, null, 2)}\n\`\`\``
  ].join("\n\n");
}
