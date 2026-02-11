"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useSite } from "@/components/dashboard/site-context";
import { Loader2 } from "lucide-react";
import { Trash2 } from "lucide-react";

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

const quickPrompts = [
  "Quick Wins: letzte 90 Tage. Tabelle (JSON-Block) mit URL, Query, Impr, CTR, Pos. Fokus CTR niedrig & Pos 4–15.",
  "Content Decay: vergleiche letzte 90 Tage vs vorherige 90. JSON-Metrics + Tabelle der Top-Verlierer.",
  "Kannibalisierung: Top Queries mit mehreren URLs. JSON-Tabelle mit Query, URL, Clicks, Impr, CTR, Pos.",
  "Top 20 Queries & Top 20 Pages der letzten 90 Tage. Zwei JSON-Tabellen.",
  "GSC-Audit letzte 90 Tage: JSON-Metrics + Tabellen für Quick Wins, Content Decay, Cannibalization + 3 konkrete Actions."
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
        <div className="overflow-x-auto">
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
        </div>
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
    const toneClass = block.tone === "warn" ? "border-amber-200 bg-amber-50/40" : "border-blue-200 bg-blue-50/40";
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

  async function deleteSession(id: string, ev?: React.MouseEvent) {
    ev?.stopPropagation();
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

  async function sendMessage(prompt: string) {
    if (!prompt.trim()) return;
    setLoading(true);
    const optimisticId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
    setMessages((prev) => [...prev, { id: optimisticId, role: "user", content: prompt }]);
    console.log("[chat] send", { prompt, sessionId });
    setInput("");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, sessionId: sessionId ?? undefined, siteHint: site ?? undefined })
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
    <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
      <Card className="h-full">
        <CardHeader className="flex flex-col gap-3">
          <CardTitle>Verläufe</CardTitle>
          <Button size="sm" onClick={startNewSession} variant="secondary">
            Neue Unterhaltung
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[70vh] overflow-y-auto">
            <div className="space-y-1 p-3">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  className={cn(
                    "w-full rounded-md border border-transparent px-3 py-2 text-left text-sm hover:bg-muted",
                    sessionId === s.id && "border-border bg-muted"
                  )}
                  onClick={() => loadSession(s.id)}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{s.title || "Unterhaltung"}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.updatedAt).toLocaleString("de-DE")}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(ev) => deleteSession(s.id, ev)}
                      aria-label="Verlauf löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </button>
              ))}
              {!sessions.length && (
                <p className="text-sm text-muted-foreground px-2">Noch keine Unterhaltungen.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>GSC Chat Agent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((p) => (
                <Button key={p} size="sm" variant="outline" onClick={() => sendMessage(p)}>
                  {p}
                </Button>
              ))}
            </div>
            <div className="h-px w-full bg-border" />
            <div className="h-[60vh] rounded-md border border-border bg-card overflow-y-auto" ref={scrollRef}>
              <div className="space-y-4 p-4">
                {messages.map((m, idx) => {
                  const isUser = m.role === "user";
                  const headerClass = isUser ? "text-primary-foreground/80" : "text-muted-foreground";
                  const displayText = getDisplayText(m.content);
                  return (
                    <div key={m.id ?? idx} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "w-full max-w-[85%] space-y-2 rounded-lg border px-3 py-2",
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
            <div className="flex gap-2">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
