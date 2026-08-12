import Link from "next/link";
import { AlertTriangle, Bot, CircleCheck, Clock } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { ExperienceStatusBadge, SeverityBadge, Stat } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { reviewQueue, ruleResultsFor, store } from "@/data/store";
import { allExperiences } from "@/data/source";
import { SKILL_LABELS } from "@/data/seed/people";
import { relativeTime, titleCase } from "@/lib/format";

export const metadata = { title: "Reviews · Osora Studio" };

export default async function ReviewsPage() {
  const queue = await reviewQueue();
  const experiences = await allExperiences();
  const outstanding = queue.filter((row) => row.review?.decision !== "approved");
  const blocking = outstanding.filter((row) => row.requirement.blocking);
  const unstaffed = outstanding.filter((row) => row.qualified.length === 0);

  return (
    <>
      <PageHeader
        eyebrow="Review queue"
        title="Reviews"
        description="Review is matched to skill, not to seniority. A reviewer may approve only inside the skills they hold, and nothing publishes while a blocking requirement is outstanding."
      />

      <div className="mb-8 grid gap-x-6 gap-y-5 rounded-lg border border-line bg-surface p-5 shadow-quiet sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Requirements" value={String(queue.length)} />
        <Stat
          label="Outstanding"
          value={String(outstanding.length)}
          tone={outstanding.length > 0 ? "warning" : "good"}
        />
        <Stat
          label="Blocking"
          value={String(blocking.length)}
          tone={blocking.length > 0 ? "danger" : "good"}
          hint="prevent publication"
        />
        <Stat
          label="No qualified reviewer"
          value={String(unstaffed.length)}
          tone={unstaffed.length > 0 ? "danger" : "good"}
        />
      </div>

      <div className="mb-8 flex items-start gap-3 rounded-lg border border-line bg-surface-muted/60 p-4">
        <Bot className="mt-0.5 size-4 shrink-0 text-stone" />
        <p className="text-[13px] leading-6 text-ink-soft">
          <span className="font-medium text-ink">
            An AI professional perspective never satisfies a requirement here.
          </span>{" "}
          The composer can rewrite a section through a trauma-informed or pain-science lens, and that
          is a useful drafting tool. It is recorded as a generation run, not as a review, and this
          queue does not count it.
        </p>
      </div>

      <SectionHeading title="Queue" description="Blocking and unstaffed requirements first." />
      <div className="mb-10 space-y-3">
        {queue.map(({ requirement, experience, review, qualified }) => {
          if (!experience) return null;
          const approved = review?.decision === "approved";
          const rules = ruleResultsFor(experience);
          const failures = rules.filter((r) => !r.passed && r.severity === "blocking");

          return (
            <Card
              key={requirement.id}
              className={approved ? "opacity-70" : requirement.blocking ? "border-rust/25" : ""}
            >
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      {approved ? (
                        <CircleCheck className="size-4 shrink-0 text-sage" />
                      ) : requirement.blocking ? (
                        <AlertTriangle className="size-4 shrink-0 text-rust" />
                      ) : (
                        <Clock className="size-4 shrink-0 text-ink-faint" />
                      )}
                      <Link
                        href={`/composer/${experience.id}`}
                        className="text-[15px] font-medium text-ink hover:text-clay"
                      >
                        {experience.title}
                      </Link>
                      <ExperienceStatusBadge status={experience.status} />
                    </div>
                    <p className="mt-1.5 text-[13px] leading-6 text-ink-soft">
                      {requirement.reason}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Badge tone="slate">{titleCase(requirement.kind)}</Badge>
                      <Badge tone="clay">{SKILL_LABELS[requirement.requiredSkill]}</Badge>
                      {requirement.blocking && <Badge tone="rust">Blocking</Badge>}
                    </div>
                    {!approved && (
                      <Button variant="outline" size="sm" disabled={qualified.length === 0}>
                        {qualified.length === 0 ? "No qualified reviewer" : "Assign review"}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 border-t border-line pt-3 lg:grid-cols-3">
                  <div>
                    <p className="label-eyebrow mb-1">Qualified reviewers</p>
                    {qualified.length === 0 ? (
                      <p className="text-[12px] leading-5 text-rust">
                        Nobody active holds this skill. Publication is blocked until someone does.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {qualified.map((professional) => (
                          <Badge key={professional.id} tone="stone">
                            {professional.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-2">
                    {review ? (
                      <div className="rounded-md border border-line bg-surface-muted/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[13px] font-medium text-ink-soft">
                            {review.reviewerName}
                          </p>
                          <div className="flex items-center gap-2">
                            <Badge
                              tone={
                                review.decision === "approved"
                                  ? "sage"
                                  : review.decision === "changes_requested"
                                    ? "amber"
                                    : review.decision === "rejected"
                                      ? "rust"
                                      : "stone"
                              }
                            >
                              {titleCase(review.decision)}
                            </Badge>
                            <span className="text-[11px] text-ink-faint">
                              {relativeTime(review.createdAt)}
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[12px] leading-5 text-ink-muted">{review.comment}</p>
                      </div>
                    ) : (
                      <p className="text-[12px] text-ink-faint">Not started.</p>
                    )}
                  </div>
                </div>

                {failures.length > 0 && !approved && (
                  <div className="mt-3 space-y-1 rounded-md border border-rust/20 bg-rust-soft/40 p-3">
                    <p className="label-eyebrow text-rust">
                      Blocking rule failures on this session
                    </p>
                    {failures.map((failure, i) => (
                      <div key={`${failure.ruleKey}-${i}`} className="flex items-start gap-2">
                        <SeverityBadge severity={failure.severity} />
                        <p className="text-[12px] leading-5 text-ink-soft">
                          <span className="font-medium">{failure.ruleName}</span> — {failure.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SectionHeading
        title="Recent review activity"
        description="Every decision is attributed to a person and the skill they used to make it."
      />
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-line">
            {store
              .reviews()
              .slice()
              .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
              .map((review) => {
                const experience = experiences.find((e) => e.id === review.experienceId);
                return (
                  <div key={review.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-ink">
                          {review.reviewerName}
                        </span>
                        <span className="text-[13px] text-ink-muted">reviewed</span>
                        {experience && (
                          <Link
                            href={`/composer/${experience.id}`}
                            className="text-[13px] text-clay hover:underline"
                          >
                            {experience.title}
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone="stone">{SKILL_LABELS[review.skillUsed]}</Badge>
                        <Badge
                          tone={
                            review.decision === "approved"
                              ? "sage"
                              : review.decision === "changes_requested"
                                ? "amber"
                                : "slate"
                          }
                        >
                          {titleCase(review.decision)}
                        </Badge>
                        <span className="whitespace-nowrap text-[11px] text-ink-faint">
                          {relativeTime(review.createdAt)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-ink-muted">{review.comment}</p>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
