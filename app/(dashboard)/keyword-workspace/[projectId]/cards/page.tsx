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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CardsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [search, setSearch] = useState("");
  const [keywordSearch, setKeywordSearch] = useState("");
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const { data: cardData, mutate: refreshCards } = useSWR(
    `/api/keyword-workspace/projects/${projectId}/cards${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    fetcher
  );
  const { data: keywordData, mutate: refreshKeywords } = useSWR(
    `/api/keyword-workspace/projects/${projectId}/keywords${keywordSearch ? `?q=${encodeURIComponent(keywordSearch)}` : ""}`,
    fetcher
  );

  const cards = cardData?.items ?? [];
  const keywords = keywordData?.items ?? [];

  const clustersForSelect = useMemo(
    () => cards.map((c: any) => ({ id: c.id, label: c.label })),
    [cards]
  );

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
          {cards.map((c: any) => (
            <Card
              key={c.id}
              className={`cursor-pointer ${selectedCluster === c.id ? "border-primary" : ""}`}
              onClick={() => setSelectedCluster(c.id)}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">{c.label}</span>
                  <span className="text-xs text-muted-foreground">{c.keywordCount} KW</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">Demand {Math.round(c.totalDemand)}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {c.topKeywords?.map((k: any) => (
                    <div key={k.keywordId} className="truncate">
                      {k.kwRaw} ({k.demandMonthly})
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
              {keywords.map((k: any) => (
                <div key={k.id} className="rounded border p-2 text-sm">
                  <div className="font-medium">{k.kwRaw}</div>
                  <div className="text-xs text-muted-foreground">Demand {k.demandMonthly}</div>
                  <div className="mt-2 space-y-1">
                    <Label className="text-xs">Verschieben nach</Label>
                    <Select onValueChange={(v) => moveKeyword(k.id, v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Cluster wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {clustersForSelect.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
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
