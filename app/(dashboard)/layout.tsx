"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  Link2,
  Database,
  Sparkles,
  GitMerge,
  MessageSquare,
  RefreshCcw
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { PropertyMenu } from "@/components/dashboard/property-menu";
import { SiteProvider } from "@/components/dashboard/site-context";
import { AuthButton } from "@/components/dashboard/auth-button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";

const navGroups = [
  {
    label: "Core",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/rank-tracker", label: "Rank Tracker", icon: TrendingUp },
      { href: "/url-tracker", label: "URL-Tracker", icon: Link2 },
      { href: "/data-explorer", label: "Data Explorer", icon: Database }
    ]
  },
  {
    label: "Insights",
    items: [
      { href: "/seo-bubble", label: "SEO Bubble", icon: Sparkles },
      { href: "/kannibalisierung", label: "Kannibalisierung", icon: GitMerge },
      { href: "/chat-agent", label: "Chat Agent", icon: MessageSquare }
    ]
  }
];

const pageTitles: Record<string, string> = {
  "/rank-tracker": "Rank Tracker",
  "/url-tracker": "URL-Tracker",
  "/data-explorer": "Data Explorer",
  "/kannibalisierung": "Kannibalisierung",
  "/seo-bubble": "SEO Bubble",
  "/chat-agent": "Chat Agent",
  "/dashboard": "Dashboard"
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pageTitle = pageTitles[pathname] ?? "Dashboard";

  return (
    <SiteProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <Sidebar>
            <SidebarHeader>
              <AccountMenu />
              <PropertyMenu />
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center"
                onClick={() => {
                  window.location.href = "/api/auth/google";
                }}
              >
                <RefreshCcw className="h-4 w-4" />
                Zugriff erneuern
              </Button>
            </SidebarHeader>
            <SidebarContent>
              <nav className="space-y-4">
                {navGroups.map((group) => (
                  <SidebarGroup key={group.label}>
                    <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <SidebarMenuItem key={item.href}>
                              <SidebarMenuButton asChild isActive={pathname === item.href}>
                                <Link href={item.href}>
                                  <Icon className="h-4 w-4" />
                                  <span>{item.label}</span>
                                </Link>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          );
                        })}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                ))}
              </nav>
            </SidebarContent>
            <SidebarFooter>
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                Single-User Modus. OAuth-Token bleibt serverseitig.
              </div>
            </SidebarFooter>
          </Sidebar>

          <SidebarInset>
            <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/dashboard">Google Search Console</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="ml-auto flex items-center gap-2">
                <Badge variant="secondary" className="hidden md:inline-flex">
                  Multi User
                </Badge>
                <ThemeToggle />
                <AuthButton />
              </div>
            </header>
            <main className={cn("flex-1 space-y-6 px-4 pb-10 pt-6 md:px-6")}>{children}</main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </SiteProvider>
  );
}
