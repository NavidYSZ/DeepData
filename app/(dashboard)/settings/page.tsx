"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";

import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PageHeader, SectionCard } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_CHART_LINE_WIDTH,
  clampChartLineWidth,
  readChartLineWidth,
  writeChartLineWidth
} from "@/lib/ui-settings";

export default function SettingsPage() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [lineWidthValue, setLineWidthValue] = useState(String(DEFAULT_CHART_LINE_WIDTH));

  useEffect(() => {
    setMounted(true);
    setLineWidthValue(String(readChartLineWidth()));
  }, []);

  const selectedTheme = mounted
    ? theme === "system"
      ? resolvedTheme ?? "light"
      : theme ?? "light"
    : "light";

  function onLineWidthChange(raw: string) {
    setLineWidthValue(raw);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const next = writeChartLineWidth(parsed);
    setLineWidthValue(String(next));
  }

  function onLineWidthBlur() {
    const parsed = Number(lineWidthValue);
    if (!Number.isFinite(parsed)) {
      setLineWidthValue(String(readChartLineWidth()));
      return;
    }
    const next = writeChartLineWidth(clampChartLineWidth(parsed));
    setLineWidthValue(String(next));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Lokale Einstellungen fuer Darstellung und Charts."
      />

      <SectionCard title="Theme" description="Waehle zwischen Light und Dark Mode.">
        <RadioGroup
          value={selectedTheme}
          onValueChange={(val) => setTheme(val === "dark" ? "dark" : "light")}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm">
            <RadioGroupItem value="light" id="theme-light" />
            <span>Light</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm">
            <RadioGroupItem value="dark" id="theme-dark" />
            <span>Dark</span>
          </label>
        </RadioGroup>
      </SectionCard>

      <SectionCard title="Charts" description="Linien-Dicke fuer Graphen, z.B. by Query.">
        <div className="max-w-xs space-y-2">
          <label className="text-sm font-medium">Linien-Dicke</label>
          <Input
            type="number"
            min={0.5}
            max={8}
            step={0.1}
            value={lineWidthValue}
            onChange={(e) => onLineWidthChange(e.target.value)}
            onBlur={onLineWidthBlur}
          />
          <p className="text-xs text-muted-foreground">
            Wird lokal im Browser gespeichert.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Session" description="Account und Sitzung verwalten.">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Logout
          </Button>
          <p className="text-xs text-muted-foreground">
            Logout wurde aus dem globalen Header hierhin verschoben.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
