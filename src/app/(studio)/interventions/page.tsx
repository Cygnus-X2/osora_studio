import { EyeOff, Lock } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { EvidenceBadge, ReviewStatusBadge } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { INTERVENTIONS } from "@/domain/interventions/library";
import { MECHANISM_BY_KEY } from "@/domain/mechanisms/library";
import { SKILL_LABELS } from "@/data/seed/people";
import { formatSeconds } from "@/domain/timeline/planner";
import { titleCase } from "@/lib/format";

export const metadata = { title: "Interventions · Osora Studio" };

const OPERATOR = { gte: "≥", lte: "≤", gt: ">", lt: "<" } as const;

export default function InterventionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Intervention library"
        title="Interventions"
        description="Concrete, reusable blocks. Each one records where it came from so provenance is traceable — and none of that provenance ever reaches a listener."
        actions={<Button variant="outline">Add intervention</Button>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-muted/60 p-4">
          <EyeOff className="mt-0.5 size-4 shrink-0 text-stone" />
          <p className="text-[13px] leading-6 text-ink-soft">
            <span className="font-medium text-ink">Provenance is internal.</span> A block may come
            from Vipassana, ACT or Feldenkrais. The listener hears one consistent Osora language and
            is never told which school an instruction descends from.
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-muted/60 p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-clay" />
          <p className="text-[13px] leading-6 text-ink-soft">
            <span className="font-medium text-ink">Boundary tags are structural.</span> A tag here
            is what a hard user boundary matches against. Tagged blocks are removed from the
            candidate set before scoring, so they never reach a ranking or a prompt.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {INTERVENTIONS.map((intervention) => (
          <Card key={intervention.key}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-medium text-ink">{intervention.name}</h2>
                    <code className="rounded-xs bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-ink-faint">
                      {intervention.key}
                    </code>
                    {intervention.major && <Badge tone="clay">Major</Badge>}
                  </div>
                  <p className="mt-1.5 text-[13px] leading-6 text-ink-soft">
                    {intervention.description}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-ink-muted">
                    <span className="text-ink-faint">Target — </span>
                    {intervention.targetOutcome}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <EvidenceBadge level={intervention.evidenceLevel} />
                  <ReviewStatusBadge status={intervention.reviewStatus} />
                  <Badge tone="outline">v{intervention.version}</Badge>
                </div>
              </div>

              <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <p className="label-eyebrow mb-1.5">Script template</p>
                  <pre className="scroll-quiet overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-canvas-sunk p-3 font-serif text-[13px] leading-6 text-ink-soft">
                    {intervention.scriptTemplate}
                  </pre>
                  <p className="mt-2 text-[12px] leading-5 text-ink-muted">
                    <span className="text-ink-faint">Direction — </span>
                    {intervention.instructions}
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="label-eyebrow mb-1">Mechanisms</p>
                    <div className="flex flex-wrap gap-1">
                      {intervention.mechanisms.map((m) => (
                        <Badge key={m.mechanism} tone={m.weight >= 0.7 ? "clay" : "stone"}>
                          {MECHANISM_BY_KEY[m.mechanism]?.name ?? m.mechanism}
                          <span className="font-mono text-[10px] opacity-70">{m.weight}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div>
                      <p className="label-eyebrow">Duration</p>
                      <p className="font-mono text-[12px] text-ink-soft">
                        {formatSeconds(intervention.minDurationSeconds)}–
                        {formatSeconds(intervention.maxDurationSeconds)}
                      </p>
                      <p className="font-mono text-[11px] text-ink-faint">
                        pref {formatSeconds(intervention.preferredDurationSeconds)}
                      </p>
                    </div>
                    <div>
                      <p className="label-eyebrow">Pause pattern</p>
                      <p className="font-mono text-[12px] text-ink-soft">
                        {intervention.pausePattern.afterInstructionSeconds}s / max{" "}
                        {intervention.pausePattern.maxPauseSeconds}s
                      </p>
                      <p className="font-mono text-[11px] text-ink-faint">
                        {Math.round(intervention.pausePattern.pauseRatio * 100)}% quiet
                      </p>
                    </div>
                    <div>
                      <p className="label-eyebrow">Density</p>
                      <p className="text-[12px] capitalize text-ink-soft">
                        {intervention.guidanceDensity}
                      </p>
                    </div>
                    <div>
                      <p className="label-eyebrow">Silence</p>
                      <p className="text-[12px] text-ink-soft">
                        {intervention.silenceCompatible ? "Compatible" : "Not compatible"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="label-eyebrow mb-1">Familiarity group</p>
                    <Badge tone="sand">{titleCase(intervention.familiarityGroup)}</Badge>
                  </div>

                  <div>
                    <p className="label-eyebrow mb-1">Boundary tags</p>
                    {intervention.boundaryTags.length === 0 ? (
                      <span className="text-[12px] text-ink-faint">
                        None — never blocked by a boundary
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {intervention.boundaryTags.map((tag) => (
                          <Badge key={tag} tone="rust">
                            {tag.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="label-eyebrow mb-1">Internal provenance</p>
                    <div className="flex items-center gap-1.5">
                      <Badge tone="neutral">{titleCase(intervention.sourceTradition)}</Badge>
                      <span className="text-[11px] text-ink-faint">never shown to listeners</span>
                    </div>
                  </div>

                  <div>
                    <p className="label-eyebrow mb-1">Required review</p>
                    <div className="flex flex-wrap gap-1">
                      {intervention.requiredSkills.map((skill) => (
                        <Badge key={skill} tone="slate">
                          {SKILL_LABELS[skill]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-[12px]">
                {intervention.excludedStates.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-faint">Excluded at</span>
                    {intervention.excludedStates.map((condition, i) => (
                      <Badge key={i} tone="rust">
                        {condition.dimension.replace(/_/g, " ")} {OPERATOR[condition.operator]}{" "}
                        {condition.value}
                      </Badge>
                    ))}
                  </div>
                )}
                {intervention.voiceRequirements && (
                  <p className="text-ink-muted">
                    <span className="text-ink-faint">Voice — </span>
                    {intervention.voiceRequirements}
                  </p>
                )}
                {intervention.soundRequirements && (
                  <p className="text-ink-muted">
                    <span className="text-ink-faint">Sound — </span>
                    {intervention.soundRequirements}
                  </p>
                )}
              </div>

              {intervention.contraindications.length > 0 && (
                <div className="mt-3 space-y-2 rounded-md border border-rust/20 bg-rust-soft/40 p-3">
                  <p className="label-eyebrow text-rust">Contraindications</p>
                  {intervention.contraindications.map((contraindication) => (
                    <div key={contraindication.id} className="text-[12px] leading-5">
                      <p className="font-medium text-ink-soft">
                        {contraindication.summary}
                        {contraindication.condition && (
                          <code className="ml-2 rounded-xs bg-surface px-1.5 py-0.5 font-mono text-[11px] text-rust">
                            {contraindication.condition.dimension}{" "}
                            {OPERATOR[contraindication.condition.operator]}{" "}
                            {contraindication.condition.value}
                          </code>
                        )}
                      </p>
                      <p className="text-ink-muted">{contraindication.guidance}</p>
                      {contraindication.requiresSkill && (
                        <p className="mt-0.5 text-ink-faint">
                          Requires {SKILL_LABELS[contraindication.requiresSkill]} review
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
