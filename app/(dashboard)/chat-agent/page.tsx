"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const quickPrompts = [
  "Quick Wins (28 Tage, CTR niedrig, Pos 4–15) bitte als Tabelle",
  "Content Decay: Vergleich letzte 28 vs vorherige 28 Tage",
  "Kannibalisierung Check für Top Queries",
  "Executive CSV Export: wichtigste Seiten & Keywords als CSV"
];

export default function ChatAgentPage() {
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
        body: JSON.stringify({ message: prompt, sessionId: sessionId ?? undefined })
      });
      if (!res.ok || !res.body) {
        const txt = await res.text();
        console.error("[chat] api error", res.status, txt);
        throw new Error(txt || `Fehler ${res.status}`);
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
                  <div className="font-semibold truncate">{s.title || "Unterhaltung"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(s.updatedAt).toLocaleString("de-DE")}
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
            <div className="h-[60vh] rounded-md border border-border bg-card" ref={scrollRef}>
              <div className="space-y-3 p-4">
                {messages.map((m, idx) => (
                  <div key={m.id ?? idx} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={m.role === "user" ? "secondary" : "default"}>
                        {m.role === "user" ? "Du" : m.role === "assistant" ? "Agent" : m.role}
                      </Badge>
                      {m.role === "assistant" && loading && m.id === "assistant-temp" && (
                        <span>Lädt…</span>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {typeof m.content === "string" ? m.content : JSON.stringify(m.content)}
                    </div>
                  </div>
                ))}
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
