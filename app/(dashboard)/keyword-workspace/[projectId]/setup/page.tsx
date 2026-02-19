"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type DetectedColumns = {
  keyword: string | null;
  volume: string | null;
  impressions?: string | null;
  clicks?: string | null;
  position?: string | null;
  url?: string | null;
};

type UploadResponse = {
  importId: string;
  sourceId: string;
  detectedColumns: DetectedColumns;
  previewRows: Array<Record<string, string | number | null>>;
};

type MappingState = {
  keywordColumn: string;
  volumeColumn?: string;
  impressionsColumn?: string;
  clicksColumn?: string;
  positionColumn?: string;
  urlColumn?: string;
};

type CardsResponse = {
  items: Array<{
    id: string;
    label: string;
    totalDemand: number;
    keywordCount: number;
  }>;
  total: number;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export default function SetupPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [detected, setDetected] = useState<UploadResponse | null>(null);
  const [mapping, setMapping] = useState<MappingState>({ keywordColumn: "" });

  const { data: cards } = useSWR<CardsResponse>(
    `/api/keyword-workspace/projects/${projectId}/cards`,
    (url: string) => fetchJson<CardsResponse>(url)
  );

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("projectId", projectId);
    fd.append("file", file);
    const res = await fetch("/api/keyword-workspace/imports/upload", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      toast.error("Upload fehlgeschlagen");
      return;
    }
    const json = (await res.json()) as UploadResponse;
    setDetected({ ...json, importId: json.importId, previewRows: json.previewRows });
    setMapping({
      keywordColumn: json.detectedColumns.keyword ?? "",
      volumeColumn: json.detectedColumns.volume ?? undefined
    });
  }

  async function confirmMapping() {
    if (!detected?.importId) return;
    const res = await fetch(`/api/keyword-workspace/imports/${detected.importId}/confirm-mapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping)
    });
    if (!res.ok) {
      toast.error("Mapping fehlgeschlagen");
      return;
    }
    toast.success("Mapping bestätigt");
  }

  async function runStandardize() {
    const res = await fetch(`/api/keyword-workspace/projects/${projectId}/standardize`, { method: "POST" });
    if (!res.ok) {
      toast.error("Standardisierung fehlgeschlagen");
      return;
    }
    toast.success("Standardisierung abgeschlossen");
  }

  async function runPrecluster() {
    const res = await fetch(`/api/keyword-workspace/projects/${projectId}/precluster`, { method: "POST" });
    if (!res.ok) {
      toast.error("Precluster fehlgeschlagen");
      return;
    }
    toast.success("Precluster erstellt");
    router.push(`/keyword-workspace/${projectId}/cards`);
  }

  const previewHeaders = detected?.previewRows?.[0] ? Object.keys(detected.previewRows[0]) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Setup</h1>
        <div className="space-x-2">
          <Button variant="outline" onClick={() => router.push(`/keyword-workspace/${projectId}/cards`)}>
            Zu den Clustern
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button onClick={handleUpload} disabled={uploading || !file}>
            Datei hochladen
          </Button>
          {detected && (
            <div className="space-y-2 text-sm">
              <p>Spaltenerkennung:</p>
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <Label>Keyword</Label>
                  <Select
                    value={mapping.keywordColumn}
                    onValueChange={(v) => setMapping((prev) => ({ ...prev, keywordColumn: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {previewHeaders.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Volume</Label>
                  <Select
                    value={mapping.volumeColumn}
                    onValueChange={(v) => setMapping((prev) => ({ ...prev, volumeColumn: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {previewHeaders.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button variant="secondary" onClick={confirmMapping}>
                Mapping bestätigen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={runStandardize}>Standardisieren</Button>
          <Button onClick={runPrecluster} variant="outline">
            Precluster ausführen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Precluster Vorschau</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {cards?.items?.map((card) => (
              <div key={card.id} className="rounded border p-3">
                <div className="font-medium">{card.label}</div>
                <div className="text-xs text-muted-foreground">
                  Demand {card.totalDemand} · Keywords {card.keywordCount}
                </div>
              </div>
            ))}
            {!cards?.items?.length && <p className="text-sm text-muted-foreground">Noch keine Precluster.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
