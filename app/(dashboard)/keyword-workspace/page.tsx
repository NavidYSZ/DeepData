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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, Edit3, Eye, EyeOff, Check } from "lucide-react";

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
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
  const [focusPickMode, setFocusPickMode] = useState(false);
  const [tempFocusIds, setTempFocusIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReclustering, setIsReclustering] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  const { data: workspace, isLoading: workspaceLoading } = useSWR<WorkspaceResponse>(
    site ? `/api/keyword-workspace/current?siteUrl=${encodeURIComponent(site)}` : null,
    (url: string) => fetchJson<WorkspaceResponse>(url)
  );

  const projectId = workspace?.projectId ?? null;

  const { data: cardsData, mutate: mutateCards } = useSWR<CardsResponse>(
    projectId
      ? `/api/keyword-workspace/projects/${projectId}/cards${search ? `?search=${encodeURIComponent(search)}` : ""}`
      : null,
    (url: string) => fetchJson<CardsResponse>(url)
  );

  const { data: keywordData, mutate: mutateKeywords } = useSWR<KeywordsResponse>(
    projectId
      ? `/api/keyword-workspace/projects/${projectId}/keywords${keywordSearch ? `?q=${encodeURIComponent(keywordSearch)}` : ""}`
      : null,
    (url: string) => fetchJson<KeywordsResponse>(url)
  );

  const cards = cardsData?.items ?? [];
  const keywords = keywordData?.items ?? [];

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

  const visibleCards = useMemo(() => {
    if (!focusOnly) return cards;
    const focusSet = new Set(focusIds);
    return cards.filter((card) => focusSet.has(card.id));
  }, [cards, focusIds, focusOnly]);

  const clustersForSelect: ClusterOption[] = useMemo(
    () => cards.map((card) => ({ id: card.id, label: card.label })),
    [cards]
  );

  function toggleFocus(clusterId: string) {
    setFocusIds((prev) => {
      if (prev.includes(clusterId)) return prev.filter((id) => id !== clusterId);
      return [...prev, clusterId];
    });
  }

  function toggleFocusPick() {
    if (focusPickMode) {
      setFocusIds(tempFocusIds);
      setFocusOnly(true);
      setFocusPickMode(false);
      setTempFocusIds([]);
      return;
    }
    setTempFocusIds(focusIds.length ? focusIds : cards.map((c) => c.id));
    setFocusPickMode(true);
  }

  function handlePickToggle(clusterId: string) {
    setTempFocusIds((prev) => {
      if (prev.includes(clusterId)) return prev.filter((id) => id !== clusterId);
      return [...prev, clusterId];
    });
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
          <Badge variant="secondary" className="max-w-full truncate">
            Property: {site}
          </Badge>
          <Badge variant="secondary">Zeitraum (Monats-normalisiert)</Badge>
        </div>

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
            {isUploading ? "Upload..." : "Upload (optional)"}
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
            <Button variant={focusPickMode ? "default" : "outline"} onClick={toggleFocusPick} className="gap-2">
              {focusPickMode ? <Check className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {focusPickMode ? "Fertig" : "Fokus wählen"}
            </Button>
            <Badge variant="secondary">Fokus: {focusIds.length}</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleCards.map((card) => (
              <Card
                key={card.id}
                className={`cursor-pointer ${
                  focusPickMode && !tempFocusIds.includes(card.id) ? "border border-dashed border-primary/60" : ""
                } ${selectedCluster === card.id && !focusPickMode ? "border-primary" : ""}`}
                onClick={() => {
                  if (focusPickMode) {
                    handlePickToggle(card.id);
                    return;
                  }
                  setSelectedCluster(card.id);
                }}
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
                Keine Cluster vorhanden. Lade zuerst GSC-Daten oder optional einen Upload.
              </p>
            )}
          </div>
        </div>

        <Card className="h-[80vh]">
          <CardHeader>
            <CardTitle>{showDrawer ? "Keyword Drawer" : "Cluster Details"}</CardTitle>
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
              <ClusterInspector
                clusterId={selectedCluster}
                clusters={cards}
                keywords={keywords}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Cluster wählen, um Details zu sehen.</p>
            )}
          </CardContent>
        </Card>
      </div>
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
