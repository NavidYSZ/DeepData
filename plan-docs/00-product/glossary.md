---
status: erstversion
last-updated: 2026-05-09
owner: claude (zur Review durch user)
---

# Glossar

Kanonische Begriffe für DeepData v2. Wenn ein Begriff hier definiert ist, wird er **genau so** überall im Projekt benutzt — Plan-Docs, UI-Texte, Code-Identifier (in englischer Übersetzung).

Format pro Eintrag: **Begriff (`code_identifier`)** — Definition.

## Kern-Hierarchie

- **Account (`account`)** — Die oberste Tenant-Einheit. Im Solo-Modus genau einer (der User). In der SaaS-Phase ein Kunden-Account, der mehrere User enthalten kann.
- **User (`user`)** — Eine Person mit Login. Gehört zu mindestens einem Account.
- **Domain (`domain`)** — Die zentrale Arbeitseinheit unterhalb des Accounts. Repräsentiert sowohl die SEO-Property (z.B. `example.com` oder eine GSC-Property `sc-domain:example.com`) als auch den dazugehörigen Arbeitsbereich. Eine Domain hat: eigene Modul-Daten, eigene Strategie, eigene Notizen. Pro Account beliebig viele. **Es gibt keine zusätzliche Workspace-Schicht** — die Domain selbst ist der Arbeitsbereich.
- **GSC-Account (`gsc_account`)** — Ein verknüpftes Google-Search-Console-Konto. Pro Account beliebig viele. Domains aus dem GSC-Konto werden **nicht automatisch** als Domain-Einträge angelegt — der User wählt explizit, welche Domain er hinzufügen will (sonst würde Initial Analysis bei vielen GSC-Properties versehentlich riesige Jobs starten).
- **Modul (`module`)** — Ein in sich geschlossener funktionaler Bereich einer Domain (z.B. Rankings, Content Gap). Jedes Modul hat eigene Daten, eigene UI, eigene Service-Layer.
- **Modul-Run / Analysis-Run (`analysis_run`)** — Eine konkrete Berechnung/Aktualisierung eines Moduls für eine Domain (z.B. "Rankings aktualisiert am 2026-05-09"). Läuft als BullMQ-Job.
- **Initial Analysis (`initial_analysis`)** — Der vollumfängliche Analyse-Lauf, der beim Hinzufügen einer neuen Domain automatisch alle (oder ein definiertes Subset) Module einmal durchläuft.

## Daten / Quellen

- **Datenquelle (`data_source`)** — Externes System, aus dem Daten gezogen werden: GSC, SERP-API (Zyte/o.ä.), eigener Crawler.
- **Crawl (`crawl`)** — Ein Lauf des eigenen Crawlers über eine Domain (`crawl_run`-Row).
- **Crawl-Diff (`crawl_diff`)** — Die erkannten Änderungen zwischen zwei Crawls einer URL.
- **SERP-Snapshot (`serp_snapshot`)** — Eine zu einem Zeitpunkt gezogene SERP-Position-Liste für ein Keyword.
- **Keyword (`keyword`)** — Eine Suchanfrage, für die wir Ranking- oder SERP-Daten haben.
- **Cluster (`cluster`)** — Gruppe semantisch oder SERP-mechanisch verwandter Keywords (Modul Keyword Clustering).

## Modul-spezifische Begriffe (vorläufig)

- **Strategie (`strategy`)** — Strukturierter Datensatz pro Domain, gegliedert in **Kategorien** (initial: `technical`, `content`, `optimize`). Pro Kategorie eine Liste **Findings** (priorisiert, mit Status). Wird im Initial-Analysis-Workflow erzeugt; Updates via Re-Run oder manueller User-Edit.
- **Finding (`finding`)** — Ein einzelner strukturierter Befund innerhalb einer Strategie-Kategorie: `title`, `description`, `priority` (high/medium/low), `status` (open/in_progress/done/dismissed), `evidence` (Verweis auf Modul-Daten), `recommendation`.
- **Memory / Notes (`memory_entry`)** — Manuell kuratierte Notizen, Fakten, Entscheidungen pro Domain. Persistent, wachsend. **Reine User-Schreibung** in v2; keine automatische Befüllung durch einen Agenten.

## Status / Lifecycle

- **Stale (`stale`)** — Daten, die existieren, aber älter als ein definiertes TTL sind und ggf. neu gezogen werden sollten.
- **Pending Analysis (`pending_analysis`)** — Modul-Daten, deren Berechnung läuft oder eingeplant ist.
- **Approved** (Plan-Doc) — Eine Plan-Doc, die der User reviewt und freigegeben hat. Erst dann verbindlich.

## Begriffe, die wir bewusst **nicht** verwenden (Anti-Glossar)

- "Workspace" als eigenes Konzept → es gibt keinen — wir sagen **Domain**. Eine Domain ist gleichzeitig Property und Arbeitsbereich.
- "Site" als App-Konzept → wir sagen **Domain**. "Site" als GSC-API-Begriff (z.B. `siteUrl`) bleibt im Code-Kontext erlaubt.
- "Projekt" → wir sagen **Domain**. (Ausnahme: `KeywordProject` als legacy-v1-Begriff wird in v2 evtl. zu `cluster_workspace` o.ä. — Entscheidung im Modul-Spec.)
- "Konversation" / "Chat-Session" / "Thread" — entfällt komplett, da kein Chat in v2.
- "Agent" / "Bot" / "Tool" (im LLM-Sinn) — entfällt komplett.
- "Account" für einen GSC-Login → wir sagen **GSC-Account**, um Verwechslung mit dem Tenant-Account zu vermeiden.

> **Begriffs-Hinweis:** "Domain" hat im Sprachgebrauch zwei Bedeutungen, die wir auseinanderhalten:
> - **Domain (unser Konzept)** — die Arbeitseinheit im Tool. Wenn nicht anders qualifiziert, ist immer dies gemeint.
> - **"URL" / "Hostname"** — meint die deployte App-Adresse oder eine DNS-Adresse im Tech-Kontext. In Plan-Docs verwenden wir dafür **"URL"** oder **"Hostname"**, nicht "Domain".
