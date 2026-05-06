"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutDashboard, Search } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/crawl", label: "Dashboard", icon: LayoutDashboard },
  { href: "/crawl/crawler", label: "Crawler", icon: Search },
  { href: "/crawl/changes", label: "Changes", icon: History }
];

export function CrawlSectionNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/crawl" ? pathname === item.href : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-sky-200 bg-sky-500/10 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
                : "border-border bg-background/90 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
