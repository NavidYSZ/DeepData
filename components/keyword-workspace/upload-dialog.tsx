"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

type DetectedColumns = {
  keyword: string | null;
  volume: string | null;
  impressions: string | null;
  clicks: string | null;
  position: string | null;
  url: string | null;
  cpc: string | null;
  kd: string | null;
};

type UploadResponse = {
  importId: string;
  sourceId: string;
  sourceName: string;
  headers: string[];
  detectedColumns: DetectedColumns;
  previewRows: Record<string, any>[];
};

type ColumnMapping = {
  keyword: string;
  volume: string;
  impressions: string;
  clicks: string;
  position: string;
  url: string;
  cpc: string;
  kd: string;
};

const SKIP = "__skip__";

const COLUMN_LABELS: Record<keyof ColumnMapping, string> = {
  keyword: "Keyword",
  volume: "Suchvolumen",
  impressions: "Impressionen",
  clicks: "Klicks",
  position: "Position",
  url: "URL",
  cpc: "CPC",
  kd: "Keyword Difficulty"
};

export type UploadImportMode = "merge" | "upload_only";

export type UploadImportCompletePayload = {
  sourceId: string;
  sourceName: string;
  importMode: UploadImportMode;
  rowCount: number;
};

type Props = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: (payload: UploadImportCompletePayload) => void;
};

