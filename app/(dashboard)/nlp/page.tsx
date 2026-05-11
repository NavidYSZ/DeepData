"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionCard } from "@/components/dashboard/page-shell";

type AnnotateResponse = {
  documentSentiment?: { score: number; magnitude: number };
  language?: string;
  entities?: Array<{
    name: string;
    type: string;
    salience: number;
    metadata?: Record<string, string>;
    sentiment?: { score: number; magnitude: number };
    mentions?: Array<{ text: { content: string }; type: string }>;
  }>;
  categories?: Array<{ name: string; confidence: number }>;
  sentences?: Array<{ text: { content: string }; sentiment?: { score: number; magnitude: number } }>;
};

const SAMPLE = `Wir haben gestern Abend im neuen Restaurant in Berlin gegessen. Das Essen war fantastisch, der Service eher mittelmäßig. Trotzdem komme ich wieder, weil die Pizza wirklich exzellent war.`;

export default function NlpPage() {
  const [text, setText] = useState(SAMPLE);
  const [sentiment, setSentiment] = useState(true);
  const [entities, setEntities] = useState(true);
  const [entitySentiment, setEntitySentiment] = useState(false);
  const [classify, setClassify] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnnotateResponse | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/nlp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          features: { sentiment, entities, entitySentiment, classify }
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Request failed");
      } else {
        setResult(json);
      }
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Google Cloud NLP"
        description="Spielwiese für die Natural Language API – Sentiment, Entitäten, Kategorien. Text einfügen, Analyse starten."
      />

      <SectionCard title="Text">
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Text zum Analysieren eingeben…"
          />
          <div className="flex flex-wrap items-center gap-4">
            <Toggle label="Sentiment" checked={sentiment} onChange={setSentiment} />
            <Toggle label="Entitäten" checked={entities} onChange={setEntities} />
            <Toggle label="Entity Sentiment" checked={entitySentiment} onChange={setEntitySentiment} />
            <Toggle
              label="Kategorien (≥20 Wörter, EN)"
              checked={classify}
              onChange={setClassify}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={analyze} disabled={loading || !text.trim()}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Analysieren
            </Button>
            <span className="text-xs text-muted-foreground">{text.length} Zeichen</span>
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      </SectionCard>

      {result ? <Results result={result} /> : null}
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

function Results({ result }: { result: AnnotateResponse }) {
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
                Sätze
              </Label>
              <ul className="space-y-1.5">
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
          <ul className="space-y-2">
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
