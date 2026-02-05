"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { PropertyMenu } from "@/components/dashboard/property-menu";
import { SiteProvider } from "@/components/dashboard/site-context";
import { AuthButton } from "@/components/dashboard/auth-button";
import { RefreshCcw } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/data-explorer", label: "Data Explorer" },
  { href: "/rank-tracker", label: "Rank Tracker" },
  { href: "/seo-bubble", label: "SEO Bubble" },
  { href: "/kannibalisierung", label: "Kannibalisierung" }
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <SiteProvider>
      <div className="flex min-h-screen bg-background">
        <aside className="hidden w-64 border-r border-border bg-card/60 p-4 md:block">
          <div className="mb-6">
            <AccountMenu
              className="w-full"
              renderButton={({ current, open }) => (
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition hover:bg-muted",
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
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition hover:bg-muted",
                pathname === item.href ? "bg-muted text-foreground" : "text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          Single-User Modus. OAuth-Token bleibt serverseitig.
        </div>
      </aside>

      <div className="flex-1">
        <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3 md:px-6">
            <div>
              <p className="text-sm text-muted-foreground">Google Search Console</p>
              <h1 className="text-xl font-semibold">
                {{
                  "/rank-tracker": "Rank Tracker",
                  "/data-explorer": "Data Explorer",
                  "/kannibalisierung": "Kannibalisierung",
                  "/seo-bubble": "SEO Bubble"
                }[pathname] ?? "Dashboard"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">Multi User</Badge>
              <AuthButton />
            </div>
          </div>
        </header>
        <main className="px-4 pb-8 pt-6 md:px-6">{children}</main>
      </div>
      </div>
    </SiteProvider>
  );
}
