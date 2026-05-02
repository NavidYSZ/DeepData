
Insights:
- Traffic Analysis
- Sichtbarkeitsindex



Tools:
- Deep SERP Analysis
- Crawl (screaming frog clone) -> Audit Export
- Backlink Opportunity Export
- Content Gap (über Zyte Konkurrenten)


- Internal Link Analysis / Internal Link Gap (Datenbasis schaffen zwischen Ranking & Interne Verlinkungen)
- 

## Crawl v1 Plan

### Zielbild
- Neuer Menüpunkt `Crawl` unten in der bestehenden Sidebar.
- `Crawl` öffnet eine eigene Fullscreen-App ohne den bisherigen Dashboard-Header und ohne Sidebar.
- In der neuen App gibt es drei Routen:
  - `/crawl` als internes Dashboard mit Vorschau-Kacheln
  - `/crawl/crawler` als operative Screaming-Frog-artige Fläche
  - `/crawl/changes` als Historie mit Kalender und Änderungslog

### UI-Entscheidungen
- Die Crawl-App bekommt nur einen schlanken Rücksprung zum Haupt-Dashboard.
- Innerhalb der Crawl-App gibt es eine kleine lokale Navigation zwischen Dashboard, Crawler und Changes.
- Die erste Version bleibt mock-basiert, damit Informationsarchitektur und Workflows früh testbar sind.

### Geplantes Datenmodell
- `CrawlRun`: ein gespeicherter Crawl pro Lauf / pro Tag
- `CrawlUrlSnapshot`: URL-Zustand innerhalb eines Crawl-Runs
- `CrawlChangeEvent`: erkannter Unterschied zwischen zwei aufeinanderfolgenden Snapshots
- Später optional:
  - `CrawlProject` oder Site-Konfiguration
  - Scheduler-/Job-Metadaten

### Wichtige Produktentscheidung
- Erstmal genau ein Daily Crawl pro Tag.
- Dadurch bleibt der Kalender leicht verständlich.
- Die `Changes`-Seite wird dann primär tagesbasiert statt run-basiert gedacht.

### Nächste Umsetzungsphasen
- Phase 1: Navigation, Routing, Fullscreen-Shell und UI-Prototypen
- Phase 2: Prisma-Modelle und Persistenz für Crawl Runs / Snapshots / Changes
- Phase 3: echter Crawl-Job und tägliche Speicherung
- Phase 4: echte Diff-Logik und Filter/Export in der Changes-Ansicht
