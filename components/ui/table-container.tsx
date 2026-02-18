import * as React from "react";

import { cn } from "@/lib/utils";

export const TableContainer = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("relative w-full overflow-x-auto", className)} {...props} />
  )
);

TableContainer.displayName = "TableContainer";
