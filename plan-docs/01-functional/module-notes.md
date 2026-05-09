---
status: leer
last-updated: 2026-05-09
owner:
---

# Modul: Notes (Memory)

Wird in Phase 5 erarbeitet. Ohne Chat ([ADR-0008](../decisions/ADR-0008-no-chat-in-v2.md)) ein **reines User-Notizen-Modul** pro Domain: Notizen, Fakten, Entscheidungen, Erinnerungen.

MVP: Tabelle/Liste mit Kategorisierung, Volltext-Suche, optional Cross-Refs zu Modul-Daten („Notiz zu URL X", „Notiz zu Cluster Y").

Kein Vector-Search, keine Embeddings im MVP. pgvector kann später additiv kommen, wenn Such-Volumen es erfordert.

Frage: eigener Sidebar-Eintrag oder Drawer/Sheet aus jedem Modul aufrufbar? → [`../04-ux-ui/sidebar-07.md`](../04-ux-ui/sidebar-07.md).