export function UploadKeywordsDialog({ projectId, open, onOpenChange, onImportComplete }: Props) {
  const [step, setStep] = useState<"upload" | "mapping" | "importing">("upload");
  const [uploading, setUploading] = useState(false);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    keyword: SKIP,
    volume: SKIP,
    impressions: SKIP,
    clicks: SKIP,
    position: SKIP,
    url: SKIP,
    cpc: SKIP,
    kd: SKIP
  });
  const [importMode, setImportMode] = useState<UploadImportMode>("merge");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setUploading(false);
    setUploadData(null);
    setDragOver(false);
    setImportMode("merge");
    setMapping({
      keyword: SKIP,
      volume: SKIP,
      impressions: SKIP,
      clicks: SKIP,
      position: SKIP,
      url: SKIP,
      cpc: SKIP,
      kd: SKIP
    });
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) reset();
      onOpenChange(open);
    },
    [onOpenChange, reset]
  );

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("projectId", projectId);
      form.append("file", file);

      const res = await fetch("/api/keyword-workspace/imports/upload", {
        method: "POST",
        body: form
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "Upload fehlgeschlagen");
        setUploading(false);
        return;
      }

      const uploadRes = data as UploadResponse;
      setUploadData(uploadRes);

      // Initialize mapping from detected columns
      const det = uploadRes.detectedColumns;
      setMapping({
        keyword: det.keyword ?? SKIP,
        volume: det.volume ?? SKIP,
        impressions: det.impressions ?? SKIP,
        clicks: det.clicks ?? SKIP,
        position: det.position ?? SKIP,
        url: det.url ?? SKIP,
        cpc: det.cpc ?? SKIP,
        kd: det.kd ?? SKIP
      });

      setStep("mapping");
    } catch (e) {
      toast.error("Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  async function confirmMapping() {
    if (!uploadData || mapping.keyword === SKIP) {
      toast.error("Bitte eine Keyword-Spalte auswählen");
      return;
    }

    setStep("importing");
    try {
      const body: Record<string, string> = {
        keywordColumn: mapping.keyword,
        importMode
      };
      if (mapping.volume !== SKIP) body.volumeColumn = mapping.volume;
      if (mapping.impressions !== SKIP) body.impressionsColumn = mapping.impressions;
      if (mapping.clicks !== SKIP) body.clicksColumn = mapping.clicks;
      if (mapping.position !== SKIP) body.positionColumn = mapping.position;
      if (mapping.url !== SKIP) body.urlColumn = mapping.url;
      if (mapping.cpc !== SKIP) body.cpcColumn = mapping.cpc;
      if (mapping.kd !== SKIP) body.kdColumn = mapping.kd;

      const res = await fetch(`/api/keyword-workspace/imports/${uploadData.importId}/confirm-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "Import fehlgeschlagen");
        setStep("mapping");
        return;
      }

      toast.success(
        importMode === "upload_only"
          ? `${data.rowCount} Keywords importiert. Der nächste Run nutzt nur diesen Upload.`
          : `${data.rowCount} Keywords importiert und mit den vorhandenen Keywords kombiniert.`
      );
      onImportComplete({
        sourceId: data.sourceId ?? uploadData.sourceId,
        sourceName: data.sourceName ?? uploadData.sourceName,
        importMode: data.importMode ?? importMode,
        rowCount: data.rowCount ?? 0
      });
      handleOpenChange(false);
    } catch (e) {
      toast.error("Import fehlgeschlagen");
      setStep("mapping");
    }
  }

  const headers = uploadData?.headers ?? [];
  const previewRows = uploadData?.previewRows ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Externe Keywords importieren</DialogTitle>
          <DialogDescription>
            CSV- oder Excel-Dateien hochladen. Du kannst den Upload entweder mit den vorhandenen
            GSC-Keywords kombinieren oder nur die hochgeladene Liste fürs Clustering verwenden.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div
            className={[
              "flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
            ].join(" ")}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {uploading ? (
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            ) : (
              <FileUp className="h-10 w-10 text-muted-foreground" />
            )}
            <div className="text-center">
              <p className="text-sm font-medium">
                {uploading ? "Wird hochgeladen..." : "Datei hierher ziehen oder klicken"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                CSV, Excel (.xlsx, .xls) - max. 20 MB
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.tsv,.txt"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </div>
        )}

        {step === "mapping" && (
          <div className="flex flex-col gap-4 min-h-0 flex-1">
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Import-Modus</Label>
                <p className="text-xs text-muted-foreground">
                  Entscheidet, ob der nächste Cluster-Run alle Projekt-Keywords oder nur diesen
                  Upload verwendet.
                </p>
              </div>

              <RadioGroup
                value={importMode}
                onValueChange={(value) => setImportMode(value as UploadImportMode)}
                className="grid gap-3 md:grid-cols-2"
              >
                <label
                  className={[
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                    importMode === "merge"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  ].join(" ")}
                >
                  <RadioGroupItem value="merge" className="mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Mit vorhandenen Keywords kombinieren</p>
                    <p className="text-xs text-muted-foreground">
                      Upload wird zu den bestehenden Search-Console- und Upload-Daten hinzugefügt.
                    </p>
                  </div>
                </label>

                <label
                  className={[
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                    importMode === "upload_only"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  ].join(" ")}
                >
                  <RadioGroupItem value="upload_only" className="mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Nur diesen Upload clustern</p>
                    <p className="text-xs text-muted-foreground">
                      Ideal für reine Keyword-Listen. Der nächste Run nutzt nur die hochgeladenen
                      Keywords aus dieser Datei.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.keys(COLUMN_LABELS) as (keyof ColumnMapping)[]).map((field) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs">
                    {COLUMN_LABELS[field]}
                    {field === "keyword" && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  <Select
                    value={mapping[field]}
                    onValueChange={(val) => setMapping((prev) => ({ ...prev, [field]: val }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>-- Überspringen --</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {mapping.keyword === SKIP && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                Eine Keyword-Spalte muss ausgewählt werden
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Vorschau (erste {previewRows.length} Zeilen):
            </div>

            <ScrollArea className="flex-1 min-h-0 max-h-[300px] rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => {
                      const matchedField = (Object.keys(mapping) as (keyof ColumnMapping)[]).find(
                        (f) => mapping[f] === h
                      );
                      return (
                        <TableHead key={h} className="text-xs whitespace-nowrap">
                          {h}
                          {matchedField && (
                            <span className="ml-1 text-[10px] text-primary font-medium">
                              ({COLUMN_LABELS[matchedField]})
                            </span>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, idx) => (
                    <TableRow key={idx}>
                      {headers.map((h) => (
                        <TableCell key={h} className="text-xs py-1.5 whitespace-nowrap max-w-[200px] truncate">
                          {String(row[h] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Keywords werden importiert...</p>
          </div>
        )}

        {step === "mapping" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => { reset(); setStep("upload"); }}>
              Zurück
            </Button>
            <Button onClick={confirmMapping} disabled={mapping.keyword === SKIP}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Importieren
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
