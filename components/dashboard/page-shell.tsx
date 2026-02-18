"use client";

import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  actionsWrap = true
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  actionsWrap?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <h1 className="break-words text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className={cn("flex items-center gap-2", actionsWrap && "flex-wrap")}>{actions}</div> : null}
    </div>
  );
}

export function FilterBar({
  children,
  className,
  compact = false
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardContent className={cn("grid gap-4", compact ? "py-3" : "py-4", className)}>{children}</CardContent>
    </Card>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={className}>
      {title ? (
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("py-4", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function StatsRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">{children}</div>;
}
