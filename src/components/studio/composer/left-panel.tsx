"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EvidenceBadge } from "@/components/studio/indicators";
import { DIRECTION_BY_KEY, DIMENSION_BY_KEY } from "@/domain/state/dimensions";
import { MECHANISM_BY_KEY } from "@/domain/mechanisms/library";
import { INTERVENTION_BY_KEY } from "@/domain/interventions/library";
import { constraintLabel, sortConstraints } from "@/domain/constraints/catalog";
import { formatSeconds } from "@/domain/timeline/planner";
import { relativeTime, titleCase } from "@/lib/format";
import type {
  Comment,
  DimensionKey,
  Experience,
  ExperienceVersion,
  ProfessionalProfile,
  Review,
  ScientificSource,
} from "@/domain/types";

interface LeftPanelProps {
  experience: Experience;
  versions: ExperienceVersion[];
  comments: Comment[];
  reviews: Review[];
  contributors: ProfessionalProfile[];
  sources: ScientificSource[];
  skillLabels: Record<string, string>;
}

const DIMENSION_ORDER: DimensionKey[] = [
  "stress",
  "calmness",
  "energy",
  "tiredness",
  "mental_activity",
  "rumination",
  "focus",
  "emotional_intensity",
  "physical_tension",
  "discomfort",
  "safety",
  "connectedness",
  "openness",
  "motivation",
  "restlessness",
  "overwhelm",
];

