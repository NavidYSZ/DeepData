import * as React from "react";

import { cn } from "@/lib/utils";

export const TableContainer = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("relative w-full max-w-full overflow-x-auto overscroll-x-contain", className)} {...props} />
  )
);

TableContainer.displayName = "TableContainer";
