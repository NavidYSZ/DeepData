"use client";

import useSWR from "swr";
import { useEffect, useRef } from "react";
import { useSite } from "@/components/dashboard/site-context";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

interface SitesResponse {
  sites: { siteUrl: string; permissionLevel: string }[];
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
  const accountId =
    typeof document !== "undefined"
      ? document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("accountId="))
          ?.split("=")[1] ?? ""
      : "";
  const { data, error, isLoading } = useSWR<SitesResponse>(["/api/gsc/sites", accountId], ([url]) => fetcher(url));

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
    }))
    .sort((a, b) => domainKey(a.value).localeCompare(domainKey(b.value)));

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
        <Select
          value={site ?? ""}
          onValueChange={(val) => setSite(val || null)}
          onOpenChange={(open) => {
            if (!sidebar) return;
            if (open) {
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
          <SelectTrigger className={triggerClassName}>
            <SelectValue placeholder="Property wählen" />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