function StateRow({ dimension, value }: { dimension: DimensionKey; value: number }) {
  const definition = DIMENSION_BY_KEY[dimension];
  const pleasant = definition.higherIsPleasant ? value >= 6 : value <= 4;
  const unpleasant = definition.higherIsPleasant ? value <= 4 : value >= 7;

  return (
    <div className="flex items-center gap-2">
      <span className="w-[104px] shrink-0 truncate text-[12px] text-ink-soft" title={definition.name}>
        {definition.name}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas-sunk">
        <div
          className={`h-full rounded-full ${
            unpleasant ? "bg-rust" : pleasant ? "bg-sage" : "bg-stone"
          }`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-muted">
        {value}
      </span>
    </div>
  );
}

export function ComposerLeftPanel({
  experience,
  versions,
  comments,
  reviews,
  contributors,
  sources,
  skillLabels,
}: LeftPanelProps) {
  const [tab, setTab] = useState("state");
  const plan = experience.plan;
  const constraints = sortConstraints(experience.constraints);

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col">
      <div className="scroll-quiet overflow-x-auto border-b border-line px-3 py-2">
        <TabsList className="w-max">
          <TabsTrigger value="state">State</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </div>

      <div className="scroll-quiet flex-1 overflow-y-auto px-4 py-4">
        {/* ---------------- State ---------------- */}
        <TabsContent value="state" className="mt-0 space-y-5">
          <section>
            <p className="label-eyebrow mb-2">Current state</p>
            <div className="space-y-1.5">
              {DIMENSION_ORDER.filter((d) => experience.currentState[d] !== undefined).map((d) => (
                <StateRow key={d} dimension={d} value={experience.currentState[d] as number} />
              ))}
            </div>
          </section>

          <section>
            <p className="label-eyebrow mb-2">Desired direction</p>
            <div className="flex flex-wrap gap-1">
              {experience.desired.directions.map((direction) => (
                <Badge key={direction} tone="clay">
                  {DIRECTION_BY_KEY[direction].label}
                </Badge>
              ))}
            </div>
            <dl className="mt-3 space-y-1.5 text-[12px]">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-faint">Intent</dt>
                <dd className="text-ink-soft">{titleCase(experience.desired.intent)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-faint">Environment</dt>
                <dd className="text-ink-soft">{titleCase(experience.desired.environment)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-faint">Available</dt>
                <dd className="font-mono text-ink-soft">
                  {formatSeconds(experience.desired.availableSeconds)}
                </dd>
              </div>
            </dl>
            {experience.desired.context && (
              <p className="mt-2 rounded-md bg-surface-muted px-2.5 py-2 font-serif text-[13px] italic leading-5 text-ink-muted">
                “{experience.desired.context}”
              </p>
            )}
          </section>

          <section>
            <p className="label-eyebrow mb-2">Constraints</p>
            <div className="space-y-2">
              {constraints.map((constraint) => (
                <div
                  key={constraint.id}
                  className={`rounded-md border px-2.5 py-2 ${
                    constraint.type === "hard"
                      ? "border-rust/25 bg-rust-soft/40"
                      : "border-line bg-surface-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-medium text-ink-soft">
                      {constraintLabel(constraint)}
                    </p>
                    <Badge tone={constraint.type === "hard" ? "rust" : "stone"}>
                      {constraint.type}
                    </Badge>
                  </div>
                  {constraint.reason && (
                    <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">
                      {constraint.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-ink-faint">
              Hard boundaries are applied at gating, before any scoring. Nothing downstream can
              reintroduce what they remove.
            </p>
          </section>
        </TabsContent>

        {/* ---------------- Plan ---------------- */}
        <TabsContent value="plan" className="mt-0 space-y-5">
          <section>
            <p className="label-eyebrow mb-2">Mechanism mix</p>
            <div className="space-y-2">
              {plan?.mechanisms.map((recommendation) => (
                <div key={recommendation.mechanism}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-ink-soft">
                      {MECHANISM_BY_KEY[recommendation.mechanism]?.name}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                      {Math.round(recommendation.share * 100)}% ·{" "}
                      {formatSeconds(recommendation.seconds)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-canvas-sunk">
                    <div
                      className="h-full rounded-full bg-clay"
                      style={{ width: `${recommendation.share * 100}%` }}
                    />
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] leading-4 text-ink-faint">
                    {recommendation.rationale}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="label-eyebrow mb-2">
              Ranked interventions
              <span className="ml-1.5 normal-case tracking-normal text-ink-faint">
                deterministic
              </span>
            </p>
            <div className="space-y-1">
              {plan?.rankedInterventions.slice(0, 14).map((ranked) => (
                <div
                  key={ranked.interventionKey}
                  className={`rounded-md px-2 py-1.5 ${
                    ranked.eligible ? "bg-surface-muted" : "bg-rust-soft/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-[12px] ${
                        ranked.eligible ? "text-ink-soft" : "text-ink-faint line-through"
                      }`}
                    >
                      {ranked.name}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {ranked.eligible && ranked.familiar && <Badge tone="sand">familiar</Badge>}
                      <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                        {ranked.eligible ? ranked.score.toFixed(2) : "—"}
                      </span>
                    </div>
                  </div>
                  {ranked.exclusionReason && (
                    <p className="mt-0.5 text-[10px] leading-4 text-rust">
                      {ranked.exclusionReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        {/* ---------------- Sections ---------------- */}
        <TabsContent value="sections" className="mt-0">
          <p className="label-eyebrow mb-2">Session sections</p>
          <ol className="space-y-1">
            {experience.timeline?.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-muted"
                >
                  <span className="w-5 shrink-0 font-mono text-[11px] text-ink-faint">
                    {section.order}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
                    {section.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
                    {formatSeconds(section.startSeconds)}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </TabsContent>

        {/* ---------------- Evidence ---------------- */}
        <TabsContent value="evidence" className="mt-0 space-y-3">
          <p className="label-eyebrow">Sources behind this session</p>
          {sources.length === 0 ? (
            <p className="text-[12px] text-ink-muted">No sources linked yet.</p>
          ) : (
            sources.map((source) => (
              <div key={source.id} className="rounded-md border border-line bg-surface-muted p-2.5">
                <p className="text-[12px] font-medium leading-5 text-ink-soft">{source.title}</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {source.authors[0]} · {source.year}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <EvidenceBadge level={source.evidenceQuality} />
                  {source.verificationStatus !== "verified" && (
                    <Badge tone="amber">{titleCase(source.verificationStatus)}</Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* ---------------- People ---------------- */}
        <TabsContent value="people" className="mt-0 space-y-5">
          <section>
            <p className="label-eyebrow mb-2">Contributors</p>
            <div className="space-y-2">
              {contributors.map((professional) => (
                <div key={professional.id} className="flex items-center gap-2.5">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sand-soft text-[10px] font-medium text-[#8a6f42]">
                    {professional.avatarInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] text-ink-soft">{professional.name}</p>
                    <p className="truncate text-[11px] text-ink-faint">{professional.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="label-eyebrow mb-2">Required review skills</p>
            <div className="flex flex-wrap gap-1">
              {experience.requiredReviewSkills.map((skill) => (
                <Badge key={skill} tone="slate">
                  {skillLabels[skill] ?? skill}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-ink-faint">
              Derived automatically from the mechanisms, interventions and contraindications in the
              plan.
            </p>
          </section>

          <section>
            <p className="label-eyebrow mb-2">Review history</p>
            <div className="space-y-2">
              {reviews.length === 0 ? (
                <p className="text-[12px] text-ink-muted">No reviews recorded yet.</p>
              ) : (
                reviews.map((review) => (
                  <div key={review.id} className="rounded-md border border-line bg-surface-muted p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-medium text-ink-soft">{review.reviewerName}</p>
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
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {skillLabels[review.skillUsed] ?? review.skillUsed} ·{" "}
                      {relativeTime(review.createdAt)}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-ink-muted">{review.comment}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>

        {/* ---------------- History ---------------- */}
        <TabsContent value="history" className="mt-0 space-y-5">
          <section>
            <p className="label-eyebrow mb-2">Versions</p>
            <div className="space-y-2">
              {versions.length === 0 ? (
                <p className="text-[12px] text-ink-muted">Version 1 — nothing superseded yet.</p>
              ) : (
                versions.map((version) => (
                  <div key={version.id} className="border-l-2 border-line pl-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px] text-clay">v{version.version}</span>
                      <p className="text-[12px] font-medium text-ink-soft">{version.label}</p>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">{version.summary}</p>
                    <p className="text-[11px] text-ink-faint">
                      {version.authorName} · {relativeTime(version.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <p className="label-eyebrow mb-2">Comments</p>
            <div className="space-y-2">
              {comments.length === 0 ? (
                <p className="text-[12px] text-ink-muted">No comments.</p>
              ) : (
                comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={`rounded-md border p-2.5 ${
                      comment.resolved
                        ? "border-line bg-surface-muted opacity-60"
                        : "border-line bg-surface"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-medium text-ink-soft">{comment.authorName}</p>
                      {comment.resolved && <Badge tone="sage">Resolved</Badge>}
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-ink-muted">{comment.body}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {relativeTime(comment.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>
      </div>

      <div className="border-t border-line px-4 py-2">
        <p className="text-[11px] text-ink-faint">
          {experience.plan?.sequence.filter((b) => b.interventionKey).length ?? 0} blocks ·{" "}
          {Object.keys(INTERVENTION_BY_KEY).length} interventions in library
        </p>
      </div>
    </Tabs>
  );
}
