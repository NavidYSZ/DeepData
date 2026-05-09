# ADR-0008: Kein Chat-Agent in v2

- **Status:** accepted
- **Datum:** 2026-05-09
- **Beteiligt:** user, claude

## Kontext

v1 hat einen `chat-agent`-Modul mit Runbooks (quick wins, content decay, cannibalization, top queries/pages, audit) auf Basis von OpenAI + Vercel AI SDK. Das Schwesterprojekt SEO11-Agent setzt sogar einen Chat-Agenten als zentralen USP an (assistant-ui als Hauptoberfläche, jedes Modul exposed Tools an den Agenten).

Der User hat sich in der v2-Planung explizit dagegen entschieden: **kein Chat in v2.**

## Entscheidung

- v2 enthält **kein** Chat-/Agent-Modul.
- v2 enthält **keine** LLM-Tool-Verträge, keine `assistant-ui`, keine `@ai-sdk/openai`-Abhängigkeit, kein Modell-Routing (`MODELS.heavy/routine`).
- v1-Module/Files, die mit dem Chat zusammenhängen (`app/(dashboard)/chat-agent/`, `app/api/agent/`, `lib/agent/`, Prisma `ChatSession`/`ChatMessage`/`ChatFile`), werden in v2 **nicht portiert**.
- Die Sidebar-Top-Level-Gruppen reservieren keinen Slot für einen Chat-Eintrag (siehe [`../04-ux-ui/sidebar-07.md`](../04-ux-ui/sidebar-07.md)).
- **Strategy** und **Memory/Notes** bleiben als eigenständige Module bestehen, aber ohne Agent-Schreibzugriff — reine User-Bedienung mit klassischem UI.

## Konsequenzen

- Scope drastisch verkleinert; Tool-Verträge, Token-Kosten, Streaming-UX, Reasoning-Persistenz, Modell-Provider-Bindung etc. entfallen alle.
- **Strategy-Findings** werden entweder rein deterministisch aus Modul-Daten erzeugt (Regel-basiert), per dediziertem nicht-Chat-LLM-Aufruf (eigenes ADR, falls nötig), oder rein manuell vom User gepflegt. Entscheidung im Modul-Spec.
- **Memory/Notes** ist ein reines Notizen-Modul: User legt Einträge an, klassifiziert sie, kann nach ihnen suchen. Keine automatische Befüllung.
- Spätere Wiedereinführung eines Agenten ist **architekturell nicht ausgeschlossen** — Modul-Daten liegen dann persistent vor, und Tool-Verträge wären additiv. Wenn das jemals kommt, wird ADR-0008 mit `superseded by ADR-XXXX` markiert.

## Verworfen weil

- **Chat als Hauptoberfläche (à la SEO11-Agent):** zu großer Scope; würde ablenken vom Aufräumen der Module/UX, was primäres v2-Ziel ist.
- **Co-Pilot-Chat in der Sidebar (additiv):** würde Tool-Verträge pro Modul erzwingen — jedes Modul bräuchte Read-/Write-Tools mit Schema, Auth, Rate-Limits. Hoher Cross-cutting-Aufwand.
- **Inline-Mini-Agent pro Modul:** verteilt LLM-Komplexität über alle Module, ohne klaren Use-Case für v2.
- **Bestehenden v1-Chat einfrieren und mitübernehmen:** wird zur Wartungs-Last, weil die zugrunde liegenden Module-Daten in v2 anders strukturiert sind.
