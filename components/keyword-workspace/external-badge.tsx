import { cn } from "@/lib/utils";

export function ExternalBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-4 h-4 rounded-[3px] border border-amber-400/60 bg-amber-50 text-[9px] font-bold text-amber-700 leading-none shrink-0 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-600/40",
        className
      )}
      title="Externes Keyword (Upload)"
    >
      E
    </span>
  );
}
