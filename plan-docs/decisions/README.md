# Architecture Decision Records (ADRs)

Jede tragende technische oder strukturelle Entscheidung wird hier als kurzer ADR dokumentiert: Kontext, Optionen, Wahl, Konsequenzen.

## Wann ein ADR

- Stack-Entscheidung (Framework, Library-Wahl, DB)
- Persistente Strukturen (Schema, URL-Routing, Tenancy-Modell)
- Cross-cutting Konventionen (Auth-Wrapping, Job-Queue, Logging)
- Bewusste Nicht-Entscheidungen („wir bauen X bewusst nicht in v2")

## Format

Siehe [`_template.md`](_template.md). Pflichtfelder: `Status`, `Datum`, `Kontext`, `Entscheidung`, `Konsequenzen`. Optional: `Optionen`, `Verworfen weil`.

## Status-Werte

- `accepted` — entschieden und gültig
- `proposed` — vorgeschlagen, noch nicht entschieden
- `superseded by ADR-XXXX` — abgelöst
- `deprecated` — nicht mehr gültig, aus historischen Gründen behalten

## Aktuelle ADRs

| ADR | Titel | Status |
|---|---|---|
| [ADR-0001](ADR-0001-doc-language.md) | Doc-Sprache | accepted |
| [ADR-0002](ADR-0002-tech-stack.md) | Tech-Stack v2 | accepted |
| [ADR-0003](ADR-0003-hosting-coolify.md) | Hosting auf Coolify | accepted |
| [ADR-0004](ADR-0004-database-and-orm.md) | Postgres + Drizzle | accepted |
| [ADR-0005](ADR-0005-auth-and-tenancy.md) | Better Auth + `account_id`-Scoping | accepted |
| [ADR-0006](ADR-0006-job-queue.md) | BullMQ + Redis | accepted |
| [ADR-0007](ADR-0007-domain-as-workspace.md) | Domain ist Property + Arbeitsbereich | accepted |
| [ADR-0008](ADR-0008-no-chat-in-v2.md) | Kein Chat-Agent in v2 | accepted |
| [ADR-0009](ADR-0009-sidebar-07.md) | shadcn `sidebar-07` als Navigations-Shell | accepted |
