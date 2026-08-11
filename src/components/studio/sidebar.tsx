"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV_GROUPS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface SidebarProps {
  userName: string;
  userInitials: string;
  userRoles: string;
}

export function Sidebar({ userName, userInitials, userRoles }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="scroll-quiet flex-1 overflow-y-auto px-3 py-2" aria-label="Studio sections">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-5">
          <p className="label-eyebrow px-2 pb-1.5">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    title={item.description}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-surface text-ink shadow-quiet"
                        : "text-ink-muted hover:bg-surface-muted hover:text-ink-soft",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        active ? "text-clay" : "text-ink-faint group-hover:text-ink-muted",
                      )}
                      strokeWidth={1.75}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="flex size-7 items-center justify-center rounded-md bg-ink text-[11px] font-medium tracking-wide text-canvas">
        os
      </div>
      <div className="leading-tight">
        <p className="text-[13px] font-medium text-ink">Osora Studio</p>
        <p className="text-[11px] text-ink-faint">Research &amp; production</p>
      </div>
    </div>
  );

  const footer = (
    <div className="border-t border-line px-4 py-3">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-full bg-stone-soft text-[11px] font-medium text-stone">
          {userInitials}
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] text-ink">{userName}</p>
          <p className="truncate text-[11px] text-ink-faint">{userRoles}</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="fixed left-3 top-3 z-40 flex size-9 items-center justify-center rounded-md border border-line bg-surface text-ink-soft shadow-quiet lg:hidden"
      >
        <Menu className="size-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-line bg-canvas-sunk transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between lg:block">
          {brand}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="mr-4 flex size-8 items-center justify-center rounded-md text-ink-faint hover:text-ink lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
