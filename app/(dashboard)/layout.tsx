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
  "/seo-bubble": "SEO Bubble",
  "/chat-agent": "Chat Agent",
  "/settings": "Settings",
  "/dashboard": "Dashboard"
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pageTitle = pageTitles[pathname] ?? "Dashboard";

  return (
    <SiteProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar pathname={pathname} />

          <SidebarInset>
            <SiteHeader pageTitle={pageTitle} />
            <main className={cn("container max-w-screen-2xl space-y-6 px-4 py-6 md:px-6")}>{children}</main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </SiteProvider>
  );
}
