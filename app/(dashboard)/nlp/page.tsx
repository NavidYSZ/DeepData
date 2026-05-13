"use client";

import { useState, type ReactNode } from "react";
import {
  Loader2,
  Sparkles,
  ExternalLink,
  Brain,
  Cloud,
  Tag,
  FileText,
  Network,
  Map as MapIcon,
  CheckCircle2,
  ChevronRight,
  Zap,
  Layers,
  GitBranch
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, SectionCard } from "@/components/dashboard/page-shell";
import { EntityMap } from "@/components/entity-graph/entity-map";
import { EntityDetailPanel } from "@/components/nlp/entity-detail-panel";
import { SeoInsightsPanel } from "@/components/nlp/seo-insights-panel";
import { PageProfile } from "@/components/nlp/page-profile";
import { SitemapMap } from "@/components/sitemap-graph/sitemap-map";
import { SitemapFilterBar } from "@/components/sitemap-graph/sitemap-filter-bar";
import { SitemapDetailPanel } from "@/components/nlp/sitemap-detail-panel";
import type { ExtractionOutput, RecommendedPage } from "@/lib/nlp/types";

type AnnotateResponse = {
  documentSentiment?: { score: number; magnitude: number };
  language?: string;
  entities?: Array<{
    name: string;
    type: string;
    salience: number;
    metadata?: Record<string, string>;
    sentiment?: { score: number; magnitude: number };
  }>;
  categories?: Array<{ name: string; confidence: number }>;
  sentences?: Array<{ text: { content: string }; sentiment?: { score: number; magnitude: number } }>;
};

type Extracted = {
  finalUrl: string;
  title: string | null;
  description: string | null;
  text: string;
  totalChars: number;
  analyzedChars: number;
  truncated: boolean;
  source: "article" | "main" | "body";
};

type GoogleResponse = { extracted: Extracted; nlp: AnnotateResponse };

type KeywordSource = {
  position: number;
  serpUrl: string;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
  source: string | null;
  totalChars: number;
  usedChars: number;
  truncated: boolean;
  error: string | null;
};

type PipelineStepMetric = {
  step: string;
  model: string;
  durationMs: number;
  firstChunkMs: number | null;
  finishReason: string | null;
  usage: unknown;
};

type PipelineInfo = {
  mode: Pipeline;
  steps: PipelineStepMetric[];
  totalDurationMs: number;
  failedStep?: string;
};

type LlmResponse = {
  // Either an `extracted` (URL mode) or `sources` (keyword mode) is present.
  extracted?: Extracted;
  extraction: ExtractionOutput;
  model: string;
  durationMs: number;
  // Keyword-mode-only fields:
  mode?: "keyword";
  keyword?: string;
  sources?: KeywordSource[];
  analyzedChars?: number;
  serpDurationMs?: number;
  fetchDurationMs?: number;
  // Pipeline metadata (single-shot or multi-step):
  pipeline?: PipelineInfo;
};

type Mode = "google" | "llm";
type LlmInput = "url" | "keyword";
type Pipeline = "single" | "2step" | "3step" | "4step" | "mapreduce";

function formatLlmError(json: any): string {
  const parts: string[] = [json?.error ?? "LLM request failed"];
  if (json?.hint) parts.push(json.hint);
  if (json?.failedStep) parts.push(`failedStep: ${json.failedStep}`);
  if (json?.statusCode) parts.push(`HTTP ${json.statusCode}`);
  if (json?.model) parts.push(`model: ${json.model}`);
  if (json?.endpoint || json?.url) parts.push(`endpoint: ${json.endpoint ?? json.url}`);
  if (json?.baseURL) parts.push(`baseURL: ${json.baseURL}`);
  if (json?._routeVersion) parts.push(`route: ${json._routeVersion}`);
  if (json?.firstChunkMs != null) parts.push(`first chunk: ${json.firstChunkMs}ms`);
  if (json?.partial) parts.push(`partial: ${String(json.partial).slice(0, 200)}…`);
  if (json?.responseBody) {
    const rb =
      typeof json.responseBody === "string"
        ? json.responseBody
        : JSON.stringify(json.responseBody);
    parts.push(`response: ${rb}`);
  }
  return parts.join(" · ");
}

