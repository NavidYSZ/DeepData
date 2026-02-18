"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Option = { value: string; label: string; impressions: number };

type Props = {
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  onOnly: (value: string) => void;
  max?: number;
};

export function QueryMultiSelect({ options, selected, onChange, onOnly, max = 15 }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const list = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
    return [...list].sort((a, b) => b.impressions - a.impressions);
  }, [options, search]);
  const allOptions = useMemo(() => options.map((o) => o.value), [options]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setHighlight(0);
    }
  }, [open]);

  const disabled = selected.length >= max;
  const totalOptions = allOptions.length;
  const countLabel = `${selected.length}/${totalOptions || 0}`;

  function toggleValue(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      if (disabled) return;
      const next = [...selected, value];
      onChange(next.length > max ? next.slice(0, max) : next);
    }
  }

  function toggleAll() {
    const selectedAll = selected.length >= allOptions.length;
    onChange(selectedAll ? [] : allOptions.slice(0, max));
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!open) return;
    if (!filtered.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) toggleValue(opt.value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm transition hover:border-primary",
            open && "ring-2 ring-primary/40"
          )}
        >
          <span className="text-left">
            Keywords <span className="text-muted-foreground">· {countLabel}</span>
          </span>
          <span className="text-muted-foreground text-xs">▼</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(32rem,calc(100vw-2rem))] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onKeyDown={handleKey}
      >
          <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={cn(
                  "h-5 w-5 rounded-sm border flex items-center justify-center transition",
                  selected.length >= Math.min(allOptions.length, max)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAll();
                }}
                aria-label="Alle auswählen/abwählen"
              >
                {selected.length >= Math.min(allOptions.length, max) && (
                  <Check className="h-3 w-3" />
                )}
              </button>
              ODER auswählen
            </div>
            <span>Impressions</span>
          </div>

          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                className="h-9 w-full bg-transparent text-sm outline-none"
                placeholder="Suchbegriff eingeben"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto pb-2">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Keine Keywords verfügbar</p>
            )}
            {filtered.map((opt, idx) => {
              const isSelected = selected.includes(opt.value);
              const isDisabled = disabled && !isSelected;
              const isHighlight = idx === highlight;
              return (
                <div
                  key={opt.value}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 text-sm transition",
                    isHighlight && "bg-muted",
                    isDisabled && "opacity-50 cursor-not-allowed"
                  )}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => !isDisabled && toggleValue(opt.value)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "h-4 w-4 rounded-sm border flex items-center justify-center",
                        isSelected ? "border-primary bg-primary/10" : "border-border"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-primary" />}
                    </div>
                    <span className="truncate" title={opt.label}>
                      {opt.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="opacity-0 rounded-sm bg-muted px-2 py-1 text-[11px] font-semibold text-foreground transition group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOnly(opt.value);
                      }}
                    >
                      Nur
                    </button>
                    <span className="w-16 text-right tabular-nums text-muted-foreground">
                      {opt.impressions.toLocaleString("de-DE")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground border-t border-border">
            <span>Ausgewählt: {countLabel}</span>
            {disabled && <span>Max erreicht ({max})</span>}
          </div>
      </PopoverContent>
    </Popover>
  );
}
