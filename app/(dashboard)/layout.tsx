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
  "/seo-bubble": "Position vs CTR",
  "/chat-agent": "Chat Agent",
  "/keyword-workspace": "Clustering",
  "/settings": "Settings",
  "/dashboard": "Dashboard"
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isKeywordWorkspace = pathname.startsWith("/keyword-workspace");
  const pageTitle =
    isKeywordWorkspace ? "Keyword Mapping" : pageTitles[pathname] ?? "Dashboard";

  return (
    <SiteProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar pathname={pathname} />

          <SidebarInset className={cn(isKeywordWorkspace && "overflow-hidden")}>
            {!isKeywordWorkspace ? <SiteHeader pageTitle={pageTitle} /> : null}
            <main
              className={cn(
                isKeywordWorkspace
                  ? "flex-1 min-h-0 w-full max-w-none overflow-hidden p-0"
                  : "container max-w-screen-2xl space-y-6 px-4 py-6 md:px-6"
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
