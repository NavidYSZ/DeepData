"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { PropertyMenu } from "@/components/dashboard/property-menu";
import { SiteProvider } from "@/components/dashboard/site-context";
import { AuthButton } from "@/components/dashboard/auth-button";
import { Menu, RefreshCcw } from "lucide-react";

const navGroups = [
  {
    label: "Core",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/rank-tracker", label: "Rank Tracker" },
      { href: "/url-tracker", label: "URL-Tracker" },
      { href: "/data-explorer", label: "Data Explorer" }
    ]
  },
  {
    label: "Insights",
    items: [
      { href: "/seo-bubble", label: "SEO Bubble" },
      { href: "/kannibalisierung", label: "Kannibalisierung" },
      { href: "/chat-agent", label: "Chat Agent" }
    ]
  }
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SiteProvider>
      <div className="flex min-h-screen bg-muted/30">
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-72 -translate-x-full border-r border-border bg-background p-4 transition md:static md:translate-x-0",
            mobileOpen && "translate-x-0"
          )}
        >
          <div className="mb-6">
            <AccountMenu
              className="w-full"
              renderButton={({ current, open }) => (
                <button
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition hover:bg-muted",
                    open && "ring-2 ring-primary/40"
                  )}
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                    G
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5">GSC Dashboard</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {current?.email ?? "Account auswählen"}
                    </p>
                  </div>
                </button>
              )}
            />
          </div>

          <div className="mb-4">
            <PropertyMenu />
          </div>

          <div className="mb-6">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center"
              onClick={() => {
                window.location.href = "/api/auth/google";
              }}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Zugriff erneuern
            </Button>
          </div>

          <nav className="space-y-6">
            {navGroups.map((group) => (
              <div key={group.label} className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center rounded-md px-3 py-2 text-sm font-medium transition hover:bg-muted",
                        pathname === item.href ? "bg-muted text-foreground" : "text-muted-foreground"
                      )}
                      onClick={() => setMobileOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-8 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            Single-User Modus. OAuth-Token bleibt serverseitig.
          </div>
        </aside>

        <div className="flex-1">
          <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
            <div className="flex items-center justify-between px-4 py-3 md:px-6">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Menü öffnen"
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <div>
                  <p className="text-sm text-muted-foreground">Google Search Console</p>
                  <h1 className="text-xl font-semibold">
                    {{
                      "/rank-tracker": "Rank Tracker",
                      "/url-tracker": "URL-Tracker",
                      "/data-explorer": "Data Explorer",
                      "/kannibalisierung": "Kannibalisierung",
                      "/seo-bubble": "SEO Bubble",
                      "/chat-agent": "Chat Agent"
                    }[pathname] ?? "Dashboard"}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary">Multi User</Badge>
                <AuthButton />
              </div>
            </div>
          </header>
          <main className="px-4 pb-10 pt-6 md:px-6">{children}</main>
        </div>
      </div>
    </SiteProvider>
  );
}
