"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SiteProvider } from "@/components/dashboard/site-context";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const pageTitles: Record<string, string> = {
  "/rank-tracker": "by Query",
  "/url-tracker": "by Site",
  "/data-explorer": "Data Explorer",
  "/kannibalisierung": "Kannibalisierung",
  "/top-mover": "Top Mover",
  "/internal-links": "Internal Links",
  "/seo-bubble": "Position vs CTR",
  "/chat-agent": "Chat Agent",
  "/keyword-workspace": "Clustering",
  "/authority-workspace": "Authority Workspace",
  "/nlp": "NLP Playground",
  "/settings": "Settings",
  "/dashboard": "Dashboard"
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFullscreenView =
    pathname.startsWith("/keyword-workspace") || pathname.startsWith("/authority-workspace");
  const pageTitle = pathname.startsWith("/keyword-workspace")
    ? "Keyword Mapping"
    : pathname.startsWith("/authority-workspace")
      ? "Authority Workspace"
      : pageTitles[pathname] ?? "Dashboard";

  return (
    <SiteProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full min-w-0">
          <AppSidebar pathname={pathname} />

          <SidebarInset className={cn("overflow-x-hidden", isFullscreenView && "overflow-hidden")}>
            {!isFullscreenView ? <SiteHeader pageTitle={pageTitle} /> : null}
            <main
              className={cn(
                isFullscreenView
                  ? "flex-1 min-h-0 w-full max-w-none overflow-hidden p-0"
                  : "container min-w-0 max-w-screen-2xl space-y-6 overflow-x-hidden px-4 py-5 sm:px-5 md:px-6 md:py-6"
              )}
            >
              {children}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </SiteProvider>
  );
}
