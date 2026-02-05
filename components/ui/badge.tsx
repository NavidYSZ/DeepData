import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "destructive" | "secondary";

const variants: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground",
  success: "bg-emerald-500 text-white",
  destructive: "bg-destructive text-destructive-foreground",
  secondary: "bg-secondary text-secondary-foreground"
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
