"use client";

import { useState } from "react";
import { Loader2, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type ApiResponse = {
  extracted: Extracted;
  nlp: AnnotateResponse;
};

export default function NlpPage() {
  const [url, setUrl] = useState("");
  const [sentiment, setSentiment] = useState(true);
  const [entities, setEntities] = useState(true);
  const [entitySentiment, setEntitySentiment] = useState(false);
  const [classify, setClassify] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
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
        if (json?.extracted) setData({ extracted: json.extracted, nlp: {} });
      } else {
        setData(json);
      }
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !!url.trim() && /^https?:\/\//i.test(url.trim()) && !loading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Google Cloud NLP"
        description="URL eingeben → Body-Content wird extrahiert → Sentiment, Entitäten und Kategorien werden über die Google Natural Language API analysiert."
      />

      <SectionCard title="URL analysieren">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/blog/artikel"
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
              Analysieren
            </Button>
          </div>
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
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      </SectionCard>

      {data?.extracted ? <ExtractedCard extracted={data.extracted} /> : null}
      {data?.nlp && Object.keys(data.nlp).length > 0 ? <Results result={data.nlp} /> : null}
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
