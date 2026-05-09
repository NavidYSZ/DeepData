# ADR-0001: Doc-Sprache

- **Status:** accepted
- **Datum:** 2026-05-09
- **Beteiligt:** user, claude

## Kontext

Das Repo wird mehrsprachig genutzt (User-Briefings auf Deutsch, Code/Identifier per Konvention auf Englisch). Wir brauchen eine eindeutige Regel, damit nicht jede Doc/jeder Identifier neu verhandelt werden muss.

## Entscheidung

- **Plan-Docs:** Deutsch.
- **Code, Dateinamen, Variablen, API-Felder, Identifier, Commit-Messages, Inline-Kommentare, Frontmatter-Werte:** Englisch.
- **Glossar-Begriffe** ([`../00-product/glossary.md`](../00-product/glossary.md)) führen beide Formen (deutscher Anzeigename + englischer `code_identifier`).

## Konsequenzen

- Plan-Doc-Reviews durch den User fließen schnell.
- Code bleibt international lesbar; AI-gestützte Code-Tools haben keine Verständnisprobleme.
- Schnittstelle Plan-Doc ↔ Code geht über das Glossar.

## Verworfen weil

- **Komplett Englisch:** zwingt User in eine Fremdsprache für Strategie-/Vision-Diskussionen — verlangsamt Reviews.
- **Komplett Deutsch:** macht Code- und API-Identifier sperrig und verschlechtert Tooling-Kompatibilität.
