# Chat Agent – Quick Test Checklist

## API
- `POST /api/agent` with body `{ message: "Hallo", sessionId: null }` returns 200 and creates a session entry in `ChatSession` and two `ChatMessage` rows (user + assistant).
- Tool `querySearchAnalytics` delegates to Search Console: send a body with `siteUrl`, `startDate`, `endDate`, `dimensions: ["query"]` and verify rows are returned (requires connected GSC account).
- `GET /api/agent/sessions` lists recent sessions for the logged-in user.
- `GET /api/agent/sessions/:id` returns messages for that session; `DELETE` archives it.
- `exportCsv` tool stores a file in `data/agent-files` and creates `ChatFile`; `GET /api/agent/files/:id` returns 200 and downloads, 410 after expiry.

## UI (app/(dashboard)/chat-agent)
- Sidebar zeigt Verläufe; „Neue Unterhaltung“ leert den Chat.
- Quick-Prompt-Buttons schicken vordefinierte Prompts.
- Nachrichten-Stream zeigt laufenden Assistanten-Text; Eingabe per Enter sendet.
- Downloads: Wenn eine Antwort ein File-Badge enthält, Klick lädt die Datei.

## Assumptions
- User ist eingeloggt; GSC OAuth verbunden.
- `OPENAI_API_KEY` gesetzt; Modell `gpt-4.1-mini` verfügbar.
- SQLite genutzt; Pfad `prisma/data/sqlite.db`.
