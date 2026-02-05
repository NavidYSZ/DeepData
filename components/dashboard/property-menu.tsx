"use client";

import useSWR from "swr";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useSite } from "@/components/dashboard/site-context";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface SitesResponse {
  sites: { siteUrl: string; permissionLevel: string }[];
  error?: string;
  code?: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(json?.error || "fetch error");
    err.status = res.status;
    err.code = json?.code;
    throw err;
  }
  return json as SitesResponse;
};

export function PropertyMenu() {
  const { site, setSite } = useSite();
  const { data, error, isLoading } = useSWR<SitesResponse>("/api/gsc/sites", fetcher);

  useEffect(() => {
    if (!site && data?.sites?.length) {
      setSite(data.sites[0].siteUrl);
    }
  }, [data, setSite, site]);

  const options = (data?.sites || []).map((s) => ({ value: s.siteUrl, label: s.siteUrl }));

  const scopeError = (error as any)?.code === "insufficient_scope" || (error as any)?.status === 403;

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground">Property</p>
      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : error ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
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
          onChange={(e) => setSite(e.target.value || null)}
          options={options}
          className={cn("h-9 text-sm")}
        />
      )}
    </div>
  );
}
