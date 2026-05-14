"use client";

import * as React from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  TrendingUp,
  Link2,
  Database,
  Sparkles,
  GitMerge,
  ArrowUpDown,
  MessageSquare,
  Settings,
  Network,
  Search,
  Waypoints,
  Languages,
  Crown,
  Compass,
  ChevronRight,
  Globe,
  Tags,
  Map as MapIcon
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarCollapsible,
  SidebarCollapsibleTrigger,
  SidebarCollapsibleContent,
  useSidebar
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PropertyMenu } from "@/components/dashboard/property-menu";

const topicalAuthority = {
  label: "Topical Authority",
  icon: Compass,
  basePath: "/topical-authority",
  items: [
    { href: "/topical-authority/site-context", label: "Site Context", icon: Globe },
    { href: "/topical-authority/entities-queries", label: "Entities & Queries", icon: Tags },
    { href: "/topical-authority/topical-map", label: "Topical Map", icon: MapIcon }
  ]
};

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
      { href: "/top-mover", label: "Top Mover", icon: ArrowUpDown },
      { href: "/internal-links", label: "Internal Links", icon: Waypoints },
      { href: "/chat-agent", label: "Chat Agent", icon: MessageSquare }
    ]
  },
  {
    label: "Tools",
    items: [
      { href: "/keyword-workspace", label: "Clustering", icon: Network },
      { href: "/authority-workspace", label: "Authority Workspace", icon: Crown },
      { href: "/nlp", label: "NLP", icon: Languages }
    ]
  }
];

const collapsibleTextClass =
  "inline-block overflow-hidden whitespace-nowrap transition-[width,opacity,transform] duration-200 ease-out group-data-[collapsed=true]:w-0 group-data-[collapsed=true]:-translate-x-1 group-data-[collapsed=true]:opacity-0";

export function AppSidebar({ pathname }: { pathname: string }) {
  return (
    <Sidebar>
      <SidebarHeader className="gap-3">
        <div className="flex w-full items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            D
          </div>
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
                <TopicalAuthorityItem pathname={pathname} />
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
          <SidebarMenuButton asChild tooltip="Crawl">
            <Link href="/crawl">
              <Search className="h-4 w-4 shrink-0" />
              <span className={collapsibleTextClass}>Crawl</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
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

const sidebarMenuButtonBaseClass =
  "group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground";

function TopicalAuthorityItem({ pathname }: { pathname: string }) {
  const { collapsed } = useSidebar();
  const isActiveGroup = pathname.startsWith(topicalAuthority.basePath);
  const [open, setOpen] = React.useState(isActiveGroup);

  React.useEffect(() => {
    if (isActiveGroup) setOpen(true);
  }, [isActiveGroup]);

  const Icon = topicalAuthority.icon;

  const triggerButton = (
    <SidebarCollapsibleTrigger
      data-active={isActiveGroup ? "true" : undefined}
      className={[sidebarMenuButtonBaseClass, collapsed ? "justify-center gap-0" : ""].join(" ")}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={collapsibleTextClass}>{topicalAuthority.label}</span>
      <ChevronRight
        className={[
          "ml-auto h-4 w-4 shrink-0 transition-transform duration-200",
          open && !collapsed ? "rotate-90" : "",
          collapsibleTextClass
        ].join(" ")}
      />
    </SidebarCollapsibleTrigger>
  );

  return (
    <SidebarCollapsible open={open} onOpenChange={setOpen} asChild>
      <SidebarMenuItem>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
            <TooltipContent side="right">{topicalAuthority.label}</TooltipContent>
          </Tooltip>
        ) : (
          triggerButton
        )}
        <SidebarCollapsibleContent>
          <SidebarMenuSub>
            {topicalAuthority.items.map((item) => {
              const SubIcon = item.icon;
              return (
                <SidebarMenuSubItem key={item.href}>
                  <SidebarMenuSubButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <SubIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </SidebarCollapsibleContent>
      </SidebarMenuItem>
    </SidebarCollapsible>
  );
}
