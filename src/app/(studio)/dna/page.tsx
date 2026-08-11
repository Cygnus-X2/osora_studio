import { Lock, Unlock } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { ScoreBar } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { store } from "@/data/store";
import { DNA_RULE_NOTES } from "@/data/seed/dna";
import { nextExplorationRatio } from "@/domain/dna/score";
import { titleCase } from "@/lib/format";
import { PREFERENCES, BOUNDARIES } from "@/domain/constraints/catalog";

export const metadata = { title: "Osora DNA · Osora Studio" };

export default function DnaPage() {
  const dna = store.dna();
  const experiences = store.experiences();
  const scored = experiences.filter((e) => e.dnaScore !== null);
  const meanScore =
    scored.reduce((sum, e) => sum + (e.dnaScore?.total ?? 0), 0) / (scored.length || 1);

  const stableEntries = Object.entries(dna.stable).filter(
    ([key]) => key !== "sessionGrammar",
  ) as Array<[string, string]>;

  return (
    <>
      <PageHeader
        eyebrow={`Version ${dna.version}`}
        title="Osora DNA"
        description="Personalisation without a spine produces sessions that feel like different products. The DNA is the part that does not move — and the explicit budget for how far the rest may travel."
        actions={<Badge tone="sage">Mean DNA score {meanScore.toFixed(2)}</Badge>}
      />

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4 text-clay" /> Stable
            </CardTitle>
            <p className="text-[13px] leading-6 text-ink-muted">
              Present in every session regardless of state, preference or engine ranking. The
              opening and closing are inserted by the engine independently of scoring.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {stableEntries.map(([key, value]) => (
              <div key={key}>
                <p className="label-eyebrow">{titleCase(key)}</p>
                <p className="mt-0.5 text-[13px] leading-6 text-ink-soft">{value}</p>
              </div>
            ))}
            <div>
              <p className="label-eyebrow mb-1">Session grammar</p>
              <div className="flex flex-wrap items-center gap-1">
                {dna.stable.sessionGrammar.map((kind, index) => (
                  <span key={kind} className="flex items-center gap-1">
                    <Badge tone={dna.rules.lockedSections.includes(kind) ? "clay" : "stone"}>
                      {titleCase(kind)}
                    </Badge>
                    {index < dna.stable.sessionGrammar.length - 1 && (
                      <span className="text-ink-faint">→</span>
                    )}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-ink-faint">
                Clay marks a locked section. The order is fixed — the ranking decides content, never
                sequence.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Unlock className="size-4 text-sage" /> Adaptive
            </CardTitle>
            <p className="text-[13px] leading-6 text-ink-muted">
              What the State Engine may move, and how far.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="label-eyebrow">Silence ratio band</p>
              <p className="mt-0.5 font-mono text-[13px] text-ink-soft">
                {Math.round(dna.adaptive.silenceRatioRange[0] * 100)}% –{" "}
                {Math.round(dna.adaptive.silenceRatioRange[1] * 100)}%
              </p>
              <p className="text-[11px] leading-4 text-ink-faint">
                Share of the session with no voice — dedicated silence plus the pauses inside guided
                blocks.
              </p>
            </div>
            <div>
              <p className="label-eyebrow">Guidance density</p>
              <p className="mt-0.5 text-[13px] capitalize text-ink-soft">
                {dna.adaptive.guidanceDensityRange.join(" – ")}
              </p>
            </div>
            <div>
              <p className="label-eyebrow">Voice intensity</p>
              <p className="mt-0.5 font-mono text-[13px] text-ink-soft">
                {dna.adaptive.voiceIntensityRange.join(" – ")}
              </p>
            </div>
            <div>
              <p className="label-eyebrow mb-1">Approved imagery themes</p>
              <div className="flex flex-wrap gap-1">
                {dna.adaptive.allowedImageryThemes.map((theme) => (
                  <Badge key={theme} tone="sand">
                    {theme}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="label-eyebrow mb-1">Soundscape options</p>
              <div className="flex flex-wrap gap-1">
                {dna.adaptive.soundscapeOptions.map((option) => (
                  <Badge key={option} tone="stone">
                    {option.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <SectionHeading
        title="Rules"
        description="Each of these is enforced by the engine, not by a habit."
      />
      <div className="mb-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {DNA_RULE_NOTES.map((note) => (
          <div key={note.key} className="rounded-lg border border-line bg-surface p-4 shadow-quiet">
            <p className="text-[13px] font-medium text-ink">{note.label}</p>
            <p className="mt-1 text-[12px] leading-5 text-ink-muted">{note.detail}</p>
          </div>
        ))}
      </div>

      <SectionHeading
        title="How exploration moves"
        description="Down fast, up slowly. Trust is cheaper to lose than to build."
      />
      <Card className="mb-8">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-6">
            {(["negative", "neutral", "positive"] as const).map((outcome) => {
              const from = dna.rules.defaultExplorationRatio;
              const to = nextExplorationRatio(from, dna, outcome);
              return (
                <div key={outcome}>
                  <p className="label-eyebrow">After a {outcome} session</p>
                  <p className="mt-0.5 font-mono text-[15px] tabular-nums text-ink">
                    {Math.round(from * 100)}%{" "}
                    <span className="text-ink-faint">→</span>{" "}
                    <span
                      className={
                        to > from ? "text-sage" : to < from ? "text-rust" : "text-ink-muted"
                      }
                    >
                      {Math.round(to * 100)}%
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <SectionHeading
        title="Preferences and boundaries"
        description="A listener never picks a method. They say what they want more of, and what they will not accept."
      />
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Soft preferences</CardTitle>
            <p className="text-[13px] leading-6 text-ink-muted">
              Scored. They bias the ranking; they never remove a candidate.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {PREFERENCES.map((preference) => (
              <div key={preference.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink-soft">{preference.label}</p>
                  <p className="text-[11px] leading-4 text-ink-faint">{preference.description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {Object.entries(preference.mechanismBias)
                    .slice(0, 2)
                    .map(([mechanism, bias]) => (
                      <Badge key={mechanism} tone={bias > 0 ? "sage" : "stone"}>
                        {bias > 0 ? "+" : ""}
                        {bias} {mechanism.replace(/_/g, " ")}
                      </Badge>
                    ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Hard boundaries</CardTitle>
            <p className="text-[13px] leading-6 text-ink-muted">
              Structural. They remove candidates before scoring, so no score, preference or model
              output can reintroduce them.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {BOUNDARIES.map((boundary) => (
              <div key={boundary.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink-soft">{boundary.label}</p>
                  <p className="text-[11px] leading-4 text-ink-faint">{boundary.description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {boundary.blocksTags.map((tag) => (
                    <Badge key={tag} tone="rust">
                      {tag.replace(/_/g, " ")}
                    </Badge>
                  ))}
                  {boundary.requiresValue && <Badge tone="outline">needs value</Badge>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <SectionHeading
        title="DNA scores in flight"
        description="Drift becomes visible before publication rather than after a listener notices."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {scored.map((experience) => (
          <Card key={experience.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="truncate">{experience.title}</CardTitle>
                <span className="font-mono text-[13px] tabular-nums text-ink">
                  {experience.dnaScore?.total.toFixed(2)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {experience.dnaScore?.components.map((component) => (
                <ScoreBar key={component.key} label={component.label} value={component.score} />
              ))}
              {experience.dnaScore && experience.dnaScore.warnings.length > 0 && (
                <p className="rounded-md bg-amber-soft/50 px-2 py-1.5 text-[11px] leading-4 text-ink-soft">
                  {experience.dnaScore.warnings[0]}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
