"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const COLLAPSED_WIDTH = 44;
const EXPANDED_WIDTH = 380;

type Props = {
  collapsedLabel: string;
  headerTitle: string;
  headerIcon?: ReactNode;
  body: ReactNode;
  onClose?: () => void;
  showCloseButton?: boolean;
};

export function EntitySidebar({
  collapsedLabel,
  headerTitle,
  headerIcon,
  body,
  onClose,
  showCloseButton
}: Props) {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = hoverExpanded || pinned;

  return (
    <aside
      onMouseEnter={() => setHoverExpanded(true)}
      onMouseLeave={() => setHoverExpanded(false)}
      className="absolute right-0 top-0 z-20 flex h-full flex-col border-l bg-card shadow-lg transition-[width] duration-200 ease-out"
      style={{ width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
      data-expanded={expanded}
    >
      {!expanded ? (
        <div className="flex h-full flex-col items-center gap-3 py-3 text-muted-foreground">
          <ChevronLeft className="h-4 w-4" aria-label="Sidebar einblenden" />
          <div className="mt-1 flex h-full flex-col items-center gap-3 text-[10px] uppercase tracking-widest">
            <span className="[writing-mode:vertical-rl] rotate-180 select-none">
              {collapsedLabel}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
              {headerIcon}
              <span className="truncate">{headerTitle}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setPinned((p) => !p)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={pinned ? "Sidebar lösen" : "Sidebar pinnen"}
                title={pinned ? "Sidebar lösen" : "Sidebar pinnen"}
              >
                <ChevronRight
                  className={cn("h-4 w-4 transition-transform", pinned && "rotate-180")}
                />
              </button>
              {showCloseButton && onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Auswahl aufheben"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-4 py-4">{body}</div>
          </ScrollArea>
        </>
      )}
    </aside>
  );
}
