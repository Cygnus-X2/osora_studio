"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value: number;
  tone?: "clay" | "sage" | "amber" | "rust" | "stone";
  size?: "sm" | "default";
  label?: string;
}

const toneClass: Record<NonNullable<ProgressProps["tone"]>, string> = {
  clay: "bg-clay",
  sage: "bg-sage",
  amber: "bg-amber",
  rust: "bg-rust",
  stone: "bg-stone",
};

export function Progress({
  value,
  tone = "clay",
  size = "default",
  label,
  className,
  ...props
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        "w-full overflow-hidden rounded-full bg-canvas-sunk",
        size === "sm" ? "h-1" : "h-1.5",
        className,
      )}
      {...props}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", toneClass[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