export default function NlpPage() {
  const [mode, setMode] = useState<Mode>("google");
  const [llmInput, setLlmInput] = useState<LlmInput>("url");
  const [pipeline, setPipeline] = useState<Pipeline>("single");
  const [url, setUrl] = useState("");
  const [sentiment, setSentiment] = useState(true);
  const [entities, setEntities] = useState(true);
  const [entitySentiment, setEntitySentiment] = useState(false);
  const [classify, setClassify] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleData, setGoogleData] = useState<GoogleResponse | null>(null);
  const [llmData, setLlmData] = useState<LlmResponse | null>(null);
  const [runningStep, setRunningStep] = useState<string | null>(null);

  function handleLlmInputChange(v: LlmInput) {
    setLlmInput(v);
    // mapreduce is keyword-only; snap back to "single" when switching to URL.
    if (v === "url" && pipeline === "mapreduce") setPipeline("single");
  }

  async function analyze() {
    setLoading(true);
    setError(null);
    setGoogleData(null);
    setLlmData(null);
    setRunningStep(null);
    try {
      if (mode === "google") {
        const res = await fetch("/api/nlp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            features: { sentiment, entities, entitySentiment, classify }
          })
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? "Request failed");
          if (json?.extracted) setGoogleData({ extracted: json.extracted, nlp: {} });
        } else {
          setGoogleData(json);
        }
      } else if (llmInput === "keyword") {
        await analyzeKeywordStream();
      } else {
        const res = await fetch("/api/nlp/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), pipeline })
        });
        const json = await res.json();
        if (!res.ok) {
          setError(formatLlmError(json));
          if (json?.extracted) {
            setLlmData({
              extracted: json.extracted,
              extraction: null as any,
              model: "",
              durationMs: 0
            });
          }
        } else {
          setLlmData(json);
        }
      }
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setLoading(false);
      setRunningStep(null);
    }
  }

  async function analyzeKeywordStream() {
    const res = await fetch("/api/nlp/keyword", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: url.trim(), pipeline })
    });

    // Pre-stream errors (auth / validation / env) come back as plain JSON.
    if (!res.ok || !res.body) {
      try {
        const json = await res.json();
        setError(formatLlmError(json));
      } catch {
        setError(`HTTP ${res.status}`);
      }
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acc: Partial<LlmResponse> = {
      mode: "keyword",
      keyword: url.trim(),
      pipeline: { mode: pipeline, steps: [], totalDurationMs: 0 }
    };
    const flush = () => setLlmData({ ...(acc as LlmResponse) });
    flush();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const segments = buffer.split("\n\n");
      buffer = segments.pop() ?? "";

      for (const seg of segments) {
        if (!seg.trim() || seg.startsWith(":")) continue;
        const lines = seg.split("\n");
        let eventName = "message";
        let dataStr = "";
        for (const line of lines) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
        }
        if (!dataStr) continue;
        let data: any;
        try {
          data = JSON.parse(dataStr);
        } catch {
          continue;
        }

        switch (eventName) {
          case "serp-done":
            acc.serpDurationMs = data.durationMs;
            flush();
            break;
          case "crawl-done":
            acc.sources = data.sources;
            acc.fetchDurationMs = data.durationMs;
            flush();
            break;
          case "pipeline-start":
            acc.keyword = data.keyword;
            acc.analyzedChars = data.analyzedChars;
            if (acc.pipeline) {
              acc.pipeline = { ...acc.pipeline, mode: data.mode };
            }
            flush();
            break;
          case "step-start":
            setRunningStep(data.step);
            break;
          case "step-done":
            if (acc.pipeline) {
              acc.pipeline = {
                ...acc.pipeline,
                steps: [...acc.pipeline.steps, data.metric]
              };
            }
            setRunningStep(null);
            flush();
            break;
          case "step-failed":
            if (acc.pipeline) {
              acc.pipeline = { ...acc.pipeline, failedStep: data.step };
            }
            setRunningStep(null);
            flush();
            break;
          case "result":
            acc = data;
            flush();
            break;
          case "error":
            setError(formatLlmError(data));
            if (data?.sources) {
              acc.sources = data.sources;
              flush();
            }
            break;
        }
      }
    }
  }

  const inputValue = url.trim();
  const needsUrl = mode === "google" || (mode === "llm" && llmInput === "url");
  const canSubmit =
    !!inputValue &&
    (needsUrl ? /^https?:\/\//i.test(inputValue) : inputValue.length >= 2) &&
    !loading;

  const currentExtracted =
    mode === "google" ? googleData?.extracted : llmData?.extracted;
  const keywordSources = mode === "llm" ? llmData?.sources : undefined;
  const isKeywordResult = mode === "llm" && llmData?.mode === "keyword";

  return (
    <div className="space-y-6">
      <PageHeader
        title="NLP Playground"
        description={
          mode === "google"
            ? "URL eingeben → Body-Content wird extrahiert → Sentiment, Entitäten und Kategorien über die Google Natural Language API."
            : llmInput === "keyword"
              ? "Keyword eingeben → Top-5 SERP-URLs werden gefetched + bereinigt → DeepSeek macht eine konsolidierte 6-Phasen-Analyse über alle Quellen."
              : "URL eingeben → Body-Content wird extrahiert → DeepSeek führt 6-Phasen-Semantik-Extraktion durch (Entitäten, Relationen, SEO-Signale, Sitemap)."
        }
        actions={
          <ModeSwitch mode={mode} onChange={setMode} disabled={loading} />
        }
      />

      <SectionCard
        title={
          mode === "llm" && llmInput === "keyword"
            ? "Keyword analysieren"
            : "URL analysieren"
        }
      >
        <div className="space-y-3">
          {mode === "llm" ? (
            <div className="flex flex-wrap items-center gap-2">
              <LlmInputSwitch
                value={llmInput}
                onChange={handleLlmInputChange}
                disabled={loading}
              />
              <PipelineSelector
                value={pipeline}
                onChange={setPipeline}
                disabled={loading}
                inputMode={llmInput}
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type={mode === "llm" && llmInput === "keyword" ? "text" : "url"}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                mode === "llm" && llmInput === "keyword"
                  ? "z.B. zahnimplantat tornesch"
                  : "https://example.com/blog/artikel"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) analyze();
              }}
              className="flex-1"
            />
            <Button onClick={analyze} disabled={!canSubmit}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {mode === "google"
                ? "Analysieren"
                : llmInput === "keyword"
                  ? "SERP analysieren"
                  : "Semantik extrahieren"}
            </Button>
          </div>
          {mode === "google" ? (
            <div className="flex flex-wrap items-center gap-4">
              <Toggle label="Sentiment" checked={sentiment} onChange={setSentiment} />
              <Toggle label="Entitäten" checked={entities} onChange={setEntities} />
              <Toggle
                label="Entity Sentiment"
                checked={entitySentiment}
                onChange={setEntitySentiment}
              />
              <Toggle
                label="Kategorien (≥20 Wörter, EN)"
                checked={classify}
                onChange={setClassify}
              />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Modell:{" "}
              <span className="font-mono text-foreground">
                {llmData?.model || "deepseek-v4-pro"}
              </span>
              {" · "}konfigurierbar über{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">DEEPSEEK_MODEL</code>
              {llmInput === "keyword" ? (
                <span className="ml-2 text-amber-700 dark:text-amber-300">
                  · Keyword-Modus kann 60–120s dauern (SERP-Fetch + 5 Page-Crawls + LLM).
                </span>
              ) : null}
            </div>
          )}
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      </SectionCard>

      {currentExtracted ? <ExtractedCard extracted={currentExtracted} /> : null}

      {isKeywordResult && keywordSources ? (
        <KeywordSourcesCard
          keyword={llmData?.keyword ?? ""}
          sources={keywordSources}
          analyzedChars={llmData?.analyzedChars ?? 0}
          serpDurationMs={llmData?.serpDurationMs ?? 0}
          fetchDurationMs={llmData?.fetchDurationMs ?? 0}
        />
      ) : null}

      {mode === "google" && googleData?.nlp && Object.keys(googleData.nlp).length > 0 ? (
        <GoogleResults result={googleData.nlp} />
      ) : null}

      {(() => {
        const isKeyword = mode === "llm" && llmInput === "keyword";
        if (isKeyword && (loading || llmData?.pipeline)) {
          return (
            <PipelineStepsCard
              pipeline={
                llmData?.pipeline ?? {
                  mode: pipeline,
                  steps: [],
                  totalDurationMs: 0
                }
              }
              runningStep={runningStep}
            />
          );
        }
        if (
          mode === "llm" &&
          llmData?.pipeline &&
          llmData.pipeline.mode !== "single"
        ) {
          return <PipelineStepsCard pipeline={llmData.pipeline} runningStep={null} />;
        }
        return null;
      })()}

      {mode === "llm" && llmData?.extraction ? (
        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList>
            <TabsTrigger value="profile" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Page Profile
            </TabsTrigger>
            <TabsTrigger value="entities" className="gap-1.5">
              <Network className="h-3.5 w-3.5" />
              Entity Map
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {llmData.extraction.entities.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="sitemap" className="gap-1.5">
              <MapIcon className="h-3.5 w-3.5" />
              Sitemap Map
              {llmData.extraction.recommended_sitemap?.pages?.length ? (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {llmData.extraction.recommended_sitemap.pages.length}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <SectionCard title="Page Profile">
              <PageProfile data={llmData.extraction} />
            </SectionCard>
          </TabsContent>

          <TabsContent value="entities">
            <SectionCard
              title="Entity Map"
              description={`${llmData.extraction.entities.length} Entities · ${llmData.extraction.relations.length} Relationen · in ${(
                llmData.durationMs / 1000
              ).toFixed(1)}s extrahiert. Pillar-Entities sind gelb umrandet.`}
              contentClassName="!p-0"
            >
              <EntityMap
                data={llmData.extraction}
                renderSidebar={({ selectedEntity, onSelectEntity, categoryColors }) => ({
                  collapsedLabel: selectedEntity?.canonical_name ?? "Insights",
                  headerTitle: selectedEntity?.canonical_name ?? "SEO Insights",
                  headerIcon: selectedEntity ? (
                    <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ),
                  body: selectedEntity ? (
                    <EntityDetailPanel
                      entity={selectedEntity}
                      color={categoryColors[selectedEntity.category] ?? "#64748b"}
                      relations={llmData.extraction.relations}
                      onSelectEntity={onSelectEntity}
                    />
                  ) : (
                    <SeoInsightsPanel data={llmData.extraction} />
                  ),
                  showCloseButton: selectedEntity !== null
                })}
              />
            </SectionCard>
          </TabsContent>

          <TabsContent value="sitemap">
            <SitemapTab extraction={llmData.extraction} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

function SitemapTab({ extraction }: { extraction: ExtractionOutput }) {
  const sitemap = extraction.recommended_sitemap;
  const pages = sitemap?.pages ?? [];

  if (!sitemap || pages.length === 0) {
    return (
      <SectionCard title="Empfohlene Sitemap">
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <MapIcon className="h-10 w-10 text-muted-foreground/40" />
          <div className="space-y-1">
            <div className="text-sm font-medium">Noch keine Sitemap-Empfehlung verfügbar</div>
            <p className="max-w-md text-xs text-muted-foreground">
              Diese Analyse enthält keine <code>recommended_sitemap</code>. Vermutlich wurde die URL
              mit einem älteren Backend-Stand analysiert oder die LLM hat Phase 6 weggelassen — bitte
              oben erneut auf <em>Semantik extrahieren</em> klicken.
            </p>
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Empfohlene Sitemap"
      description="Top-Down-Baum: Pillar → Cluster → Service-Pages. Status farbcodiert. Klick auf eine Page für Details."
      contentClassName="!p-3"
    >
      <SitemapMap
        sitemap={sitemap}
        renderFilterBar={(args) => <SitemapFilterBar sitemap={sitemap} {...args} />}
        renderSidebar={({ selectedPage, onSelectPage }) => ({
          collapsedLabel: selectedPage?.h1 ?? "Sitemap",
          headerTitle: selectedPage?.h1 ?? "Sitemap-Übersicht",
          headerIcon: selectedPage ? (
            <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <MapIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          ),
          body: selectedPage ? (
            <SitemapDetailPanel
              page={selectedPage}
              allPages={pages}
              entities={extraction.entities}
              onSelectPage={onSelectPage}
            />
          ) : (
            <SitemapOverviewPanel pages={pages} />
          ),
          showCloseButton: selectedPage !== null
        })}
      />
    </SectionCard>
  );
}

function SitemapOverviewPanel({ pages }: { pages: RecommendedPage[] }) {
  const total = pages.length;
  const covered = pages.filter((p) => p.status === "covered_on_page").length;
  const gap = pages.filter((p) => p.status === "content_gap").length;
  const likely = pages.filter((p) => p.status === "likely_exists_elsewhere").length;
  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Empfohlene Site-Struktur. Klick auf eine Page-Card im Graph, um Details (H1, Slug,
        Target-Queries, abgedeckte Entities, Begründung) zu sehen.
      </p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-md border bg-background/60 p-2">
          <div className="text-lg font-bold">{total}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Pages gesamt</div>
        </div>
        <div className="rounded-md border border-emerald-300 bg-emerald-50/60 p-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{covered}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">auf dieser Seite</div>
        </div>
        <div className="rounded-md border border-amber-300 bg-amber-50/60 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{gap}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Content Gaps</div>
        </div>
        <div className="rounded-md border bg-zinc-50/60 p-2 dark:bg-zinc-800/40">
          <div className="text-lg font-bold text-zinc-600 dark:text-zinc-300">{likely}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">likely exists</div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground italic">
        Slugs und H1s sind LLM-Empfehlungen. Crawl-Verifikation, ob diese URLs real existieren, ist
        nicht Teil dieser Version.
      </p>
    </div>
  );
}

function LlmInputSwitch({
  value,
  onChange,
  disabled
}: {
  value: LlmInput;
  onChange: (v: LlmInput) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border bg-background text-xs">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("url")}
        className={`inline-flex items-center gap-1.5 px-3 py-1 transition ${
          value === "url"
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted/50 text-foreground"
        } disabled:opacity-50`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        URL
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("keyword")}
        className={`inline-flex items-center gap-1.5 border-l px-3 py-1 transition ${
          value === "keyword"
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted/50 text-foreground"
        } disabled:opacity-50`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Keyword (Top-5 SERP)
      </button>
    </div>
  );
}

const PIPELINE_OPTIONS: Array<{
  value: Pipeline;
  label: string;
  hint: string;
  icon: ReactNode;
  availableIn?: LlmInput[];
}> = [
  {
    value: "single",
    label: "Single",
    hint: "1 LLM-Call, alle 6 Phasen",
    icon: <Zap className="h-3.5 w-3.5" />
  },
  {
    value: "2step",
    label: "2-Step",
    hint: "Phasen 1-5, dann Sitemap",
    icon: <Layers className="h-3.5 w-3.5" />
  },
  {
    value: "3step",
    label: "3-Step",
    hint: "KG, SEO, Sitemap (+Reasoning)",
    icon: <Layers className="h-3.5 w-3.5" />
  },
  {
    value: "4step",
    label: "4-Step",
    hint: "Entities, Relations, SEO, Sitemap (+Reasoning)",
    icon: <Layers className="h-3.5 w-3.5" />
  },
  {
    value: "mapreduce",
    label: "Map-Reduce",
    hint: "Pro-URL parallel extrahieren, dann konsolidieren (keyword-only, schnellster Modus)",
    icon: <GitBranch className="h-3.5 w-3.5" />,
    availableIn: ["keyword"]
  }
];

function PipelineSelector({
  value,
  onChange,
  disabled,
  inputMode
}: {
  value: Pipeline;
  onChange: (v: Pipeline) => void;
  disabled?: boolean;
  inputMode: LlmInput;
}) {
  const visibleOptions = PIPELINE_OPTIONS.filter(
    (opt) => !opt.availableIn || opt.availableIn.includes(inputMode)
  );
  return (
    <div
      className="inline-flex overflow-hidden rounded-md border bg-background text-xs"
      role="group"
      aria-label="Pipeline-Modus"
    >
      {visibleOptions.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          title={opt.hint}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 transition ${
            i > 0 ? "border-l" : ""
          } ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted/50 text-foreground"
          } disabled:opacity-50`}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function PipelineStepsCard({
  pipeline,
  runningStep
}: {
  pipeline: PipelineInfo;
  runningStep: string | null;
}) {
  const stepCount = pipeline.steps.length;
  const expectedCount =
    pipeline.mode === "2step"
      ? 2
      : pipeline.mode === "3step"
        ? 3
        : pipeline.mode === "4step"
          ? 4
          : pipeline.mode === "mapreduce"
            ? 7 // 5 per-URL + merge + synthesis+sitemap (combined)
            : 1;
  const completedAll = !pipeline.failedStep && stepCount === expectedCount;
  const totalDurationLabel = pipeline.totalDurationMs
    ? `${(pipeline.totalDurationMs / 1000).toFixed(1)}s total`
    : "läuft…";
  const showRunning =
    runningStep && !pipeline.steps.some((s) => s.step === runningStep);
  return (
    <SectionCard
      title={`Pipeline · ${pipeline.mode.toUpperCase()}`}
      description={`${stepCount}/${expectedCount} Steps · ${totalDurationLabel}${
        pipeline.failedStep
          ? ` · Fehler in ${pipeline.failedStep}`
          : completedAll
            ? " · Reasoning aktiviert"
            : runningStep
              ? ` · läuft: ${runningStep}`
              : ""
      }`}
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        {pipeline.steps.map((s, i) => (
          <li key={s.step} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                pipeline.failedStep === s.step
                  ? "border-destructive/60 bg-destructive/10 text-destructive"
                  : "border-emerald-300 bg-emerald-50/60 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="font-mono">{s.step}</span>
              <span className="text-muted-foreground">
                {(s.durationMs / 1000).toFixed(1)}s
              </span>
              {s.finishReason && s.finishReason !== "stop" && s.finishReason !== "merge" ? (
                <Badge variant="outline" className="text-[10px]">
                  {s.finishReason}
                </Badge>
              ) : null}
            </span>
            {i < pipeline.steps.length - 1 || showRunning ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ) : null}
          </li>
        ))}
        {showRunning ? (
          <li className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="font-mono">{runningStep}</span>
            </span>
          </li>
        ) : null}
        {pipeline.failedStep ? (
          <li className="text-xs text-destructive">
            ✗ Pipeline abgebrochen bei <code className="font-mono">{pipeline.failedStep}</code>
          </li>
        ) : null}
      </ol>
    </SectionCard>
  );
}

function KeywordSourcesCard({
  keyword,
  sources,
  analyzedChars,
  serpDurationMs,
  fetchDurationMs
}: {
  keyword: string;
  sources: KeywordSource[];
  analyzedChars: number;
  serpDurationMs: number;
  fetchDurationMs: number;
}) {
  const usable = sources.filter((s) => !s.error);
  return (
    <SectionCard
      title={`SERP-Quellen für "${keyword}"`}
      description={`${usable.length}/${sources.length} Top-Ergebnisse nutzbar · ${(serpDurationMs / 1000).toFixed(1)}s SERP-Fetch · ${(fetchDurationMs / 1000).toFixed(1)}s Crawl · ${analyzedChars.toLocaleString("de-DE")} Zeichen analysiert`}
    >
      <ol className="space-y-2">
        {sources.map((s) => (
          <li
            key={`${s.position}-${s.serpUrl}`}
            className="rounded-md border bg-background/60 p-3 text-sm"
          >
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                #{s.position}
              </span>
              <a
                href={s.finalUrl ?? s.serpUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                {s.finalUrl ?? s.serpUrl}
              </a>
              {s.error ? (
                <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                  {s.error}
                </Badge>
              ) : (
                <Badge variant="outline">
                  {s.usedChars.toLocaleString("de-DE")} / {s.totalChars.toLocaleString("de-DE")} Zeichen
                  {s.truncated ? " · gekürzt" : ""}
                </Badge>
              )}
            </div>
            {s.title ? (
              <div className="mt-1 font-medium">{s.title}</div>
            ) : null}
            {s.description ? (
              <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                {s.description}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

function ModeSwitch({
  mode,
  onChange,
  disabled
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-md border bg-card px-3 py-1.5 text-sm">
      <span
        className={`inline-flex items-center gap-1.5 ${mode === "google" ? "text-foreground" : "text-muted-foreground"}`}
      >
        <Cloud className="h-3.5 w-3.5" />
        Google
      </span>
      <Switch
        checked={mode === "llm"}
        onCheckedChange={(v) => onChange(v ? "llm" : "google")}
        disabled={disabled}
        aria-label="Modus wechseln"
      />
      <span
        className={`inline-flex items-center gap-1.5 ${mode === "llm" ? "text-foreground" : "text-muted-foreground"}`}
      >
        <Brain className="h-3.5 w-3.5" />
        LLM
      </span>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span>{label}</span>
    </label>
  );
}

function ExtractedCard({ extracted }: { extracted: Extracted }) {
  return (
    <SectionCard title="Extrahierter Inhalt">
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <a
              href={extracted.finalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary underline"
            >
              {extracted.finalUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {extracted.title ? (
            <div className="text-base font-medium">{extracted.title}</div>
          ) : null}
          {extracted.description ? (
            <div className="text-sm text-muted-foreground">{extracted.description}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">Quelle: &lt;{extracted.source}&gt;</Badge>
          <Badge variant="outline">{extracted.totalChars.toLocaleString()} Zeichen extrahiert</Badge>
          {extracted.truncated ? (
            <Badge variant="secondary">
              auf {extracted.analyzedChars.toLocaleString()} Zeichen gekürzt
            </Badge>
          ) : null}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Text-Vorschau anzeigen
          </summary>
          <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
            {extracted.text.slice(0, 4000)}
            {extracted.text.length > 4000 ? "\n\n…" : ""}
          </div>
        </details>
      </div>
    </SectionCard>
  );
}

function GoogleResults({ result }: { result: AnnotateResponse }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {result.documentSentiment ? (
        <SectionCard
          title="Dokument-Sentiment"
          description={`Sprache: ${result.language ?? "–"}`}
        >
          <SentimentBlock
            score={result.documentSentiment.score}
            magnitude={result.documentSentiment.magnitude}
          />
          {result.sentences?.length ? (
            <div className="mt-4 space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Sätze ({result.sentences.length})
              </Label>
              <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-2">
                {result.sentences.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <SentimentDot score={s.sentiment?.score ?? 0} />
                    <span className="flex-1">{s.text.content}</span>
                    {s.sentiment ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {s.sentiment.score.toFixed(2)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {result.entities?.length ? (
        <SectionCard title="Entitäten" description={`${result.entities.length} erkannt`}>
          <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-2">
            {result.entities
              .slice()
              .sort((a, b) => b.salience - a.salience)
              .map((e, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{e.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {e.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    salience {(e.salience * 100).toFixed(1)}%
                  </span>
                  {e.sentiment && (e.sentiment.score !== 0 || e.sentiment.magnitude !== 0) ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <SentimentDot score={e.sentiment.score} />
                      {e.sentiment.score.toFixed(2)}
                    </span>
                  ) : null}
                  {e.metadata?.wikipedia_url ? (
                    <a
                      href={e.metadata.wikipedia_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                    >
                      wiki
                    </a>
                  ) : null}
                </li>
              ))}
          </ul>
        </SectionCard>
      ) : null}

      {result.categories?.length ? (
        <SectionCard title="Kategorien" className="md:col-span-2">
          <ul className="space-y-1.5">
            {result.categories.map((c, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(c.confidence * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}

function SentimentBlock({ score, magnitude }: { score: number; magnitude: number }) {
  const label = score > 0.25 ? "Positiv" : score < -0.25 ? "Negativ" : "Neutral";
  const tone =
    score > 0.25
      ? "text-emerald-600"
      : score < -0.25
        ? "text-rose-600"
        : "text-muted-foreground";
  return (
    <div className="flex items-baseline gap-4">
      <div>
        <div className={`text-3xl font-semibold ${tone}`}>{score.toFixed(2)}</div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Score</div>
      </div>
      <div>
        <div className="text-3xl font-semibold">{magnitude.toFixed(2)}</div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Magnitude</div>
      </div>
      <Badge variant="secondary" className="ml-auto">
        {label}
      </Badge>
    </div>
  );
}

function SentimentDot({ score }: { score: number }) {
  const color =
    score > 0.25 ? "bg-emerald-500" : score < -0.25 ? "bg-rose-500" : "bg-muted-foreground/50";
  return <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}
