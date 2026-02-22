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
  Settings,
  Network
} from "lucide-react";

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { PropertyMenu } from "@/components/dashboard/property-menu";

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
      { href: "/seo-bubble", label: "Position vs CTR", icon: Sparkles },
      { href: "/kannibalisierung", label: "Kannibalisierung", icon: GitMerge },
      { href: "/chat-agent", label: "Chat Agent", icon: MessageSquare }
    ]
  },
  {
    label: "Tools",
    items: [{ href: "/keyword-workspace", label: "Clustering", icon: Network }]
  }
];

const collapsibleTextClass =
  "inline-block overflow-hidden whitespace-nowrap transition-[width,opacity,transform] duration-200 ease-out group-data-[collapsed=true]:w-0 group-data-[collapsed=true]:-translate-x-1 group-data-[collapsed=true]:opacity-0";

export function AppSidebar({ pathname }: { pathname: string }) {
  return (
    <Sidebar>
      <SidebarHeader className="gap-3">
        <div className="flex w-full items-center gap-2">
          <SidebarTrigger className="h-8 w-8 shrink-0" />
          <span className={["text-sm font-semibold tracking-tight", collapsibleTextClass].join(" ")}>
            DeepData
          </span>
        </div>
        <PropertyMenu
          variant="inline"
          shape="gsc-pill"
          className="group-data-[collapsed=true]:hidden"
        />
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
                          <span className={collapsibleTextClass}>{item.label}</span>
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
                            <span className={collapsibleTextClass}>{item.label}</span>
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
                  <span className={collapsibleTextClass}>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
