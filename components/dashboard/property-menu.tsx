"use client";

import useSWR from "swr";
import { useEffect, useRef, useState } from "react";
import { useSite } from "@/components/dashboard/site-context";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Search } from "lucide-react";

interface SitesResponse {
  sites: { siteUrl: string; permissionLevel: string; accountId: string; accountEmail: string | null }[];
  error?: string;
  code?: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(json?.error || "fetch error");
    err.status = res.status;
    err.code = json?.code;
    throw err;
  }
  return json as SitesResponse;
};

export function PropertyMenu({
  className,
  variant = "stacked",
  shape = "default"
}: {
  className?: string;
  variant?: "stacked" | "inline";
  shape?: "default" | "gsc-pill";
} = {}) {
  const { site, setSite } = useSite();
  const sidebar = useSidebar();
  const forcedOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data, error, isLoading } = useSWR<SitesResponse>("/api/gsc/sites", fetcher);

  useEffect(() => {
    if (!data?.sites?.length) return;
    const currentSites = data.sites.map((s) => s.siteUrl);
    if (!site) {
      setSite(currentSites[0]);
      return;
    }
    if (!currentSites.includes(site)) {
      setSite(currentSites[0]);
    }
  }, [data, setSite, site]);

  const domainKey = (url: string) =>
    url.replace(/^(sc-domain:|https?:\/\/)/, "").toLowerCase();

  const options = (data?.sites || [])
    .map((s) => ({
      value: s.siteUrl,
      label: s.siteUrl.replace(/^sc-domain:/, ""),
      accountEmail: s.accountEmail,
    }))
    .sort((a, b) => domainKey(a.value).localeCompare(domainKey(b.value)));

  const normalizedSearch = search.toLowerCase();
  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(normalizedSearch) ||
      opt.accountEmail?.toLowerCase().includes(normalizedSearch)
  );

  const scopeError = (error as any)?.code === "insufficient_scope" || (error as any)?.status === 403;

  const triggerClassName = cn(
    variant === "inline" ? "h-9 w-full" : "",
    shape === "gsc-pill" ? "h-10 rounded-full border-input bg-background px-4 text-sm" : "",
    variant === "inline" && shape !== "gsc-pill" ? "md:max-w-[480px]" : ""
  );

  return (
    <div className={cn(variant === "inline" ? "space-y-0" : "space-y-1", className)}>
      {variant === "stacked" ? (
        <p className="text-xs font-semibold text-muted-foreground">Property</p>
      ) : (
        <p className="sr-only">Property</p>
      )}
      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : error ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-xs font-semibold text-destructive">Keine Properties</p>
          {scopeError && (
            <button
              type="button"
              className="text-xs text-primary underline"
              onClick={() => {
                window.location.href = "/api/auth/google";
              }}
            >
              Zugriff erneut erlauben
            </button>
          )}
        </div>
      ) : (
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setSearch("");
            if (!sidebar) return;
            if (o) {
              if (sidebar.pinMode === "hover") {
                sidebar.setPinMode("open");
                forcedOpenRef.current = true;
              }
            } else if (forcedOpenRef.current) {
              sidebar.setPinMode("hover");
              forcedOpenRef.current = false;
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(triggerClassName, "justify-between font-normal")}
            >
              <span className="truncate">
                {site
                  ? options.find((o) => o.value === site)?.label ?? site
                  : "Property wählen"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="p-0"
            style={{ width: "var(--radix-popover-trigger-width)" }}
            align="start"
            sideOffset={4}
          >
            <div className="flex items-center border-b px-3 py-2 gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Domain suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {filteredOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                      site === opt.value && "bg-accent/50"
                    )}
                    onClick={() => {
                      setSite(opt.value);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        site === opt.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate">{opt.label}</span>
                      {opt.accountEmail ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {opt.accountEmail}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              {filteredOptions.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  Keine Ergebnisse
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
