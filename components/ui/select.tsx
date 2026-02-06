"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Auswählen",
  disabled,
  ariaLabel,
  className,
  searchable = false,
  searchPlaceholder = "Suchen..."
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!open) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm transition",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
        )}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && !disabled && (
        <div
          ref={panelRef}
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 w-full rounded-md border border-border bg-card shadow-lg"
        >
          <div className="max-h-56 overflow-y-auto py-1">
            {searchable && (
              <div className="px-3 pb-2">
                <input
                  autoFocus
                  className="w-full rounded-md border border-border bg-card px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
            {filtered.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  role="option"
                  aria-selected={active}
                  className={cn(
                    "block w-full px-3 py-2 text-left text-sm transition",
                    active ? "bg-primary/10 text-foreground" : "hover:bg-muted text-foreground"
                  )}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
