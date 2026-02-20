"use client";

import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSite } from "@/components/dashboard/site-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Upload, Edit3, Eye, ChevronDown, ChevronRight } from "lucide-react";

type WorkspaceResponse = {
  projectId: string;
  siteUrl: string | null;
};

type TopKeyword = {
  keywordId: string;
  kwRaw: string;
  demandMonthly: number;
};

type ClusterCard = {
  id: string;
  label: string;
  keywordCount: number;
  totalDemand: number;
  topKeywords?: TopKeyword[];
};

type CardsResponse = {
  items: ClusterCard[];
  total: number;
};

type KeywordRow = {
  id: string;
  kwRaw: string;
  demandMonthly: number;
  clusterIds: string[];
};

type KeywordsResponse = {
  items: KeywordRow[];
  total: number;
};

type ClusterOption = {
  id: string;
  label: string;
};

type AiSuggestedCluster = {
  name: string;
  keywordIds: string[];
  note?: string;
};

type AiSuggestResult = {
  clusters: AiSuggestedCluster[];
  leftoverKeywordIds: string[];
  rationale?: string;
  model?: string;
  durationMs?: number;
  raw?: string;
};

type AiAssignResult = {
  assignments: { keywordId: string; clusterName: string }[];
  newClusters: { name: string; keywordIds: string[] }[];
  leftoverKeywordIds: string[];
  rationale?: string;
  model?: string;
  durationMs?: number;
  raw?: string;
};

