import porterStemmerDe from "natural/lib/natural/stemmers/porter_stemmer_de";

const stopwords = new Set([
  "der",
  "die",
  "das",
  "ein",
  "eine",
  "einer",
  "eines",
  "und",
  "oder",
  "zu",
  "im",
  "in",
  "am",
  "auf",
  "für",
  "mit",
  "ohne",
  "von",
  "vom",
  "beim",
  "aus",
  "an",
  "als",
  "ist",
  "sind",
  "war",
  "waren",
  "wie",
  "wo",
  "was",
  "wer",
  "dass",
  "so",
  "bei",
  "zum",
  "zur"
]);

export type NormalizedKeyword = {
  kwNorm: string;
  kwSig: string;
  tokens: string[];
};

export function normalizeKeyword(input: string): NormalizedKeyword | null {
  if (!input) return null;
  const nfkc = input.normalize("NFKC").toLowerCase().trim();
  if (!nfkc) return null;
  const cleaned = nfkc.replace(/[^a-z0-9äöüß\s\-/]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const tokens = cleaned
    .split(/[\s\-/]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !stopwords.has(t));
  if (tokens.length === 0) return null;
  const stemmed = tokens.map((t) => porterStemmerDe.stem(t));
  const kwNorm = cleaned;
  const kwSig = stemmed.slice().sort().join(" ");
  return { kwNorm, kwSig, tokens: stemmed };
}
