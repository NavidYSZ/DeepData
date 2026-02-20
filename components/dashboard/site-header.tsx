"use client";

import Link from "next/link";

import { AccountMenu } from "@/components/dashboard/account-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader({ pageTitle }: { pageTitle: string }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SidebarTrigger className="md:hidden" />
          <Link href="/dashboard" className="truncate text-sm font-medium text-muted-foreground md:text-base md:text-foreground">
            {pageTitle}
          </Link>
        </div>
        <div className="ml-auto shrink-0">
          <AccountMenu compact />
        </div>
      </div>
    </header>
  );
}