type AiCard = {
  id: string;
  label: string;
  keywordIds: string[];
  keywordCount: number;
  totalDemand: number;
  topKeywords: TopKeyword[];
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function fetchAllKeywords(url: string, pageSize = 500): Promise<KeywordsResponse> {
  let page = 1;
  const all: KeywordRow[] = [];
  let total = 0;

  while (true) {
    const pageUrl = `${url}${url.includes("?") ? "&" : "?"}page=${page}&pageSize=${pageSize}`;
    const res = await fetchJson<KeywordsResponse>(pageUrl);

    total = res.total;
    all.push(...res.items);

    if (all.length >= res.total || res.items.length < pageSize) break;
    page += 1;
  }

  return { items: all, total };
}

export default function KeywordWorkspacePage() {
  const { site } = useSite();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [search, setSearch] = useState("");
  const [keywordSearch, setKeywordSearch] = useState("");
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [focusOnly, setFocusOnly] = useState(false);
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [showFocusSheet, setShowFocusSheet] = useState(false);
  const [focusSelection, setFocusSelection] = useState<string[]>([]);
  const [focusSearch, setFocusSearch] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReclustering, setIsReclustering] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiSuggestResult, setAiSuggestResult] = useState<AiSuggestResult | null>(null);
  const [aiAssignResult, setAiAssignResult] = useState<AiAssignResult | null>(null);

  const { data: workspace, isLoading: workspaceLoading } = useSWR<WorkspaceResponse>(
    site ? `/api/keyword-workspace/current?siteUrl=${encodeURIComponent(site)}` : null,
    (url: string) => fetchJson<WorkspaceResponse>(url)
  );

  const projectId = workspace?.projectId ?? null;

  const { data: cardsData, mutate: mutateCards } = useSWR<CardsResponse>(
    projectId ? `/api/keyword-workspace/projects/${projectId}/cards` : null,
    (url: string) => fetchJson<CardsResponse>(url)
  );

  const keywordUrl = projectId
    ? `/api/keyword-workspace/projects/${projectId}/keywords${keywordSearch ? `?q=${encodeURIComponent(keywordSearch)}` : ""}`
    : null;

  const { data: keywordData, mutate: mutateKeywords } = useSWR<KeywordsResponse>(
    keywordUrl,
    (url: string) => fetchAllKeywords(url, 500)
  );

  const cards = cardsData?.items ?? [];
  const keywords = keywordData?.items ?? [];
  const keywordMapByCluster = useMemo(() => {
    const map = new Map<string, KeywordRow[]>();
    keywords.forEach((k) => {
      k.clusterIds.forEach((cid) => {
        const list = map.get(cid) ?? [];
        list.push(k);
        map.set(cid, list);
      });
    });
    return map;
  }, [keywords]);

  const keywordById = useMemo(() => {
    const map = new Map<string, KeywordRow>();
    keywords.forEach((k) => map.set(k.id, k));
    return map;
  }, [keywords]);

  const aiCards: AiCard[] | null = useMemo(() => {
    if (!aiSuggestResult) return null;

    const clusterMap = new Map<string, { id: string; name: string; keywordIds: Set<string> }>();

    aiSuggestResult.clusters.forEach((c, idx) => {
      clusterMap.set(c.name, { id: `ai-${idx}-${c.name}`, name: c.name, keywordIds: new Set(c.keywordIds) });
    });

    if (aiAssignResult) {
      aiAssignResult.assignments.forEach(({ keywordId, clusterName }) => {
        const entry =
          clusterMap.get(clusterName) ??
          (() => {
            const created = { id: `ai-extra-${clusterMap.size}-${clusterName}`, name: clusterName, keywordIds: new Set<string>() };
            clusterMap.set(clusterName, created);
            return created;
          })();
        entry.keywordIds.add(keywordId);
      });

      aiAssignResult.newClusters.forEach((c, idx) => {
        clusterMap.set(c.name, {
          id: `ai-new-${idx}-${c.name}`,
          name: c.name,
          keywordIds: new Set(c.keywordIds)
        });
      });
    }

    const cards: AiCard[] = [];
    clusterMap.forEach((value) => {
      const members = Array.from(value.keywordIds)
        .map((id) => keywordById.get(id))
        .filter(Boolean) as KeywordRow[];
      const totalDemand = members.reduce((sum, m) => sum + (m.demandMonthly ?? 0), 0);
      const topKeywords = members
        .slice()
        .sort((a, b) => (b.demandMonthly ?? 0) - (a.demandMonthly ?? 0))
        .slice(0, 5)
        .map((m) => ({ keywordId: m.id, kwRaw: m.kwRaw, demandMonthly: m.demandMonthly }));

      cards.push({
        id: value.id,
        label: value.name,
        keywordIds: Array.from(value.keywordIds),
        keywordCount: value.keywordIds.size,
        totalDemand,
        topKeywords
      });
    });

    return cards.sort((a, b) => b.totalDemand - a.totalDemand);
  }, [aiSuggestResult, aiAssignResult, keywordById]);

  const showingAi = !!aiCards && aiCards.length > 0;

  useEffect(() => {
    if (!showingAi || !aiCards?.length) return;
    const exists = aiCards.some((c) => c.id === selectedCluster);
    if (!exists) setSelectedCluster(aiCards[0].id);
  }, [showingAi, aiCards, selectedCluster]);

  useEffect(() => {
    if (!projectId) return;
    const raw = localStorage.getItem(`kw-focus-${projectId}`);
    if (!raw) {
      setFocusIds([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as string[];
      setFocusIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setFocusIds([]);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    localStorage.setItem(`kw-focus-${projectId}`, JSON.stringify(focusIds));
  }, [focusIds, projectId]);

  const filteredCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (showingAi && aiCards) {
      if (!term) return aiCards;
      return aiCards.filter((card) => {
        if (card.label.toLowerCase().includes(term)) return true;
        return card.keywordIds
          .map((id) => keywordById.get(id))
          .filter(Boolean)
          .some((k) => k!.kwRaw.toLowerCase().includes(term));
      });
    }
    if (!term) return cards;
    return cards.filter((card) => {
      if (card.label.toLowerCase().includes(term)) return true;
      const kws = keywordMapByCluster.get(card.id) ?? [];
      return kws.some((k) => k.kwRaw.toLowerCase().includes(term));
    });
  }, [cards, keywordMapByCluster, search, showingAi, aiCards, keywordById]);

  const visibleCards = useMemo(() => {
    if (showingAi && aiCards) return aiCards;
    const base = focusOnly ? filteredCards.filter((c) => focusIds.includes(c.id)) : filteredCards;
    return base;
  }, [filteredCards, focusIds, focusOnly, showingAi, aiCards]);

  const clustersForSelect: ClusterOption[] = useMemo(
    () => cards.map((card) => ({ id: card.id, label: card.label })),
    [cards]
  );

  function openFocusSheet() {
    setFocusSelection(focusIds);
    setFocusSearch("");
    setShowFocusSheet(true);
  }

  function toggleSelection(clusterId: string) {
    setFocusSelection((prev) => {
      if (prev.includes(clusterId)) return prev.filter((id) => id !== clusterId);
      return [...prev, clusterId];
    });
  }

  const filteredFocusClusters = useMemo(() => {
    const term = focusSearch.trim().toLowerCase();
    if (!term) return cards;
    return cards.filter((card) => {
      if (card.label.toLowerCase().includes(term)) return true;
      const kws = keywordMapByCluster.get(card.id) ?? [];
      return kws.some((k) => k.kwRaw.toLowerCase().includes(term));
    });
  }, [cards, focusSearch, keywordMapByCluster]);

  function saveFocusSelection() {
    setFocusIds(focusSelection);
    setFocusOnly(true);
    setShowFocusSheet(false);
  }

  function toggleRowExpand(clusterId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }

  async function runAiFull() {
    if (!projectId) return;
    setAiProcessing(true);
    setAiSuggestResult(null);
    setAiAssignResult(null);
    try {
      const suggestRes = await fetch(`/api/keyword-workspace/projects/${projectId}/ai/suggest`, { method: "POST" });
      const suggestData = await suggestRes.json().catch(() => ({}));
      if (!suggestRes.ok) throw new Error(suggestData?.message ?? "AI-Vorschlag fehlgeschlagen");
      setAiSuggestResult(suggestData as AiSuggestResult);

      const assignRes = await fetch(`/api/keyword-workspace/projects/${projectId}/ai/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clusters: (suggestData as AiSuggestResult).clusters,
          leftoverKeywordIds: (suggestData as AiSuggestResult).leftoverKeywordIds
        })
      });
      const assignData = await assignRes.json().catch(() => ({}));
      if (!assignRes.ok) throw new Error(assignData?.message ?? "AI-Mapping fehlgeschlagen");
      setAiAssignResult(assignData as AiAssignResult);

      toast.success("AI-Clustering abgeschlossen");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI-Flow fehlgeschlagen";
      toast.error(msg);
    } finally {
      setAiProcessing(false);
    }
  }

  async function refreshFromGsc() {
    if (!site) return;
    setIsRefreshing(true);
    const res = await fetch("/api/keyword-workspace/current/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteUrl: site, days })
    });
    setIsRefreshing(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.message ?? "GSC-Aktualisierung fehlgeschlagen");
      return;
    }
    toast.success("GSC-Daten aktualisiert");
    await Promise.all([mutateCards(), mutateKeywords()]);
  }

  async function rebuildClusters() {
    if (!site) return;
    setIsReclustering(true);
    const res = await fetch("/api/keyword-workspace/current/recluster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteUrl: site })
    });
    setIsReclustering(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.message ?? "Neu-Clustering fehlgeschlagen");
      return;
    }
    toast.success("Cluster neu berechnet");
    await Promise.all([mutateCards(), mutateKeywords()]);
  }

  async function handleUploadFile(file: File) {
    if (!site) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("siteUrl", site);
    formData.append("file", file);
    const res = await fetch("/api/keyword-workspace/current/upload", {
      method: "POST",
      body: formData
    });
    setIsUploading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.message ?? "Upload fehlgeschlagen");
      return;
    }
    toast.success("Upload gespeichert");
    await Promise.all([mutateCards(), mutateKeywords()]);
  }

  async function moveKeyword(keywordId: string, toClusterId: string) {
    if (!projectId) return;
    const res = await fetch(`/api/keyword-workspace/projects/${projectId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "MOVE_KEYWORDS", keywordIds: [keywordId], fromClusterId: null, toClusterId })
    });
    if (!res.ok) {
      toast.error("Move fehlgeschlagen");
      return;
    }
    await Promise.all([mutateKeywords(), mutateCards()]);
  }

  if (!site) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Keine Property ausgewählt</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Wähle oben links eine Property aus. Danach wird der Clustering-Workspace automatisch geladen.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (workspaceLoading) {
    return <p className="text-sm text-muted-foreground">Workspace wird vorbereitet...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-input">
            <button
              type="button"
              onClick={() => setDays(7)}
              className={`px-3 py-1.5 text-xs font-medium ${days === 7 ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}
            >
              7 Tage
            </button>
            <button
              type="button"
              onClick={() => setDays(30)}
              className={`border-l border-input px-3 py-1.5 text-xs font-medium ${days === 30 ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}
            >
              1 Monat
            </button>
            <button
              type="button"
              onClick={() => setDays(90)}
              className={`border-l border-input px-3 py-1.5 text-xs font-medium ${days === 90 ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}
            >
              3 Monate
            </button>
          </div>

          <Button onClick={refreshFromGsc} disabled={isRefreshing}>
            {isRefreshing ? "Lädt..." : "GSC laden"}
          </Button>
          <Button variant="outline" onClick={rebuildClusters} disabled={isReclustering}>
            {isReclustering ? "Berechne..." : "Cluster neu berechnen"}
          </Button>
          <Button variant="outline" onClick={runAiFull} disabled={aiProcessing || !projectId}>
            {aiProcessing ? "AI..." : "AI Clustern"}
          </Button>
          <Button
            variant={showDrawer ? "default" : "outline"}
            onClick={() => setShowDrawer((prev) => !prev)}
            className="gap-2"
          >
            <Edit3 className="h-4 w-4" />
            Keywords
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {isUploading ? "Upload..." : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadFile(file);
              e.currentTarget.value = "";
            }}
          />
        </div>

      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Cluster suchen" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <Button variant={focusOnly ? "default" : "outline"} onClick={() => setFocusOnly((prev) => !prev)}>
            {focusOnly ? "Alle anzeigen" : "Nur Fokus"}
          </Button>
          <Button variant="outline" onClick={openFocusSheet} className="gap-2">
            <Eye className="h-4 w-4" />
            Fokus bearbeiten
          </Button>
          <Badge variant="secondary">Fokus: {focusIds.length}</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleCards.map((card) => (
            <Card
              key={card.id}
              className={`cursor-pointer ${selectedCluster === card.id ? "border-primary" : ""}`}
              onClick={() => setSelectedCluster(card.id)}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="truncate">{card.label}</span>
                  <span className="text-xs text-muted-foreground">{card.keywordCount} KW</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">Demand {Math.round(card.totalDemand)}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1 text-xs text-muted-foreground">
                  {card.topKeywords?.map((keyword) => (
                    <div key={keyword.keywordId} className="truncate">
                      {keyword.kwRaw} ({Math.round(keyword.demandMonthly)})
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {!visibleCards.length && (
            <p className="text-sm text-muted-foreground">
              {showingAi ? "Keine AI-Cluster vorhanden." : "Keine Cluster vorhanden. Lade zuerst GSC-Daten oder optional einen Upload."}
            </p>
          )}
        </div>
        </div>

        <Card className="h-[80vh]">
          <CardHeader>
            <CardTitle>{showDrawer ? "Keyword Drawer" : showingAi ? "AI Cluster Details" : "Cluster Details"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {showDrawer ? (
              <>
                <Input
                  placeholder="Keywords suchen"
                  value={keywordSearch}
                  onChange={(e) => setKeywordSearch(e.target.value)}
                />
                <ScrollArea className="h-[60vh] pr-2">
                  <div className="space-y-3">
                    {keywords.map((keyword) => (
                      <div key={keyword.id} className="rounded border p-2 text-sm">
                        <div className="font-medium">{keyword.kwRaw}</div>
                        <div className="text-xs text-muted-foreground">Demand {Math.round(keyword.demandMonthly)}</div>
                        <div className="mt-2 space-y-1">
                          <Label className="text-xs">Verschieben nach</Label>
                          <Select onValueChange={(value) => moveKeyword(keyword.id, value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Cluster wählen" />
                            </SelectTrigger>
                            <SelectContent>
                              {clustersForSelect.map((cluster) => (
                                <SelectItem key={cluster.id} value={cluster.id}>
                                  {cluster.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                    {!keywords.length && <p className="text-xs text-muted-foreground">Noch keine Keywords geladen.</p>}
                  </div>
                </ScrollArea>
              </>
            ) : selectedCluster ? (
              showingAi && aiCards ? (
                <AiClusterInspector clusterId={selectedCluster} clusters={aiCards} keywordById={keywordById} />
              ) : (
                <ClusterInspector clusterId={selectedCluster} clusters={cards} keywords={keywords} />
              )
            ) : (
              <p className="text-sm text-muted-foreground">Cluster wählen, um Details zu sehen.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={showFocusSheet} onOpenChange={setShowFocusSheet}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Fokus bearbeiten</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <Input
              placeholder="Cluster oder Keywords suchen"
              value={focusSearch}
              onChange={(e) => setFocusSearch(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFocusSelection(filteredFocusClusters.map((c) => c.id))}
              >
                Alle wählen
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFocusSelection([])}>
                Keine
              </Button>
            </div>
            <div className="space-y-2">
              <ScrollArea className="h-[60vh] pr-2">
                <div className="space-y-2">
                  {filteredFocusClusters.map((card) => {
                    const expanded = expandedRows.has(card.id);
                    const clusterKeywords = keywordMapByCluster.get(card.id) ?? [];
                    return (
                      <div key={card.id} className="rounded border p-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={focusSelection.includes(card.id)}
                            onCheckedChange={() => toggleSelection(card.id)}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{card.label}</div>
                            <div className="text-xs text-muted-foreground">
                              Demand {Math.round(card.totalDemand)} · {card.keywordCount} Keywords
                            </div>
                          </div>
                          <button
                            type="button"
                            className="ml-auto text-muted-foreground"
                            onClick={() => toggleRowExpand(card.id)}
                          >
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </div>
                        {expanded && (
                          <div className="mt-2 space-y-1 pl-7 text-xs text-muted-foreground">
                            {clusterKeywords.length
                              ? clusterKeywords.map((k) => (
                                  <div key={k.id} className="flex items-center justify-between gap-2">
                                    <span className="truncate">{k.kwRaw}</span>
                                    <span>{Math.round(k.demandMonthly)}</span>
                                  </div>
                                ))
                              : "Keine Keywords"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!filteredFocusClusters.length && (
                    <p className="text-sm text-muted-foreground">Keine Cluster für die Suche gefunden.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
          <SheetFooter className="mt-4">
            <div className="flex w-full justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFocusSheet(false)}>
                Abbrechen
              </Button>
              <Button onClick={saveFocusSelection}>Speichern</Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ClusterInspector({
  clusterId,
  clusters,
  keywords
}: {
  clusterId: string;
  clusters: ClusterCard[];
  keywords: KeywordRow[];
}) {
  const cluster = clusters.find((c) => c.id === clusterId);
  if (!cluster) {
    return <p className="text-sm text-muted-foreground">Cluster nicht gefunden.</p>;
  }
  const members = keywords.filter((k) => k.clusterIds.includes(clusterId));
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">{cluster.label}</h3>
        <p className="text-sm text-muted-foreground">
          Demand {Math.round(cluster.totalDemand)} · Keywords {cluster.keywordCount} · Cohesion n/a
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Keywords</p>
        <ScrollArea className="h-[54vh] pr-2">
          <div className="space-y-1 text-sm text-muted-foreground">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{m.kwRaw}</span>
                <span className="text-xs">{Math.round(m.demandMonthly)}</span>
              </div>
            ))}
            {!members.length && <p className="text-xs">Keine Keywords zugewiesen.</p>}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function AiClusterInspector({
  clusterId,
  clusters,
  keywordById
}: {
  clusterId: string;
  clusters: AiCard[];
  keywordById: Map<string, KeywordRow>;
}) {
  const cluster = clusters.find((c) => c.id === clusterId);
  if (!cluster) return <p className="text-sm text-muted-foreground">AI-Cluster nicht gefunden.</p>;
  const members = cluster.keywordIds.map((id) => keywordById.get(id)).filter(Boolean) as KeywordRow[];
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">{cluster.label}</h3>
        <p className="text-sm text-muted-foreground">
          Demand {Math.round(cluster.totalDemand)} · Keywords {cluster.keywordCount}
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Keywords</p>
        <ScrollArea className="h-[54vh] pr-2">
          <div className="space-y-1 text-sm text-muted-foreground">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{m.kwRaw}</span>
                <span className="text-xs">{Math.round(m.demandMonthly)}</span>
              </div>
            ))}
            {!members.length && <p className="text-xs">Keine Keywords zugewiesen.</p>}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
