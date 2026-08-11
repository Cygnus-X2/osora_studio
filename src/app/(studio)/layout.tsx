import { Sidebar } from "@/components/studio/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { store } from "@/data/store";
import { ROLE_LABELS } from "@/data/seed/people";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = store.currentUser();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh bg-canvas">
        <Sidebar
          userName={user.name}
          userInitials={user.initials}
          userRoles={user.roles.map((r) => ROLE_LABELS[r]).join(" · ")}
        />
        <div className="lg:pl-60">
          <main className="mx-auto max-w-[1400px] px-5 py-10 pt-16 sm:px-8 lg:pt-10">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
