"use client";

import { useState } from "react";
import { Boxes, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { NlpPlayground } from "./_components/playground";
import { ClusterAnalysis } from "./_components/cluster-analysis";

type View = "clusters" | "playground";

export default function NlpPage() {
  const [view, setView] = useState<View>("clusters");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3 rounded-lg border bg-card px-4 py-2">
        <span
          className={`inline-flex items-center gap-1.5 text-sm ${
            view === "clusters"
              ? "font-medium text-foreground"
              : "text-muted-foreground"
          }`}
        >
          <Boxes className="h-4 w-4" />
          Topical Authority
        </span>
        <Switch
          checked={view === "playground"}
          onCheckedChange={(v) => setView(v ? "playground" : "clusters")}
          aria-label="Modus wechseln"
        />
        <span
          className={`inline-flex items-center gap-1.5 text-sm ${
            view === "playground"
              ? "font-medium text-foreground"
              : "text-muted-foreground"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          NLP Playground
        </span>
      </div>

      {view === "clusters" ? <ClusterAnalysis /> : <NlpPlayground />}
    </div>
  );
}
