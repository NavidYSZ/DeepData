"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  className
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center",
        className
      )}
    >
      <div className="text-sm font-semibold">{title}</div>
      {description ? <div className="mt-1 text-xs text-muted-foreground">{description}</div> : null}
    </div>
  );
}

export function LoadingState({ className, label = "Laden..." }: { className?: string; label?: string }) {
  return (
    <div className={cn("rounded-lg border border-border p-6 text-sm text-muted-foreground", className)}>
      {label}
    </div>
  );
}

export function ErrorState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive",
        className
      )}
    >
      {children}
    </div>
  );
}
