# ADR-0007: Domain ist Property + Arbeitsbereich (kein Workspace-Layer)

- **Status:** accepted
- **Datum:** 2026-05-09
- **Beteiligt:** user, claude

## Kontext

v1 hat keine eigene Domain-Hierarchie: die GSC-Property wird in `localStorage` gespeichert (`SiteContext`) und global als „aktuelle Site" benutzt. Folgen:

- Keine Deep-Links auf Modul + Property („send mir den Link, wo du das Problem siehst" geht nicht).
- Modul-Daten haben keinen Property-Bezug — alles wird live aus GSC gezogen.
- Strategie/Notizen pro Property unmöglich.
- Kein Reset bei Property-Wechsel (Stale-State zwischen Properties leakt).

v2 braucht eine echte Hierarchie. Drei Optionen wurden gegeneinander gehalten:

1. **Domain = Property + Arbeitsbereich** (eine Schicht).
2. **Workspace** als zusätzlicher Layer zwischen GSC-Account und Module (bündelt Sites + Uploads + Konkurrenten).
3. v1-Modell weiter (verworfen).

## Entscheidung

**Eine Schicht: `domain`.** Eine Domain bindet einen Hostname (z.B. `example.com` oder `sc-domain:example.com`) UND ist gleichzeitig der Arbeitsbereich. Pro Domain:

- eigene Modul-Daten
- eigene Strategie
- eigene Notes/Memory
- eigene Initial-Analysis-Historie

**URL-Routing:** `/d/[domainId]/<modul>`. Beispiel: `/d/abc123/internal-links`, `/d/abc123/rankings`. URL ist Source of Truth für die Domain-Auswahl. Cookie `selected_domain_id` merkt sich nur die zuletzt gewählte für den `/`-Redirect.

**Domain-Anlage:** Explizit, nicht automatisch aus GSC. User muss eine Domain bewusst hinzufügen, bevor Initial Analysis startet — sonst würden Initial-Analysis-Jobs bei Multi-Property-GSC-Konten versehentlich riesig.

**Domain-Wechsel:** `[domainId]/layout.tsx` setzt `key={domain.id}` auf den DomainShell, sodass beim Switch der gesamte Modul-State neu gemountet wird (kein Bleed-Through).

## Konsequenzen

- `localStorage`-`SiteContext` aus v1 entfällt komplett.
- Tenant-Check muss zusätzlich zur Domain-Validierung kommen: `domain.account_id == session.user.defaultAccountId`. Bei Mismatch `notFound()` (404), nicht Redirect (sonst leakt Existenz fremder IDs).
- Drei Routing-Punkte:
  - `/` ohne Domain → Welcome (0 Domains) oder Redirect zu `/d/[lastSelected || erste]/<default-modul>`
  - `/d/[domainId]` → Redirect zum Default-Modul (entscheiden im UX-Spec)
  - `/d/[domainId]/<modul>` → Modul-Page
- GSC-Property-Picker aus v1 entfällt; an seine Stelle tritt der Domain-Switcher in der Sidebar.
- Migration: jede v1-Site, die bisher in `localStorage` hängt, muss als Domain explizit angelegt werden — Migrations-Plan kommt mit dem ersten Modul.

## Verworfen weil

- **Workspace-Layer:** zusätzliche Komplexität ohne klaren Mehrwert — Domain hält schon Sources/Uploads/Konkurrenten als Modul-internen Zustand. Wenn sich später rausstellt, dass mehrere Domains einen geteilten Konkurrenten-Pool brauchen, kommt das additiv.
- **v1 weiter:** alle bekannten v1-Schwächen (siehe oben).
