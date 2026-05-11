import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { fetchAndExtract } from "@/lib/nlp/extract";

const bodySchema = z.object({
  url: z.string().url(),
  features: z
    .object({
      sentiment: z.boolean().optional(),
      entities: z.boolean().optional(),
      entitySentiment: z.boolean().optional(),
      classify: z.boolean().optional()
    })
    .optional()
});

const MAX_NLP_CHARS = 20_000;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_NLP_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing GOOGLE_NLP_API_KEY. Enable the Natural Language API in Google Cloud and set GOOGLE_NLP_API_KEY in your .env.local."
      },
      { status: 500 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let extracted;
  try {
    extracted = await fetchAndExtract(body.url);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to fetch URL" },
      { status: 422 }
    );
  }

  if (extracted.text.length < 50) {
    return NextResponse.json(
      {
        error:
          "Extracted body content is too short (<50 chars). The page may require JavaScript, be paywalled, or block bots.",
        extracted
      },
      { status: 422 }
    );
  }

  const features = {
    sentiment: true,
    entities: true,
    entitySentiment: false,
    classify: false,
    ...(body.features ?? {})
  };

  const truncated = extracted.text.slice(0, MAX_NLP_CHARS);

  const payload = {
    document: { type: "PLAIN_TEXT", content: truncated },
    features: {
      extractSyntax: false,
      extractEntities: !!features.entities,
      extractDocumentSentiment: !!features.sentiment,
      extractEntitySentiment: !!features.entitySentiment,
      classifyText: !!features.classify
    },
    encodingType: "UTF8"
  };

  const url = `https://language.googleapis.com/v1/documents:annotateText?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const nlp = await res.json();
    if (!res.ok) {
      const message = nlp?.error?.message ?? "Google NLP request failed";
      return NextResponse.json(
        { error: message, status: res.status, extracted },
        { status: res.status }
      );
    }
    return NextResponse.json({
      extracted: {
        ...extracted,
        analyzedChars: truncated.length,
        truncated: truncated.length < extracted.text.length
      },
      nlp
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Network error calling Google NLP", extracted },
      { status: 502 }
    );
  }
}
