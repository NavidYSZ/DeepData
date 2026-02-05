"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type SiteContextValue = {
  site: string | null;
  setSite: (s: string | null) => void;
};

const SiteContext = createContext<SiteContextValue | undefined>(undefined);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [site, setSiteState] = useState<string | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("gsc-site") : null;
    if (stored) setSiteState(stored);
  }, []);

  const setSite = (s: string | null) => {
    setSiteState(s);
    if (typeof window !== "undefined") {
      if (s) localStorage.setItem("gsc-site", s);
      else localStorage.removeItem("gsc-site");
    }
  };

  const value = useMemo(() => ({ site, setSite }), [site]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSite must be used within SiteProvider");
  return ctx;
}
