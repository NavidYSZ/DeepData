"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FullscreenOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  className?: string;
}

export function FullscreenOverlay({ children, onClose, title, className }: FullscreenOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur">
      <div
        className={cn(
          "relative w-[95vw] max-w-6xl max-h-[95vh] rounded-xl border border-border bg-card shadow-2xl",
          className
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="text-sm font-semibold">{title}</div>
          <button
            aria-label="Schließen"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3 overflow-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}
