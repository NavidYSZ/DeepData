"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  TrendingUp,
  Link2,
  Database,
  Sparkles,
  GitMerge,
  MessageSquare,
  RefreshCcw,
  Settings,
  Network
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { PropertyMenu } from "@/components/dashboard/property-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from "@/components/ui/sidebar";

const primaryItems = [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];

const navGroups = [
  {
    label: "Keywords",
    items: [
      { href: "/rank-tracker", label: "by Query", icon: TrendingUp },
      { href: "/url-tracker", label: "by Site", icon: Link2 },
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
  },
  {
    label: "Tools",
    items: [{ href: "/keyword-workspace", label: "Clustering", icon: Network }]
  }
];

export function AppSidebar({ pathname }: { pathname: string }) {
  return (
    <Sidebar>
      <SidebarHeader>
        <AccountMenu className="group-data-[collapsed=true]:hidden" />
        <PropertyMenu className="group-data-[collapsed=true]:hidden" />
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center group-data-[collapsed=true]:h-9 group-data-[collapsed=true]:w-9 group-data-[collapsed=true]:px-0"
          onClick={() => {
            window.location.href = "/api/auth/google";
          }}
        >
          <RefreshCcw className="h-4 w-4" />
          <span className="group-data-[collapsed=true]:hidden">Zugriff erneuern</span>
        </Button>
        <div className="flex justify-end">
          <SidebarRail className="hidden md:inline-flex" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav className="space-y-4">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {primaryItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}>
                        <Link href={item.href}>
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}>
                          <Link href={item.href}>
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
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
        <div className="space-y-2">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground group-data-[collapsed=true]:sr-only">
            Settings
          </p>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/settings"} tooltip="Settings">
                <Link href="/settings">
                  <Settings className="h-4 w-4 shrink-0" />
                  <span className="truncate">Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
