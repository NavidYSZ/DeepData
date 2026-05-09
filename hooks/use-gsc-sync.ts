"use client";

import { useEffect, useState } from "react";

export type SyncState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "fresh"; lastSyncedDate: string | null }
  | { status: "syncing"; lastSyncedDate: string | null; backgroundOnly: boolean }
  | { status: "synced"; daysSynced: number; rowsWritten: number }
  | { status: "error"; message: string };

// Smart auto-sync hook. Called by views that source from the persisted GSC
// table. Behaviour:
//  - On site change, hits /api/gsc/ensure-sync.
//  - If the server says data is fresh, resolves immediately.
//  - If a backfill is needed and no data exists yet, blocks (await: true) so
//    the view doesn't render an empty table.
//  - If data exists but is stale, kicks off a background sync (await: false)
//    and lets the view render whatever's already there.
export function useGscAutoSync(siteUrl: string | null | undefined): SyncState {
  const [state, setState] = useState<SyncState>({ status: "idle" });

  useEffect(() => {
    if (!siteUrl) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "checking" });

    async function run() {
      try {
        // First call: don't await. The endpoint tells us whether data
        // already exists and whether it's fresh. We use that to decide
        // whether the second call (if any) needs to block.
        const probe = await fetch("/api/gsc/ensure-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteUrl, await: false })
        });
        const probeJson = await probe.json();
        if (cancelled) return;

        if (probeJson.status === "fresh") {
          setState({ status: "fresh", lastSyncedDate: probeJson.lastSyncedDate });
          return;
        }

        // No prior sync — block until the initial backfill finishes so the
        // dashboard doesn't show an empty state forever.
        if (!probeJson.lastSyncedDate) {
          setState({
            status: "syncing",
            lastSyncedDate: null,
            backgroundOnly: false
          });
          const res = await fetch("/api/gsc/ensure-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ siteUrl, await: true })
          });
          const json = await res.json();
          if (cancelled) return;
          if (!res.ok || json.status === "error") {
            setState({ status: "error", message: json.error ?? "Sync failed" });
            return;
          }
          setState({
            status: "synced",
            daysSynced: json.daysSynced ?? 0,
            rowsWritten: json.rowsWritten ?? 0
          });
          return;
        }

        // Stale but data exists — let the view render now and finish the
        // top-up in the background. The user shouldn't see a loading spinner
        // for a 1-2 day catchup.
        setState({
          status: "syncing",
          lastSyncedDate: probeJson.lastSyncedDate,
          backgroundOnly: true
        });
      } catch (err: any) {
        if (cancelled) return;
        setState({ status: "error", message: err?.message ?? "Sync failed" });
      }
    }
    void run();

    return () => {
      cancelled = true;
    };
  }, [siteUrl]);

  return state;
}
