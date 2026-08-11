import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { ExperienceStatusBadge } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { store } from "@/data/store";
import { formatSeconds } from "@/domain/timeline/planner";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Session Composer · Osora Studio" };

export default function ComposerIndexPage() {
  const experiences = store.experiences();

  return (
    <>
      <PageHeader
        eyebrow="Session Composer"
        title="Choose a session to compose"
        description="The composer runs the State Engine, plans a deterministic timeline, and only then lets a model write text into budgets it cannot exceed."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {experiences.map((experience) => (
          <Link key={experience.id} href={`/composer/${experience.id}`} className="group">
            <Card className="h-full transition-shadow hover:shadow-lift">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-medium text-ink group-hover:text-clay">
                      {experience.title}
                    </h2>
                    <p className="mt-0.5 truncate font-mono text-[12px] text-ink-muted">
                      {experience.internalTitle}
                    </p>
                  </div>
                  <ExperienceStatusBadge status={experience.status} />
                </div>

                <p className="mt-3 text-[13px] leading-6 text-ink-soft">
                  {experience.targetOutcome}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-[12px]">
                  <span className="font-mono text-ink-soft">
                    {formatSeconds(experience.durationSeconds)}
                  </span>
                  <span className="text-ink-muted">
                    {experience.plan?.mechanisms.length ?? 0} mechanisms
                  </span>
                  <span className="text-ink-muted">
                    {experience.plan?.sequence.length ?? 0} blocks
                  </span>
                  {experience.constraints.some((c) => c.type === "hard") && (
                    <Badge tone="rust">
                      {experience.constraints.filter((c) => c.type === "hard").length} hard boundary
                    </Badge>
                  )}
                  <span className="ml-auto flex items-center gap-1 text-ink-faint">
                    {relativeTime(experience.updatedAt)}
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
