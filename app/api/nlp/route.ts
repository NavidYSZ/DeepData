import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

const bodySchema = z.object({
  text: z.string().min(1).max(20_000),
  features: z
    .object({
      sentiment: z.boolean().optional(),
      entities: z.boolean().optional(),
      entitySentiment: z.boolean().optional(),
      classify: z.boolean().optional(),
      syntax: z.boolean().optional()
    })
    .optional()
});

type NlpFeatures = NonNullable<z.infer<typeof bodySchema>["features"]>;

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
          "Missing GOOGLE_NLP_API_KEY. Create an API key in Google Cloud (Natural Language API) and set GOOGLE_NLP_API_KEY in your .env.local."
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

  const features: NlpFeatures = {
    sentiment: true,
    entities: true,
    entitySentiment: false,
    classify: false,
    syntax: false,
    ...(body.features ?? {})
  };

  const payload = {
    document: { type: "PLAIN_TEXT", content: body.text },
    features: {
      extractSyntax: !!features.syntax,
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
    const json = await res.json();
    if (!res.ok) {
      const message = json?.error?.message ?? "Google NLP request failed";
      return NextResponse.json({ error: message, status: res.status }, { status: res.status });
    }
    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Network error calling Google NLP" },
      { status: 502 }
    );
  }
}
