import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { Stat } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { store } from "@/data/store";
import { profileDelta } from "@/domain/state/dimensions";
import { titleCase } from "@/lib/format";

export function generateStaticParams() {
  return store.experiments().map((experiment) => ({ id: experiment.id }));
}

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const experiment = store.experiments().find((e) => e.id === id);
  if (!experiment) notFound();

  const control = experiment.variants.find((v) => v.isControl);
  const outcomes = store.outcomes();

  // Recompute the arm summaries from the recorded outcomes rather than trusting
  // the stored headline numbers — the screen should agree with the data.
  const armStats = experiment.variants.map((variant) => {
    const rows = outcomes.filter((o) => o.experimentVariantId === variant.id);
    const deltas = rows.map((o) => profileDelta(o.pre, o.post));
    const mean = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
    return {
      variant,
      recorded: rows.length,
      meanRecordedDelta: mean === null ? null : Number(mean.toFixed(2)),
      completionRate: rows.length
        ? Number((rows.filter((o) => o.completed).length / rows.length).toFixed(2))
        : null,
      feltSafeRate: rows.length
        ? Number((rows.filter((o) => o.feltSafe).length / rows.length).toFixed(2))
        : null,
    };
  });

  return (
    <>
      <Link
        href="/experiments"
        className="mb-3 inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-3" /> Experiments
      </Link>

      <PageHeader
        eyebrow={`${titleCase(experiment.variable)} · ${titleCase(experiment.status)}`}
        title={experiment.name}
        description={experiment.hypothesis}
      />

      <div className="mb-8 grid gap-x-6 gap-y-5 rounded-lg border border-line bg-surface p-5 shadow-quiet sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Owner" value={experiment.ownerName.split(" ").slice(-1)[0]} />
        <Stat
          label="Primary outcome"
          value={titleCase(experiment.primaryOutcome)}
          hint="self-reported"
        />
        <Stat label="Minimum sample" value={`${experiment.minimumSample}/arm`} />
        <Stat
          label="Recorded"
          value={String(armStats.reduce((s, a) => s + a.recorded, 0))}
          hint="sessions with outcomes"
        />
        <Stat label="Required review" value={titleCase(experiment.requiredReview)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <SectionHeading
              title="Arms"
              description="Recomputed from recorded outcomes. Sample size travels with every number."
            />
            <div className="space-y-4">
              {armStats.map(({ variant, recorded, meanRecordedDelta, completionRate, feltSafeRate }) => {
                const lift =
                  control &&
                  variant.meanPrimaryDelta !== null &&
                  control.meanPrimaryDelta !== null &&
                  !variant.isControl
                    ? Number((variant.meanPrimaryDelta - control.meanPrimaryDelta).toFixed(2))
                    : null;

                return (
                  <Card key={variant.id}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle>{variant.label}</CardTitle>
                        {variant.isControl ? (
                          <Badge tone="stone">Control</Badge>
                        ) : (
                          <Badge tone="clay">Variant</Badge>
                        )}
                      </div>
                      <p className="text-[13px] leading-6 text-ink-muted">{variant.description}</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                        <div>
                          <p className="label-eyebrow">Assigned</p>
                          <p className="font-mono text-[15px] tabular-nums text-ink-soft">
                            {variant.assignments}
                          </p>
                        </div>
                        <div>
                          <p className="label-eyebrow">Completed</p>
                          <p className="font-mono text-[15px] tabular-nums text-ink-soft">
                            {variant.completions}
                          </p>
                        </div>
                        <div>
                          <p className="label-eyebrow">Mean Δ</p>
                          <p className="font-mono text-[15px] tabular-nums text-ink">
                            {variant.meanPrimaryDelta?.toFixed(2) ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="label-eyebrow">Lift</p>
                          <p
                            className={`font-mono text-[15px] tabular-nums ${
                              lift === null ? "text-ink-faint" : lift > 0 ? "text-sage" : "text-rust"
                            }`}
                          >
                            {lift === null ? "—" : `${lift > 0 ? "+" : ""}${lift}`}
                          </p>
                        </div>
                        <div>
                          <p className="label-eyebrow">Felt safe</p>
                          <p
                            className={`font-mono text-[15px] tabular-nums ${
                              feltSafeRate !== null && feltSafeRate < 0.92
                                ? "text-rust"
                                : "text-ink-soft"
                            }`}
                          >
                            {feltSafeRate !== null ? `${Math.round(feltSafeRate * 100)}%` : "—"}
                          </p>
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex justify-between text-[11px] text-ink-muted">
                          <span>Toward minimum sample</span>
                          <span className="font-mono">
                            {variant.completions}/{experiment.minimumSample}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(100, (variant.completions / experiment.minimumSample) * 100)}
                          tone={variant.isControl ? "stone" : "clay"}
                          size="sm"
                          label={`${variant.label} sample progress`}
                        />
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2 text-[12px] text-ink-muted">
                        <span>
                          Recorded here: <span className="font-mono">{recorded}</span>
                        </span>
                        <span>
                          Recomputed Δ:{" "}
                          <span className="font-mono">{meanRecordedDelta ?? "—"}</span>
                        </span>
                        <span>
                          Completion:{" "}
                          <span className="font-mono">
                            {completionRate !== null ? `${Math.round(completionRate * 100)}%` : "—"}
                          </span>
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {Object.entries(variant.settingsDelta).map(([key, value]) => (
                          <Badge key={key} tone="outline">
                            {key} = {String(value)}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {(experiment.results || experiment.interpretation) && (
            <div>
              <SectionHeading title="Results and interpretation" />
              <Card>
                <CardContent className="space-y-3 p-5">
                  {experiment.results && (
                    <div>
                      <p className="label-eyebrow mb-1">Results</p>
                      <p className="text-[13px] leading-6 text-ink-soft">{experiment.results}</p>
                    </div>
                  )}
                  {experiment.interpretation && (
                    <div className="rounded-md border-l-2 border-clay bg-clay-soft/40 px-3 py-2">
                      <p className="label-eyebrow mb-0.5">Interpretation</p>
                      <p className="text-[13px] leading-6 text-ink-soft">
                        {experiment.interpretation}
                      </p>
                    </div>
                  )}
                  <p className="text-[12px] leading-5 text-ink-faint">
                    Product-learning data. Not medical evidence, and not a causal claim about
                    anything outside this product.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Design</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="label-eyebrow">Variable</p>
                <p className="text-[13px] text-ink-soft">{titleCase(experiment.variable)}</p>
              </div>
              <div>
                <p className="label-eyebrow">Eligible population</p>
                <p className="text-[12px] leading-5 text-ink-muted">
                  {experiment.eligiblePopulation}
                </p>
              </div>
              <div>
                <p className="label-eyebrow mb-1">Exclusion criteria</p>
                <ul className="space-y-0.5">
                  {experiment.exclusionCriteria.map((criterion, i) => (
                    <li key={i} className="text-[12px] leading-5 text-ink-muted">
                      — {criterion}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="label-eyebrow mb-1">Secondary outcomes</p>
                <div className="flex flex-wrap gap-1">
                  {experiment.secondaryOutcomes.map((outcome) => (
                    <Badge key={outcome} tone="stone">
                      {titleCase(outcome)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="label-eyebrow">Stop condition</p>
                <p className="text-[12px] leading-5 text-ink-muted">{experiment.stopCondition}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Safety guardrails</CardTitle>
            </CardHeader>
            <CardContent>
              {experiment.safetyGuardrails.length === 0 ? (
                <p className="text-[13px] text-ink-muted">
                  None declared — acceptable only because this experiment does not touch safety-gated
                  content.
                </p>
              ) : (
                <ul className="space-y-2">
                  {experiment.safetyGuardrails.map((guardrail, i) => (
                    <li key={i} className="text-[13px] leading-6 text-ink-soft">
                      {guardrail}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Sessions in this experiment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {store
                .experiences()
                .filter((e) => e.experimentId === experiment.id)
                .map((e) => (
                  <Link
                    key={e.id}
                    href={`/composer/${e.id}`}
                    className="block text-[13px] text-ink hover:text-clay"
                  >
                    {e.title}
                  </Link>
                ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
