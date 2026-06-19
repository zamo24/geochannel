import type React from "react";
import { cn } from "../../lib/cn";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25",
        className
      )}
      {...props}
    />
  );
}
