import Link from "next/link";
import { PageHeader } from "@/components/studio/page-header";
import { DeltaValue, ExperienceStatusBadge } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ruleSummaryFor } from "@/data/store";
import { allExperiences } from "@/data/source";
import { analyseDrift, formatSeconds } from "@/domain/timeline/planner";
import { relativeTime, titleCase } from "@/lib/format";
import type { ExperienceStatus } from "@/domain/types";

export const metadata = { title: "Experiences · Osora Studio" };

/** The pipeline, in the order work actually moves through it. */
const PIPELINE: ExperienceStatus[] = [
  "idea",
  "research",
  "draft",
  "composition",
  "script_generation",
  "audio_generation",
  "internal_review",
  "scientific_review",
  "safety_review",
  "audio_review",
  "changes_requested",
  "approved",
  "published",
  "archived",
];

export default async function ExperiencesPage() {
  const experiences = await allExperiences();
  const byStatus = PIPELINE.map((status) => ({
    status,
    count: experiences.filter((e) => e.status === status).length,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Experiences"
        title="Sessions"
        description="Every session carries its plan, its timeline, its rule results and its review requirements together. A session is not a document — it is a decision with an audio file attached."
        actions={
          <Button asChild variant="clay">
            <Link href="/composer/new">New session</Link>
          </Button>
        }
      />

      {/* Pipeline */}
      <div className="scroll-quiet mb-8 flex gap-1.5 overflow-x-auto pb-2">
        {byStatus.map(({ status, count }) => (
          <div
            key={status}
            className={`flex min-w-[112px] shrink-0 flex-col rounded-md border px-2.5 py-2 ${
              count > 0 ? "border-line bg-surface" : "border-dashed border-line bg-transparent"
            }`}
          >
            <span className="text-[11px] leading-4 text-ink-muted">{titleCase(status)}</span>
            <span
              className={`font-mono text-lg tabular-nums ${count > 0 ? "text-ink" : "text-ink-faint"}`}
            >
              {count}
            </span>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Drift</TableHead>
                <TableHead className="text-right">Familiar</TableHead>
                <TableHead className="text-right">DNA</TableHead>
                <TableHead className="text-right">Rules</TableHead>
                <TableHead>Constraints</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {experiences.map((experience) => {
                const summary = ruleSummaryFor(experience);
                const drift = experience.timeline ? analyseDrift(experience.timeline) : null;
                const hardCount = experience.constraints.filter((c) => c.type === "hard").length;

                return (
                  <TableRow key={experience.id}>
                    <TableCell>
                      <Link
                        href={`/composer/${experience.id}`}
                        className="font-medium text-ink hover:text-clay"
                      >
                        {experience.title}
                      </Link>
                      <p className="truncate font-mono text-[11px] text-ink-faint">
                        {experience.internalTitle}
                      </p>
                    </TableCell>
                    <TableCell>
                      <ExperienceStatusBadge status={experience.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-ink-soft">
                      {formatSeconds(experience.durationSeconds)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DeltaValue seconds={drift?.deltaSeconds ?? null} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-ink-soft">
                      {experience.plan ? `${Math.round(experience.plan.familiarityRatio * 100)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-ink-soft">
                      {experience.dnaScore?.total.toFixed(2) ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {summary.blocking > 0 ? (
                        <Badge tone="rust">{summary.blocking} blocking</Badge>
                      ) : summary.warnings > 0 ? (
                        <Badge tone="amber">{summary.warnings} warning</Badge>
                      ) : (
                        <Badge tone="sage">Clear</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {hardCount > 0 ? (
                        <Badge tone="rust">{hardCount} hard</Badge>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-ink-muted">
                      <span className="whitespace-nowrap">{relativeTime(experience.updatedAt)}</span>
                      <p className="text-[11px] text-ink-faint">
                        {experience.updatedBy.split(" ")[0]}
                      </p>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
