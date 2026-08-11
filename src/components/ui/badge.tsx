import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line-strong bg-surface-muted text-ink-soft",
        stone: "border-stone/25 bg-stone-soft text-stone",
        sand: "border-sand/35 bg-sand-soft text-[#8a6f42]",
        clay: "border-clay/25 bg-clay-soft text-clay",
        sage: "border-sage/25 bg-sage-soft text-sage",
        amber: "border-amber/25 bg-amber-soft text-amber",
        rust: "border-rust/25 bg-rust-soft text-rust",
        slate: "border-slate/20 bg-slate-soft text-slate",
        outline: "border-line-strong bg-transparent text-ink-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
