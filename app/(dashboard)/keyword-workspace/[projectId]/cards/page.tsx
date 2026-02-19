"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

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
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export default function CardsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [search, setSearch] = useState("");
  const [keywordSearch, setKeywordSearch] = useState("");
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const { data: cardData, mutate: refreshCards } = useSWR<CardsResponse>(
    `/api/keyword-workspace/projects/${projectId}/cards${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    (url: string) => fetchJson<CardsResponse>(url)
  );
  const { data: keywordData, mutate: refreshKeywords } = useSWR<KeywordsResponse>(
    `/api/keyword-workspace/projects/${projectId}/keywords${keywordSearch ? `?q=${encodeURIComponent(keywordSearch)}` : ""}`,
    (url: string) => fetchJson<KeywordsResponse>(url)
  );

  const cards: ClusterCard[] = cardData?.items ?? [];
  const keywords: KeywordRow[] = keywordData?.items ?? [];

  const clustersForSelect: ClusterOption[] = useMemo(() => cards.map((card) => ({ id: card.id, label: card.label })), [cards]);

  async function moveKeyword(keywordId: string, toClusterId: string) {
    const res = await fetch(`/api/keyword-workspace/projects/${projectId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "MOVE_KEYWORDS", keywordIds: [keywordId], fromClusterId: null, toClusterId })
    });
    if (!res.ok) {
      toast.error("Move fehlgeschlagen");
      return;
    }
    toast.success("Keyword verschoben");
    refreshKeywords();
    refreshCards();
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder="Cluster suchen" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button variant="outline" onClick={() => refreshCards()}>
            Refresh
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <Card
              key={card.id}
              className={`cursor-pointer ${selectedCluster === card.id ? "border-primary" : ""}`}
              onClick={() => setSelectedCluster(card.id)}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">{card.label}</span>
                  <span className="text-xs text-muted-foreground">{card.keywordCount} KW</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">Demand {Math.round(card.totalDemand)}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {card.topKeywords?.map((keyword) => (
                    <div key={keyword.keywordId} className="truncate">
                      {keyword.kwRaw} ({keyword.demandMonthly})
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {!cards.length && <p className="text-sm text-muted-foreground">Keine Precluster vorhanden.</p>}
        </div>
      </div>

      <Card className="h-[80vh]">
        <CardHeader>
          <CardTitle>Keyword Drawer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Keywords suchen" value={keywordSearch} onChange={(e) => setKeywordSearch(e.target.value)} />
          <ScrollArea className="h-[60vh] pr-2">
            <div className="space-y-3">
              {keywords.map((keyword) => (
                <div key={keyword.id} className="rounded border p-2 text-sm">
                  <div className="font-medium">{keyword.kwRaw}</div>
                  <div className="text-xs text-muted-foreground">Demand {keyword.demandMonthly}</div>
                  <div className="mt-2 space-y-1">
                    <Label className="text-xs">Verschieben nach</Label>
                    <Select onValueChange={(v) => moveKeyword(keyword.id, v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Cluster wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {clustersForSelect.map((clusterOption) => (
                          <SelectItem key={clusterOption.id} value={clusterOption.id}>
                            {clusterOption.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
              {!keywords.length && <p className="text-xs text-muted-foreground">Keine Keywords geladen.</p>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
