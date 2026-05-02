([Past chat][1])([Past chat][2])([Past chat][3])([Past chat][4])

Du hast komplett recht — das ist **kein Prompt-Problem mehr**, sondern ein **Orchestrierungs-Problem**.

Wenn du willst, dass es wirklich “einfach macht”, musst du 4 Sachen **im Code erzwingen**:

---

## 1) Preset-Buttons dürfen nicht als normaler Chat-Text laufen

Aktuell schickst du wahrscheinlich nur „Kannibalisierung Check …“ als User-Message.
Dann “denkt” das Modell, es muss erst Parameter sammeln.

**Fix:** Buttons senden ein strukturiertes Kommando (Runbook), z. B.:

```ts
// client
runPreset("CANNIBALIZATION_TOP_QUERIES", {
  siteHint: "planindustrie.de",
  auto: true
});
```

Oder als Text-Konvention (quick hack):
`RUNBOOK:CANNIBALIZATION_TOP_QUERIES|siteHint=planindustrie.de|auto=1`

---

## 2) Context-Hydration VOR dem Modell (serverseitig)

Bevor das LLM antwortet:

1. `listSites()` holen
2. `siteHint` + letzte Session-Property mappen
3. Defaults setzen (28d vs prev28d, topN=250, rowLimit=5000, dims query+page)

```ts
type AgentCtx = {
  siteUrl: string | null;
  range: { start: string; end: string; prevStart: string; prevEnd: string };
  topN: number;
  rowLimit: number;
  dims: string[];
  blocker?: "NO_SITE" | "AUTH";
};

function hydrateContext(input: {
  message: string;
  siteHint?: string;
  sessionSite?: string;
  sites: { siteUrl: string; permissionLevel: string }[];
}): AgentCtx {
  const siteUrl =
    resolveProperty(input.siteHint || input.message, input.sites) ||
    (input.sessionSite && input.sites.find(s => s.siteUrl === input.sessionSite)?.siteUrl) ||
    pickDefaultSite(input.sites); // z.B. first verified/full

  if (!siteUrl) return { siteUrl: null, range: last28vsPrev28(), topN: 250, rowLimit: 5000, dims: ["query","page"], blocker: "NO_SITE" };

  return {
    siteUrl,
    range: last28vsPrev28(),
    topN: 250,
    rowLimit: 5000,
    dims: ["query", "page"]
  };
}
```

---

## 3) Blocker-Policy: Nur dann fragen, sonst IMMER ausführen

**Fragen nur bei harten Blockern:**

* keine Property auflösbar
* OAuth/401/403
* Toolfehler nach 2 Retries

Alles andere: **nicht fragen, ausführen**.

```ts
function needsUserInput(ctx: AgentCtx, err?: any) {
  if (ctx.blocker === "NO_SITE") return true;
  if (err?.status === 401 || err?.status === 403) return true;
  return false;
}
```

---

## 4) Runbook-First statt “freies Tool-Raten”

Für Presets nicht dem Modell überlassen, *ob* und *wie* es Tools nutzt.
Du führst deterministisch aus, das Modell fasst nur zusammen.

```ts
async function runCannibalization(ctx: AgentCtx) {
  const current = await querySearchAnalytics({
    siteUrl: ctx.siteUrl!,
    startDate: ctx.range.start,
    endDate: ctx.range.end,
    dimensions: ["query","page"],
    rowLimit: ctx.rowLimit
  });

  const previous = await querySearchAnalytics({
    siteUrl: ctx.siteUrl!,
    startDate: ctx.range.prevStart,
    endDate: ctx.range.prevEnd,
    dimensions: ["query","page"],
    rowLimit: ctx.rowLimit
  });

  const findings = analyzeCannibalization(current.rows, previous.rows, { topN: ctx.topN });

  let exportRef: null | { url: string; filename: string } = null;
  if (findings.relevantRows.length > 100) {
    exportRef = await exportCsv(findings.relevantRows, `${sanitize(ctx.siteUrl!)}_kannibalisierung_${ctx.range.start}_${ctx.range.end}.csv`);
  }

  return { ctx, findings, exportRef };
}
```

---

## Prompt-Patch (klein, aber wichtig)

Dein guter Systemprompt bekommt noch diese 3 harten Sätze:

```txt
- Wenn Intent klar ist, starte sofort mit Default-Parametern. Frage NICHT nach Bestätigung.
- Bei RUNBOOK-* Nachrichten ist Autonomie verpflichtend: ausführen, nicht nachfragen.
- Rückfragen sind nur bei harten Blockern erlaubt (keine Property / OAuth / Toolausfall nach 2 Retries).
```

---

## Warum es bei dir gerade nervt

Weil dein Agent aktuell:

* Preset als normalen Chat interpretiert
* keine persistente `selectedProperty` nutzt
* kein serverseitiges Default-Hydration hat
* kein “blocker-only question gate” hat

**Prompt allein kann das nicht zuverlässig lösen.**

---

## Konkreter Umsetzungsplan (heute)

1. `selectedProperty` in Session speichern (threadId-basiert).
2. Preset-Buttons auf `RUNBOOK_*` umstellen (nicht Freitext).
3. `hydrateContext()` vor jedem Runbook.
4. `runCannibalization()` deterministisch ausführen.
5. LLM nur für Ergebnistext + Maßnahmen nutzen.

---

Wenn du willst, gebe ich dir im nächsten Schritt eine **1:1 Next.js-Dateistruktur mit Copy-Paste-Code** für:

* `app/api/gsc-agent/route.ts`
* `lib/agent/hydrate-context.ts`
* `lib/agent/runbooks/cannibalization.ts`
* `lib/agent/policy.ts`
* `app/(dashboard)/gsc-agent/page.tsx` (Preset-Buttons + Chat-Bridge)

[1]: https://chatgpt.com/c/698c629d-2c44-838e-a066-cf0edab3f38d "AI und Google Search Console"
[2]: https://chatgpt.com/c/698b0c20-7c24-8387-9c62-8023a19424dc "OpenAI Deep Research Aufbau"
[3]: https://chatgpt.com/c/698c4417-5de4-8395-a5af-5cee30684474 "Agentic SEO Report Erklärung"
[4]: https://chatgpt.com/c/69541c66-c9ac-832e-950d-4503a6b5b533 "SEO Suite Namen"
