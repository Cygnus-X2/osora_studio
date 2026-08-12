import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { Stat } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { outcomeAttribution, store } from "@/data/store";
import { DIMENSION_BY_KEY } from "@/domain/state/dimensions";
import { titleCase } from "@/lib/format";
import type { OutcomeAttributionRow } from "@/domain/types";

export const metadata = { title: "Outcomes · Osora Studio" };

/**
 * A row with n=2 and a row with n=40 must not look alike. Sample size is shown
 * on every row and low-n rows are visually demoted rather than hidden — hiding
 * them would make the table look more certain than it is.
 */
function AttributionTable({
  title,
  rows,
  description,
}: {
  title: string;
  rows: OutcomeAttributionRow[];
  description?: string;
}) {
  const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.meanDelta)));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        {description && <p className="text-[12px] leading-5 text-ink-muted">{description}</p>}
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-[13px] text-ink-muted">No sessions recorded yet.</p>
        ) : (
          rows.map((row) => {
            const thin = row.sessions < 8;
            return (
              <div key={row.key} className={thin ? "opacity-60" : ""}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[12px] text-ink-soft">{row.label}</span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
                    n={row.sessions} ·{" "}
                    <span className={row.meanDelta >= 0 ? "text-sage" : "text-rust"}>
                      {row.meanDelta >= 0 ? "+" : ""}
                      {row.meanDelta.toFixed(2)}
                    </span>
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 rounded-full bg-canvas-sunk">
                  <div className="absolute left-1/2 top-[-2px] h-2.5 w-px bg-line-strong" />
                  <div
                    className={`absolute h-1.5 rounded-full ${
                      row.meanDelta >= 0 ? "bg-sage" : "bg-rust"
                    }`}
                    style={{
                      left:
                        row.meanDelta >= 0
                          ? "50%"
                          : `${50 - (Math.abs(row.meanDelta) / max) * 50}%`,
                      width: `${(Math.abs(row.meanDelta) / max) * 50}%`,
                    }}
                  />
                </div>
                {thin && (
                  <p className="mt-0.5 text-[10px] text-ink-faint">
                    Too few sessions to read anything into.
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default async function OutcomesPage() {
  const data = await outcomeAttribution();
  const outcomes = store.outcomes();

  const dislikes = outcomes.flatMap((o) => o.dislikes);
  const dislikeCounts = [...new Set(dislikes)]
    .map((text) => ({ text, count: dislikes.filter((d) => d === text).length }))
    .sort((a, b) => b.count - a.count);

  const audioProblems = outcomes.flatMap((o) => o.audioProblems);
  const problemCounts = [...new Set(audioProblems)]
    .map((text) => ({ text, count: audioProblems.filter((p) => p === text).length }))
    .sort((a, b) => b.count - a.count);

  const feedback = outcomes.filter((o) => o.freeText).slice(0, 8);

  return (
    <>
      <PageHeader
        eyebrow="Outcome tracking"
        title="Outcomes"
        description="Self-reported state before and after, not content satisfaction. A session that someone enjoyed but that moved nothing is a different result from one that helped."
        actions={<Badge tone="amber">Product-learning data, not medical evidence</Badge>}
      />

      <div className="mb-8 grid gap-x-6 gap-y-5 rounded-lg border border-line bg-surface p-5 shadow-quiet sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Sessions" value={String(data.summary.sessions)} />
        <Stat
          label="Mean state delta"
          value={`${data.summary.meanDelta >= 0 ? "+" : ""}${data.summary.meanDelta.toFixed(2)}`}
          tone={data.summary.meanDelta > 0 ? "good" : "warning"}
          hint="oriented toward pleasant"
        />
        <Stat
          label="Mean helpfulness"
          value={data.summary.meanHelpfulness.toFixed(2)}
          hint="of 5"
        />
        <Stat
          label="Completion"
          value={`${Math.round(data.summary.completionRate * 100)}%`}
          tone={data.summary.completionRate >= 0.85 ? "good" : "warning"}
        />
        <Stat
          label="Felt safe"
          value={`${Math.round(data.summary.feltSafeRate * 100)}%`}
          tone={data.summary.feltSafeRate >= 0.95 ? "good" : "danger"}
        />
        <Stat
          label="Audio problems"
          value={`${Math.round(data.summary.audioProblemRate * 100)}%`}
          tone={data.summary.audioProblemRate > 0.05 ? "warning" : "good"}
        />
      </div>

      <SectionHeading
        title="State change by dimension"
        description="Mean self-reported movement, oriented so that positive is movement toward the pleasant end of each scale."
      />
      <Card className="mb-10">
        <CardContent className="space-y-2.5 p-5">
          {data.dimensions.map((row) => {
            const definition = DIMENSION_BY_KEY[row.dimension];
            const max = Math.max(1, ...data.dimensions.map((d) => Math.abs(d.meanDelta)));
            return (
              <div key={row.dimension} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-[12px] text-ink-soft">{definition.name}</span>
                <div className="relative h-2 flex-1 rounded-full bg-canvas-sunk">
                  <div className="absolute left-1/2 top-[-3px] h-3.5 w-px bg-line-strong" />
                  <div
                    className={`absolute h-2 rounded-full ${
                      row.meanDelta >= 0 ? "bg-sage" : "bg-rust"
                    }`}
                    style={{
                      left:
                        row.meanDelta >= 0 ? "50%" : `${50 - (Math.abs(row.meanDelta) / max) * 50}%`,
                      width: `${(Math.abs(row.meanDelta) / max) * 50}%`,
                    }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-[12px] tabular-nums text-ink-muted">
                  {row.meanDelta >= 0 ? "+" : ""}
                  {row.meanDelta.toFixed(2)}
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-[11px] text-ink-faint">
                  n={row.sessions}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <SectionHeading
        title="Attribution"
        description="Descriptive aggregation across recorded sessions. These are associations inside one product, not causal findings."
      />
      <div className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AttributionTable
          title="By mechanism"
          rows={data.byMechanism}
          description="Feeds a small, capped bias back into engine scoring."
        />
        <AttributionTable title="By intervention" rows={data.byIntervention} />
        <AttributionTable title="By voice" rows={data.byVoice} />
        <AttributionTable title="By sound style" rows={data.bySoundStyle} />
        <AttributionTable
          title="By silence ratio"
          rows={data.bySilenceRatio}
          description="Bucketed in ten-point bands."
        />
        <AttributionTable title="By duration" rows={data.byDuration} />
        <AttributionTable
          title="By sequence"
          rows={data.bySequence}
          description="The section grammar as it was actually arranged."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Explicit dislikes</CardTitle>
            <p className="text-[12px] leading-5 text-ink-muted">
              What people said they did not want, in their words.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {dislikeCounts.map((entry) => (
              <div key={entry.text} className="flex items-start justify-between gap-3">
                <p className="text-[13px] leading-5 text-ink-soft">{entry.text}</p>
                <span className="shrink-0 font-mono text-[12px] text-ink-muted">{entry.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Audio problems</CardTitle>
            <p className="text-[12px] leading-5 text-ink-muted">
              Reported by listeners. Each one maps to a flow-validation check.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {problemCounts.length === 0 ? (
              <p className="text-[13px] text-ink-muted">None reported.</p>
            ) : (
              problemCounts.map((entry) => (
                <div key={entry.text} className="flex items-start justify-between gap-3">
                  <p className="text-[13px] leading-5 text-ink-soft">{entry.text}</p>
                  <span className="shrink-0 font-mono text-[12px] text-rust">{entry.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Free-text feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {feedback.map((outcome) => (
              <div key={outcome.id} className="border-l-2 border-line pl-3">
                <p className="font-serif text-[13px] italic leading-6 text-ink-soft">
                  “{outcome.freeText}”
                </p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {titleCase(outcome.context.environment)} · {outcome.context.timeOfDay} ·
                  helpfulness {outcome.helpfulness}/5
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
