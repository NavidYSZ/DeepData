"use client";

import Link from "next/link";

import { AccountMenu } from "@/components/dashboard/account-menu";
import { PropertyMenu } from "@/components/dashboard/property-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader({ pageTitle }: { pageTitle: string }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SidebarTrigger />
          <Link href="/dashboard" className="truncate text-base font-semibold tracking-tight">
            DeepData
          </Link>
          <span className="sr-only">{pageTitle}</span>
        </div>
        <div className="ml-auto shrink-0">
          <AccountMenu compact />
        </div>
      </div>
      <div className="mt-3">
        <PropertyMenu variant="inline" />
      </div>
    </header>
  );
}
