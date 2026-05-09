# Changelog

Proaktiv geführtes Logbuch aller substantiellen Änderungen an Code, Plan-Docs und Architektur. Jeder Eintrag: Datum, Modul/Bereich, Was, Warum, Refs.

Format:

```
## YYYY-MM-DD — <Bereich>
- **Was:** kurze Beschreibung
- **Warum:** Begründung
- **Refs:** Plan-Doc / ADR / Issue / Commit
```

---

## 2026-05-09 — Bootstrap der v2-Planung
- **Was:** plan-docs/-Architektur in DeepData angelegt (Sektionen 00-product … 10-roadmap, decisions/, v1-status-quo/, changelog, error-fix-log). Übernimmt die Struktur aus dem Schwesterrepo `seo11-agent` und befüllt sie mit DeepData-spezifischen Inhalten.
- **Warum:** v2-Rewrite wird vorbereitet; persistentes Projektgedächtnis ist Pflichtbedingung, damit weder User noch nachfolgende Claude-Sessions Kontext verlieren.
- **Refs:** [`README.md`](README.md), [`v1-status-quo/`](v1-status-quo/), CLAUDE.md (Update)

## 2026-05-09 — Stack- und Architektur-Grundsatzentscheidungen
- **Was:** Sieben ADRs angelegt: Doc-Sprache, Tech-Stack, Hosting (Coolify), DB+ORM (Postgres+Drizzle), Auth+Tenancy (Better Auth + `account_id`-Scoping), Job-Queue (BullMQ+Redis), Domain-als-Workspace, **kein Chat in v2**, Sidebar-07.
- **Warum:** Diese Entscheidungen tragen sämtliche Modul-Specs; sie zuerst zu fixieren verhindert, dass Modul-Diskussionen Stack-Annahmen heimlich vorwegnehmen.
- **Refs:** [`decisions/`](decisions/), [`07-software-architecture/tech-stack.md`](07-software-architecture/tech-stack.md), [`04-ux-ui/sidebar-07.md`](04-ux-ui/sidebar-07.md)
