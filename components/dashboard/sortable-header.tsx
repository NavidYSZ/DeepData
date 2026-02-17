"use client";

import { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortDirection = "asc" | "desc" | null;

export function SortableHeader({
  label,
  active,
  direction,
  onClick,
  help
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  help?: ReactNode;
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
    <button
      className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      onClick={onClick}
      type="button"
    >
      {label}
      {help}
      {icon}
    </button>
  );
}
