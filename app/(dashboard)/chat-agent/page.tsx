"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableContainer } from "@/components/ui/table-container";
import { cn } from "@/lib/utils";
import { useSite } from "@/components/dashboard/site-context";
import { Loader2, Trash2 } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/dashboard/page-shell";

type SessionListItem = {
  id: string;
  title: string;
  updatedAt: string;
  lastMessage?: any;
};

type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "tool" | "system";
  content: any;
};

type UiBlock =
  | { type: "table"; title?: string; columns: string[]; rows: (string | number)[][] }
  | { type: "metrics"; title?: string; items: { label: string; value: string }[] }
  | { type: "actions"; title?: string; items: string[] }
  | { type: "note"; tone?: "info" | "warn"; text: string }
  | { type: "status"; label: string; state: "running" | "done" | "error" };

type ParsedSegment = { type: "text"; text: string } | { type: "block"; block: UiBlock; raw: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type RunbookId =
  | "quick_wins"
  | "content_decay"
  | "cannibalization"
  | "top_queries"
  | "top_pages"
  | "audit";

const runbooks: { id: RunbookId; label: string; description: string }[] = [
  { id: "quick_wins", label: "Quick Wins (28 Tage)", description: "CTR niedrig, Position 4–15" },
  { id: "content_decay", label: "Content Decay (28 vs vorher)", description: "Verlierer im Vergleichszeitraum" },
  { id: "cannibalization", label: "Cannibalization (28 Tage)", description: "Queries mit mehreren URLs" },
  { id: "top_queries", label: "Top Queries (28 Tage)", description: "Top Keywords nach Impressions" },
  { id: "top_pages", label: "Top Pages (28 Tage)", description: "Top URLs nach Impressions" },
  { id: "audit", label: "Gesamt-Audit (28 Tage)", description: "Quick Wins, Decay, Cannibalization, Top Listen" }
];

function parseAssistantContent(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const regex = /\[\[JSON\]\]([\s\S]*?)\[\[\/JSON\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) segments.push({ type: "text", text: before });
    }
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.type === "string") {
        segments.push({ type: "block", block: parsed as UiBlock, raw });
      } else {
        segments.push({ type: "text", text: raw });
      }
    } catch {
      segments.push({ type: "text", text: raw });
    }
    lastIndex = regex.lastIndex;
  }
  const tail = text.slice(lastIndex).trim();
  if (tail) segments.push({ type: "text", text: tail });
  if (!segments.length) return [{ type: "text", text }];
  return segments;
}

