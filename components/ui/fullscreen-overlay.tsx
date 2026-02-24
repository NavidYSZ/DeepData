"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div
        className={cn(
          "relative w-[98vw] max-w-[1800px] max-h-[96vh] overflow-hidden rounded-xl border bg-card shadow-2xl",
          className
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold">{title}</div>
          <Button variant="ghost" size="icon" aria-label="Schließen" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-3 overflow-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}
