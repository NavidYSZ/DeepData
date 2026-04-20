import Link from "next/link";
import { ReactNode } from "react";
import { ArrowLeft, Search } from "lucide-react";

import { CrawlSectionNav } from "@/components/crawl/crawl-section-nav";
import { Button } from "@/components/ui/button";

export default function CrawlLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.12),transparent_34%),linear-gradient(to_bottom,hsl(var(--background)),rgba(148,163,184,0.08))]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-30 mb-6 rounded-[1.75rem] border border-border/70 bg-background/85 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4" />
                  Zurück zum Dashboard
                </Link>
              </Button>

              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  <Search className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Crawl Workspace
                  </p>
                  <h1 className="truncate text-lg font-semibold tracking-tight">DeepData Crawl</h1>
                </div>
              </div>
            </div>

            <CrawlSectionNav />
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