function renderBlock(block: UiBlock, key: string) {
  if (block.type === "table") {
    return (
      <div key={key} className="rounded-md border border-border bg-background/40">
        {block.title ? (
          <div className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
            {block.title}
          </div>
        ) : null}
        <TableContainer>
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                {block.columns.map((col, idx) => (
                  <TableHead key={`${key}-col-${idx}`}>{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((row, rIdx) => (
                <TableRow key={`${key}-row-${rIdx}`}>
                  {row.map((cell, cIdx) => (
                    <TableCell key={`${key}-cell-${rIdx}-${cIdx}`}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    );
  }

  if (block.type === "metrics") {
    return (
      <div key={key} className="rounded-md border border-border bg-background/40 p-3">
        {block.title ? (
          <div className="mb-2 text-xs font-semibold text-muted-foreground">{block.title}</div>
        ) : null}
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {block.items.map((item, idx) => (
            <div key={`${key}-metric-${idx}`} className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className="text-sm font-semibold">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === "actions") {
    return (
      <div key={key} className="rounded-md border border-border bg-background/40 p-3">
        {block.title ? (
          <div className="mb-2 text-xs font-semibold text-muted-foreground">{block.title}</div>
        ) : null}
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {block.items.map((item, idx) => (
            <li key={`${key}-action-${idx}`}>{item}</li>
          ))}
        </ol>
      </div>
    );
  }

  if (block.type === "note") {
    const toneClass =
      block.tone === "warn"
        ? "border-amber-300/60 bg-amber-50/40 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100"
        : "border-blue-300/60 bg-blue-50/40 text-blue-900 dark:border-blue-700/60 dark:bg-blue-950/30 dark:text-blue-100";
    return (
      <div key={key} className={cn("rounded-md border p-3 text-sm", toneClass)}>
        {block.text}
      </div>
    );
  }

  if (block.type === "status") {
    const stateLabel = block.state === "running" ? "läuft" : block.state === "done" ? "fertig" : "fehler";
    const dotClass =
      block.state === "running"
        ? "bg-amber-500 animate-pulse"
        : block.state === "done"
        ? "bg-emerald-500"
        : "bg-red-500";
    return (
      <div
        key={key}
        className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground"
      >
        <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        <span className="font-medium">Tool</span>
        <span className="truncate">{block.label}</span>
        <span className="ml-auto uppercase tracking-wide">{stateLabel}</span>
      </div>
    );
  }

  return null;
}

function getDisplayText(content: any) {
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.text === "string") return parsed.text;
    } catch {
      // ignore JSON parse errors
    }
    return content;
  }
  return JSON.stringify(content);
}

export default function ChatAgentPage() {
  const { site } = useSite();
  const { data: sessionsData, mutate: refreshSessions } = useSWR<{ sessions: SessionListItem[] }>(
    "/api/agent/sessions",
    fetcher
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function loadSession(id: string) {
    const res = await fetch(`/api/agent/sessions/${id}`);
    if (!res.ok) return;
    const json = await res.json();
    setSessionId(id);
    setMessages((json.messages || []).map((m: any) => ({ role: m.role, content: m.content })));
  }

  async function startNewSession() {
    setSessionId(null);
    setMessages([]);
    setInput("");
  }

  async function deleteSession(id: string) {
    try {
      const res = await fetch(`/api/agent/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Löschen fehlgeschlagen (${res.status})`);
      if (sessionId === id) {
        startNewSession();
      }
      refreshSessions();
    } catch (e) {
      console.error("[chat] delete session error", e);
    }
  }

  async function sendMessage(prompt: string, runbookId?: RunbookId) {
    const trimmed = prompt.trim();
    const runbookLabel = runbookId ? runbooks.find((r) => r.id === runbookId)?.label : null;
    const displayPrompt = trimmed || runbookLabel || "";
    if (!displayPrompt) return;
    setLoading(true);
    const optimisticId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
    setMessages((prev) => [...prev, { id: optimisticId, role: "user", content: displayPrompt }]);
    console.log("[chat] send", { prompt: displayPrompt, sessionId, runbookId });
    setInput("");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: displayPrompt,
          runbookId,
          sessionId: sessionId ?? undefined,
          siteHint: site ?? undefined
        })
      });
      if (!res.ok || !res.body) {
        const txt = await res.text();
        let friendly = txt;
        try {
          const parsed = JSON.parse(txt);
          friendly = parsed?.error || parsed?.message || txt;
        } catch {
          // keep txt
        }
        console.error("[chat] api error", res.status, friendly);
        throw new Error(friendly || `Fehler ${res.status}`);
      }

      let text = "";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        console.log("[chat] stream chunk", { length: text.length });
        setMessages((prev) => {
          const others = prev.filter((m) => m.id !== "assistant-temp");
          return [...others, { id: "assistant-temp", role: "assistant", content: text }];
        });
      }
      setMessages((prev) => {
        const others = prev.filter((m) => m.id !== "assistant-temp");
        return [...others, { role: "assistant", content: text }];
      });
      refreshSessions();
    } catch (e: any) {
      console.error("[chat] send error", e);
      setMessages((prev) => [...prev, { role: "assistant", content: `Fehler: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  const sessions = sessionsData?.sessions ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chat Agent"
        description="Runbooks ausführen oder frei chatten – alles auf GSC-Daten."
      />
      <div className="grid gap-4 md:grid-cols-[280px,1fr] lg:grid-cols-[320px,1fr]">
        <Card className="h-full">
          <CardHeader className="flex flex-col gap-3">
            <CardTitle>Verläufe</CardTitle>
            <Button size="sm" onClick={startNewSession} variant="secondary">
              Neue Unterhaltung
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[60vh] overflow-y-auto md:h-[70vh]">
              <div className="space-y-1 p-3">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "relative w-full rounded-md border border-transparent text-left text-sm hover:bg-muted",
                      sessionId === s.id && "border-border bg-muted"
                    )}
                  >
                    <button type="button" className="w-full px-3 py-2 text-left" onClick={() => loadSession(s.id)}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{s.title || "Unterhaltung"}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(s.updatedAt).toLocaleString("de-DE")}
                          </div>
                        </div>
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2 h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteSession(s.id)}
                      aria-label="Verlauf löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {!sessions.length && (
                  <p className="text-sm text-muted-foreground px-2">Noch keine Unterhaltungen.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <SectionCard title="GSC Chat Agent" description="Quick Actions für typische Analysen.">
            <div className="flex flex-wrap gap-2">
              {runbooks.map((rb) => (
                <Button
                  key={rb.id}
                  size="sm"
                  variant="outline"
                  className="h-auto whitespace-normal text-left"
                  onClick={() => sendMessage("", rb.id)}
                >
                  <span className="block text-sm font-medium">{rb.label}</span>
                  <span className="block text-xs text-muted-foreground">{rb.description}</span>
                </Button>
              ))}
            </div>
            <div className="mt-3 h-px w-full bg-border" />
            <div className="mt-3 h-[58vh] overflow-auto rounded-md border border-border bg-card md:h-[60vh]" ref={scrollRef}>
              <div className="space-y-4 p-4">
                {messages.map((m, idx) => {
                  const isUser = m.role === "user";
                  const headerClass = isUser ? "text-primary-foreground/80" : "text-muted-foreground";
                  const displayText = getDisplayText(m.content);
                  return (
                    <div key={m.id ?? idx} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "w-full max-w-[92%] space-y-2 rounded-lg border px-3 py-2 sm:max-w-[88%]",
                          isUser ? "border-primary/20 bg-primary text-primary-foreground" : "border-border bg-card"
                        )}
                      >
                        <div className={cn("flex items-center gap-2 text-xs", headerClass)}>
                          <Badge variant={isUser ? "secondary" : "default"}>
                            {isUser ? "Du" : m.role === "assistant" ? "Agent" : m.role}
                          </Badge>
                          {m.role === "assistant" && loading && m.id === "assistant-temp" && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                        </div>
                        <div className={cn("space-y-2 text-sm leading-relaxed", isUser ? "text-primary-foreground" : "")}>
                          {m.role === "assistant" ? (
                            parseAssistantContent(displayText).map((seg, sIdx) =>
                              seg.type === "text" ? (
                                <p key={`${m.id ?? idx}-text-${sIdx}`} className="whitespace-pre-wrap">
                                  {seg.text}
                                </p>
                              ) : (
                                renderBlock(seg.block, `${m.id ?? idx}-block-${sIdx}`)
                              )
                            )
                          ) : (
                            <p className="whitespace-pre-wrap">
                              {displayText}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!messages.length && (
                  <p className="text-sm text-muted-foreground">
                    Starte mit einem Prompt oder wähle eine der Quick Actions.
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="Frage oder Auftrag eingeben…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                disabled={loading}
              />
              <Button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
                Senden
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
