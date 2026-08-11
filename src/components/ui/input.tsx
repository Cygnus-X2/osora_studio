import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-line-strong bg-surface px-3 py-1 text-sm text-ink shadow-quiet transition-colors",
        "placeholder:text-ink-faint",
        "focus-visible:border-clay/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink-soft",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
