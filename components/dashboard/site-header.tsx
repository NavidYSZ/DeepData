"use client";

import Link from "next/link";

import { AuthButton } from "@/components/dashboard/auth-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

export function SiteHeader({ pageTitle }: { pageTitle: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <SidebarTrigger />
      <Separator orientation="vertical" className="hidden h-4 md:block" />
      <Breadcrumb className="hidden min-w-0 flex-1 md:block">
        <BreadcrumbList className="min-w-0">
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbLink asChild>
              <Link href="/dashboard" className="truncate">
                Google Search Console
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="min-w-0 flex-1 truncate text-sm font-medium md:hidden">{pageTitle}</div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <Badge variant="secondary" className="hidden lg:inline-flex">
          Multi User
        </Badge>
        <ThemeToggle />
        <AuthButton />
      </div>
    </header>
  );
}
