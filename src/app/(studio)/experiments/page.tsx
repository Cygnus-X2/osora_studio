import Link from "next/link";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { store } from "@/data/store";
import { titleCase } from "@/lib/format";
import type { ExperimentStatus } from "@/domain/types";

export const metadata = { title: "Experiments · Osora Studio" };

const STATUS_TONE: Record<ExperimentStatus, "outline" | "stone" | "sage" | "amber" | "slate" | "rust"> =
  {
    design: "outline",
    review: "slate",
    running: "sage",
    paused: "amber",
    stopped: "rust",
    analysed: "stone",
  };

export default function ExperimentsPage() {
  const experiments = store.experiments();

  return (
    <>
      <PageHeader
        eyebrow="Experiment system"
        title="Experiments"
        description="Every session variation is a hypothesis with exactly one variable. Assignment is manual and the stop condition is written down before the first participant — there is no autonomous optimisation in this milestone, by design."
        actions={<Button variant="outline">New experiment</Button>}
      />

      <div className="mb-8 rounded-lg border border-line bg-surface-muted/60 px-4 py-3 text-[13px] leading-6 text-ink-soft">
        Changing four things at once produces a session that might be better and an experiment that
        cannot say why. The Osora DNA caps simultaneous change at two dimensions, and an experiment
        that moves a stable element — voice, grammar, opening — still needs a separate decision
        about whether a positive result is worth acting on.
      </div>

      <div className="space-y-4">
        {experiments.map((experiment) => {
          const control = experiment.variants.find((v) => v.isControl);
          const variants = experiment.variants.filter((v) => !v.isControl);
          const totalCompletions = experiment.variants.reduce((s, v) => s + v.completions, 0);
          const progress = totalCompletions / (experiment.minimumSample * experiment.variants.length);

          return (
            <Card key={experiment.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/experiments/${experiment.id}`}
                        className="text-[15px] font-medium text-ink hover:text-clay"
                      >
                        {experiment.name}
                      </Link>
                      <Badge tone={STATUS_TONE[experiment.status]}>
                        {titleCase(experiment.status)}
                      </Badge>
                      <Badge tone="clay">{titleCase(experiment.variable)}</Badge>
                    </div>
                    <p className="mt-1.5 font-serif text-[14px] italic leading-6 text-ink-soft">
                      {experiment.hypothesis}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="label-eyebrow">Owner</p>
                    <p className="text-[13px] text-ink-soft">{experiment.ownerName}</p>
                    <p className="text-[11px] text-ink-faint">
                      {titleCase(experiment.requiredReview)} review required
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <p className="label-eyebrow mb-2">Arms</p>
                    <div className="space-y-2.5">
                      {[control, ...variants].filter(Boolean).map((variant) => {
                        if (!variant) return null;
                        const lift =
                          control && variant.meanPrimaryDelta !== null && control.meanPrimaryDelta !== null
                            ? Number((variant.meanPrimaryDelta - control.meanPrimaryDelta).toFixed(2))
                            : null;

                        return (
                          <div key={variant.id}>
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="text-[13px] text-ink-soft">
                                {variant.label}
                                {variant.isControl && (
                                  <span className="ml-1.5 text-[11px] text-ink-faint">control</span>
                                )}
                              </span>
                              <span className="font-mono text-[12px] tabular-nums text-ink-muted">
                                n={variant.completions}/{variant.assignments} ·{" "}
                                {variant.meanPrimaryDelta !== null
                                  ? `Δ ${variant.meanPrimaryDelta.toFixed(2)}`
                                  : "no data"}
                                {lift !== null && !variant.isControl && (
                                  <span className={lift > 0 ? " text-sage" : " text-rust"}>
                                    {" "}
                                    ({lift > 0 ? "+" : ""}
                                    {lift})
                                  </span>
                                )}
                              </span>
                            </div>
                            <Progress
                              value={Math.min(
                                100,
                                (variant.completions / experiment.minimumSample) * 100,
                              )}
                              tone={variant.isControl ? "stone" : "clay"}
                              size="sm"
                              label={variant.label}
                            />
                            <p className="mt-0.5 text-[11px] leading-4 text-ink-faint">
                              {variant.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <p className="label-eyebrow">Primary outcome</p>
                      <p className="text-[13px] capitalize text-ink-soft">
                        {experiment.primaryOutcome.replace(/_/g, " ")}
                      </p>
                    </div>
                    <div>
                      <p className="label-eyebrow">Stop condition</p>
                      <p className="text-[12px] leading-5 text-ink-muted">
                        {experiment.stopCondition}
                      </p>
                    </div>
                    <div>
                      <p className="label-eyebrow">Progress</p>
                      <Progress
                        value={Math.min(100, progress * 100)}
                        tone="sage"
                        size="sm"
                        label="Sample progress"
                      />
                      <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
                        {totalCompletions} / {experiment.minimumSample * experiment.variants.length}{" "}
                        completed
                      </p>
                    </div>
                  </div>
                </div>

                {experiment.interpretation && (
                  <div className="mt-4 rounded-md border-l-2 border-clay bg-clay-soft/40 px-3 py-2">
                    <p className="label-eyebrow mb-0.5">Interpretation</p>
                    <p className="text-[13px] leading-6 text-ink-soft">
                      {experiment.interpretation}
                    </p>
                  </div>
                )}

                {experiment.safetyGuardrails.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {experiment.safetyGuardrails.map((guardrail, i) => (
                      <p key={i} className="text-[12px] leading-5 text-rust">
                        Guardrail — {guardrail}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SectionHeading
        className="mt-10"
        title="Variables available"
        description="One per experiment. A test that moves two of these cannot attribute its result to either."
      />
      <div className="flex flex-wrap gap-2">
        {[
          "intervention_sequence",
          "pause_duration",
          "silence_ratio",
          "voice",
          "speaking_speed",
          "guidance_density",
          "direct_vs_invitational",
          "ambient_vs_near_silence",
          "body_first_vs_breath_first",
          "opening_duration",
          "closing_duration",
        ].map((variable) => {
          const inUse = store.experiments().some((e) => e.variable === variable);
          return (
            <Badge key={variable} tone={inUse ? "clay" : "outline"}>
              {titleCase(variable)}
              {inUse && " · in use"}
            </Badge>
          );
        })}
      </div>
    </>
  );
}
