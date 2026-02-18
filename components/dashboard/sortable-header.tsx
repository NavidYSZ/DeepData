"use client";

import { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc" | null;

export function SortableHeader({
  label,
  active,
  direction,
  onClick,
  help,
  className
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  help?: ReactNode;
  className?: string;
}) {
  const icon = !active ? (
    <ArrowUpDown className="h-3 w-3" />
  ) : direction === "desc" ? (
    <ArrowDown className="h-3 w-3" />
  ) : direction === "asc" ? (
    <ArrowUp className="h-3 w-3" />
  ) : (
    <ArrowUpDown className="h-3 w-3" />
  );

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-auto px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground",
        className
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      {help}
      {icon}
    </Button>
  );
}
