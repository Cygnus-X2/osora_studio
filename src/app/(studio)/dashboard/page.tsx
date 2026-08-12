import Link from "next/link";
import {
  AlertTriangle,
  BookMarked,
  CheckSquare,
  FlaskConical,
  Layers,
  Mic2,
  Plus,
  Sparkles,
  Waves,
} from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import {
  AssetStatusBadge,
  DeltaValue,
  ExperienceStatusBadge,
  Stat,
} from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { dashboardData } from "@/data/store";
import { formatSeconds } from "@/domain/timeline/planner";
import { relativeTime } from "@/lib/format";

const QUICK_ACTIONS = [
  { label: "Create session", href: "/composer/new", icon: Sparkles },
  { label: "Add mechanism", href: "/mechanisms", icon: Layers },
  { label: "Add intervention", href: "/interventions", icon: Plus },
  { label: "Add scientific source", href: "/evidence", icon: BookMarked },
  { label: "Create experiment", href: "/experiments", icon: FlaskConical },
  { label: "Generate voice", href: "/voices", icon: Mic2 },
  { label: "Generate sound", href: "/sounds", icon: Waves },
  { label: "Review session", href: "/reviews", icon: CheckSquare },
];

export default async function DashboardPage() {
  const data = await dashboardData();
  const blockingCount = data.failedValidations.reduce(
    (sum, entry) => sum + entry.failures.filter((f) => f.severity === "blocking").length,
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="Wednesday, 6 August 2026"
        title="Studio"
        description="Seven sessions in flight, four blocking reviews outstanding, and one audio asset that failed measurement. Nothing publishes until those clear."
        actions={
          <Button asChild variant="clay">
            <Link href="/composer/new">
              <Sparkles /> New session
            </Link>
          </Button>
        }
      />

      {/* Quick actions */}
      <div className="mb-8 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Button key={action.label} asChild variant="outline" size="sm">
              <Link href={action.href}>
                <Icon /> {action.label}
              </Link>
            </Button>
          );
        })}
      </div>

      {/* Headline numbers */}
      <div className="mb-8 grid gap-x-6 gap-y-5 rounded-lg border border-line bg-surface p-5 shadow-quiet sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Awaiting review"
          value={String(data.awaitingReview.length)}
          hint="Sessions in a review state"
          tone={data.awaitingReview.length > 2 ? "warning" : "default"}
        />
        <Stat
          label="Blocking failures"
          value={String(blockingCount)}
          hint="Across all sessions"
          tone={blockingCount > 0 ? "danger" : "good"}
        />
        <Stat
          label="Unmeasured audio"
          value={String(data.unmeasuredAssets.length)}
          hint="Not eligible to be marked ready"
          tone={data.unmeasuredAssets.length > 0 ? "warning" : "good"}
        />
        <Stat
          label="Active experiments"
          value={String(data.activeExperiments.length)}
          hint="Currently assigning"
        />
        <Stat
          label="Mean state delta"
          value={`${data.outcomes.summary.meanDelta >= 0 ? "+" : ""}${data.outcomes.summary.meanDelta.toFixed(2)}`}
          hint={`Across ${data.outcomes.summary.sessions} recorded sessions`}
          tone={data.outcomes.summary.meanDelta > 0 ? "good" : "warning"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recently edited */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recently edited</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.recentlyEdited.map((experience) => (
              <Link
                key={experience.id}
                href={`/composer/${experience.id}`}
                className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-2 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{experience.title}</p>
                  <p className="truncate text-[12px] text-ink-muted">{experience.internalTitle}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[12px] text-ink-faint">
                    {experience.updatedBy.split(" ")[0]} · {relativeTime(experience.updatedAt)}
                  </span>
                  <ExperienceStatusBadge status={experience.status} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Awaiting review */}
        <Card>
          <CardHeader>
            <CardTitle>Awaiting review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.awaitingReview.map((experience) => (
              <div key={experience.id}>
                <Link
                  href={`/composer/${experience.id}`}
                  className="text-[13px] font-medium text-ink hover:text-clay"
                >
                  {experience.title}
                </Link>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  {experience.requiredReviewSkills.length} required skill
                  {experience.requiredReviewSkills.length === 1 ? "" : "s"}
                </p>
              </div>
            ))}
            <Button asChild variant="subtle" size="sm" className="w-full">
              <Link href="/reviews">Open review queue</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Failed validations */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber" />
              Failed rule validations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.failedValidations.map(({ experience, failures }) => (
              <div key={experience.id} className="rounded-md border border-line bg-surface-muted/60 p-3">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <Link
                    href={`/composer/${experience.id}`}
                    className="text-[13px] font-medium text-ink hover:text-clay"
                  >
                    {experience.title}
                  </Link>
                  <div className="flex gap-1.5">
                    {failures.filter((f) => f.severity === "blocking").length > 0 && (
                      <Badge tone="rust">
                        {failures.filter((f) => f.severity === "blocking").length} blocking
                      </Badge>
                    )}
                    {failures.filter((f) => f.severity === "warning").length > 0 && (
                      <Badge tone="amber">
                        {failures.filter((f) => f.severity === "warning").length} warning
                      </Badge>
                    )}
                  </div>
                </div>
                <ul className="space-y-1">
                  {failures.slice(0, 3).map((failure, index) => (
                    <li key={`${failure.ruleKey}-${index}`} className="text-[12px] leading-5 text-ink-muted">
                      <span className="text-ink-soft">{failure.ruleName}</span> — {failure.message}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Missing evidence */}
        <Card>
          <CardHeader>
            <CardTitle>Missing evidence</CardTitle>
          </CardHeader>
          <CardContent>
            {data.missingEvidence.length === 0 ? (
              <p className="text-[13px] text-ink-muted">
                Every mechanism in every planned session cites at least one source.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.missingEvidence.map((experience) => (
                  <li key={experience.id}>
                    <Link
                      href={`/composer/${experience.id}`}
                      className="text-[13px] text-ink hover:text-clay"
                    >
                      {experience.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Duration mismatches */}
        <Card>
          <CardHeader>
            <CardTitle>Duration mismatches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.durationMismatches.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Every project is inside its ±30s window.</p>
            ) : (
              data.durationMismatches.map(({ project, delta }) => (
                <div key={project.id} className="flex items-center justify-between gap-3">
                  <Link
                    href={`/audio-lab/${project.id}`}
                    className="min-w-0 flex-1 truncate text-[13px] text-ink hover:text-clay"
                  >
                    {project.name}
                  </Link>
                  <span className="font-mono text-[12px] text-ink-muted">
                    {formatSeconds(project.arrangedSeconds)} / {formatSeconds(project.targetSeconds)}
                  </span>
                  <DeltaValue seconds={delta} />
                </div>
              ))
            )}
            <p className="pt-1 text-[11px] leading-4 text-ink-faint">
              Arranged length against target. Measured, never estimated.
            </p>
          </CardContent>
        </Card>

        {/* Active experiments */}
        <Card>
          <CardHeader>
            <CardTitle>Active experiments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.activeExperiments.map((experiment) => {
              const control = experiment.variants.find((v) => v.isControl);
              const variant = experiment.variants.find((v) => !v.isControl);
              const progress =
                ((control?.completions ?? 0) + (variant?.completions ?? 0)) /
                (experiment.minimumSample * 2);
              return (
                <div key={experiment.id}>
                  <Link
                    href={`/experiments/${experiment.id}`}
                    className="text-[13px] font-medium text-ink hover:text-clay"
                  >
                    {experiment.name}
                  </Link>
                  <p className="mb-1.5 mt-0.5 text-[12px] text-ink-muted">
                    {control?.completions ?? 0} / {variant?.completions ?? 0} completed · target{" "}
                    {experiment.minimumSample} per arm
                  </p>
                  <Progress
                    value={Math.min(100, progress * 100)}
                    tone="stone"
                    size="sm"
                    label={`${experiment.name} progress`}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Outcome trend */}
        <Card>
          <CardHeader>
            <CardTitle>Recent outcome trends</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.outcomes.dimensions.slice(0, 6).map((row) => (
              <div key={row.dimension} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-[12px] capitalize text-ink-soft">
                  {row.dimension.replace(/_/g, " ")}
                </span>
                <div className="flex h-1.5 flex-1 items-center">
                  <div className="relative h-1.5 w-full rounded-full bg-canvas-sunk">
                    <div
                      className={`absolute top-0 h-1.5 rounded-full ${
                        row.meanDelta >= 0 ? "bg-sage" : "bg-rust"
                      }`}
                      style={{
                        left: row.meanDelta >= 0 ? "50%" : `${50 - Math.min(50, Math.abs(row.meanDelta) * 16)}%`,
                        width: `${Math.min(50, Math.abs(row.meanDelta) * 16)}%`,
                      }}
                    />
                    <div className="absolute left-1/2 top-[-2px] h-2.5 w-px bg-line-strong" />
                  </div>
                </div>
                <span className="w-12 shrink-0 text-right font-mono text-[12px] tabular-nums text-ink-muted">
                  {row.meanDelta >= 0 ? "+" : ""}
                  {row.meanDelta.toFixed(2)}
                </span>
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-4 text-ink-faint">
              Mean self-reported change, oriented so positive is movement toward the pleasant end.
              Product-learning data, not medical evidence.
            </p>
          </CardContent>
        </Card>

        {/* Recent assets */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recently generated voices and sounds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.recentAssets.map((asset) => (
              <div
                key={asset.id}
                className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[12px] text-ink">{asset.name}</p>
                  <p className="text-[12px] text-ink-muted">
                    {asset.origin} · {relativeTime(asset.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-[12px] text-ink-muted">
                    {asset.actualDurationSeconds !== null
                      ? formatSeconds(asset.actualDurationSeconds)
                      : "unmeasured"}
                  </span>
                  <DeltaValue seconds={asset.durationDeltaSeconds} tolerance={5} />
                  <AssetStatusBadge status={asset.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Audit */}
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.auditLog.map((entry) => (
              <div key={entry.id} className="border-l-2 border-line pl-3">
                <p className="text-[12px] leading-5 text-ink-soft">{entry.summary}</p>
                <p className="text-[11px] text-ink-faint">
                  {entry.actorName} · {relativeTime(entry.createdAt)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <SectionHeading
        className="mt-10"
        title="What this studio is for"
        description="The audio file is the delivery format. The decision system behind it is the product."
      />
      <div className="rounded-lg border border-line bg-surface-muted/60 p-5 text-[13px] leading-6 text-ink-soft">
        <p>
          A listener never chooses a method. They describe their state, what they want to move
          toward, how long they have, and what they will not accept. The State Engine gates on
          safety and hard boundaries first, scores what remains, allocates seconds, and returns an
          explained plan. Only then does a model write words — inside budgets it cannot exceed, for
          sections it cannot add to.
        </p>
      </div>
    </>
  );
}
