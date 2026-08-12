import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { ComposerLeftPanel } from "@/components/studio/composer/left-panel";
import { ComposerRightPanel } from "@/components/studio/composer/right-panel";
import {
  DeltaValue,
  EvidenceBadge,
  ExperienceStatusBadge,
  ScoreBar,
  SeverityBadge,
  Stat,
} from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { flowAnalysisFor, ruleResultsFor, ruleSummaryFor, store } from "@/data/store";
import { experienceVersions, findExperience } from "@/data/source";
import { listStudioVoices } from "@/lib/db/voices";
import { PROFESSIONAL_BY_ID, SKILL_LABELS } from "@/data/seed/people";
import { resolveConstraints } from "@/domain/constraints/catalog";
import { INTERVENTION_BY_KEY } from "@/domain/interventions/library";
import { MECHANISM_BY_KEY } from "@/domain/mechanisms/library";
import { detectClaims } from "@/domain/safety/claims";
import { analyseDrift, formatSeconds } from "@/domain/timeline/planner";
import { titleCase } from "@/lib/format";
import type { ProfessionalSkillKey, TimelineSection } from "@/domain/types";

// Sessions are created at runtime, so the set is not knowable at build time.
export const dynamic = "force-dynamic";

const PERSPECTIVES = (
  [
    "trauma_informed_practice",
    "breathwork",
    "sleep_science",
    "pain_science",
    "clinical_psychology",
    "sound_design",
    "copy_editing",
  ] as ProfessionalSkillKey[]
).map((key) => ({ key, label: SKILL_LABELS[key] }));

const SECTION_TONE: Record<string, string> = {
  opening: "border-l-stone",
  orientation: "border-l-stone",
  breath: "border-l-clay",
  body: "border-l-sand",
  main: "border-l-slate",
  silence: "border-l-sage",
  sound_only: "border-l-sage",
  closing: "border-l-stone",
  reflection: "border-l-slate",
  transition: "border-l-line-strong",
};

function SectionCard({ section }: { section: TimelineSection }) {
  const intervention = section.interventionKey
    ? INTERVENTION_BY_KEY[section.interventionKey]
    : undefined;
  const mechanism = section.mechanism ? MECHANISM_BY_KEY[section.mechanism] : undefined;
  const claims = detectClaims(section.text, section.id);

  const speech = section.actualSpeechSeconds ?? section.estimatedSpeechSeconds;
  const overBudget = section.wordCount > section.wordBudget;
  const speechDrift =
    section.actualSpeechSeconds === null
      ? null
      : Number((section.actualSpeechSeconds - section.estimatedSpeechSeconds).toFixed(1));

  return (
    <article
      id={section.id}
      className={`scroll-mt-6 rounded-lg border border-line border-l-2 bg-surface p-4 shadow-quiet ${
        SECTION_TONE[section.kind] ?? "border-l-line-strong"
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-ink-faint">
              {String(section.order).padStart(2, "0")}
            </span>
            <h3 className="text-[14px] font-medium text-ink">{section.title}</h3>
            <Badge tone="neutral">{titleCase(section.kind)}</Badge>
          </div>
          {mechanism && (
            <p className="mt-1 text-[12px] text-ink-muted">
              {mechanism.name}
              {intervention && ` · ${intervention.name}`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] tabular-nums text-ink-muted">
          <span>
            {formatSeconds(section.startSeconds)} → {formatSeconds(section.endSeconds)}
          </span>
          {mechanism && <EvidenceBadge level={mechanism.evidenceLevel} />}
        </div>
      </header>

      {section.text ? (
        <pre className="mt-3 whitespace-pre-wrap font-serif text-[14px] leading-7 text-ink-soft">
          {section.text}
        </pre>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-line-strong bg-surface-muted/60 px-3 py-4 text-center text-[12px] text-ink-faint">
          {section.wordBudget > 0
            ? `No text yet — budget is ${section.wordBudget} words.`
            : "No narration in this section by design."}
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 sm:grid-cols-4 lg:grid-cols-7">
        <div>
          <dt className="label-eyebrow">Words</dt>
          <dd
            className={`font-mono text-[12px] tabular-nums ${overBudget ? "text-rust" : "text-ink-soft"}`}
          >
            {section.wordCount} / {section.wordBudget}
          </dd>
        </div>
        <div>
          <dt className="label-eyebrow">Est. speech</dt>
          <dd className="font-mono text-[12px] tabular-nums text-ink-soft">
            {section.estimatedSpeechSeconds.toFixed(1)}s
          </dd>
        </div>
        <div>
          <dt className="label-eyebrow">Actual</dt>
          <dd className="font-mono text-[12px] tabular-nums text-ink-soft">
            {section.actualSpeechSeconds === null
              ? "—"
              : `${section.actualSpeechSeconds.toFixed(1)}s`}
          </dd>
        </div>
        <div>
          <dt className="label-eyebrow">Drift</dt>
          <dd>
            <DeltaValue seconds={speechDrift} tolerance={8} />
          </dd>
        </div>
        <div>
          <dt className="label-eyebrow">Pause</dt>
          <dd className="font-mono text-[12px] tabular-nums text-ink-soft">
            {section.pauseSeconds.toFixed(1)}s
          </dd>
        </div>
        <div>
          <dt className="label-eyebrow">Sound only</dt>
          <dd className="font-mono text-[12px] tabular-nums text-ink-soft">
            {section.soundOnlySeconds.toFixed(1)}s
          </dd>
        </div>
        <div>
          <dt className="label-eyebrow">Transition</dt>
          <dd className="font-mono text-[12px] tabular-nums text-ink-soft">
            {section.transitionSeconds.toFixed(1)}s
          </dd>
        </div>
      </dl>

      {(claims.length > 0 || section.evidenceSourceIds.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {section.evidenceSourceIds.map((id) => (
            <Link key={id} href={`/evidence#${id}`}>
              <Badge tone="stone">{id.replace("src-", "")}</Badge>
            </Link>
          ))}
          {claims.map((claim, index) => (
            <Badge
              key={`${claim.pattern.key}-${index}`}
              tone={claim.pattern.severity === "blocking" ? "rust" : "amber"}
            >
              {claim.pattern.label}: “{claim.match}”
            </Badge>
          ))}
        </div>
      )}

      {speech > 0 && intervention?.voiceRequirements && (
        <p className="mt-2 text-[11px] leading-4 text-ink-faint">
          Voice direction — {intervention.voiceRequirements}
        </p>
      )}
    </article>
  );
}

export default async function ComposerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const experience = await findExperience(id);
  if (!experience) notFound();

  const plan = experience.plan;
  const timeline = experience.timeline;
  const rules = ruleResultsFor(experience);
  const summary = ruleSummaryFor(experience);
  const flow = flowAnalysisFor(experience);
  const resolved = resolveConstraints(experience.constraints);

  const linkedSourceIds = new Set(timeline?.sections.flatMap((s) => s.evidenceSourceIds) ?? []);
  const sources = store.sources().filter((s) => linkedSourceIds.has(s.id));
  const contributors = experience.contributorIds
    .map((cid) => PROFESSIONAL_BY_ID[cid])
    .filter(Boolean);

  // The composer offers the shortlist. If nothing has been approved yet it
  // falls back to the seeded voices, so a fresh install is not a dead end —
  // and says which of the two it is showing.
  const shortlist = await listStudioVoices(true).catch(() => []);
  const voiceOptions = shortlist.length
    ? shortlist.map((v) => ({
        id: v.providerVoiceId,
        providerVoiceId: v.providerVoiceId,
        provider: v.provider,
        name: v.name,
        description: v.description ?? "",
        gender: v.gender ?? "",
        accent: v.accent ?? "",
        languages: v.languages,
        warmth: 0,
        pace: 0,
        suitableFor: [],
        previewAssetId: null,
        approved: true,
        wordsPerMinute: v.wordsPerMinute,
      }))
    : store.voices().map((v) => ({ ...v, wordsPerMinute: null }));

  const drift = timeline ? analyseDrift(timeline) : null;
  const failed = rules.filter((r) => !r.passed);

  return (
    <div className="-mx-5 -my-10 sm:-mx-8">
      {/* Header bar */}
      <div className="border-b border-line bg-surface px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/composer"
              className="mb-1.5 inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink"
            >
              <ArrowLeft className="size-3" /> All sessions
            </Link>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-medium tracking-tight text-ink">{experience.title}</h1>
              <ExperienceStatusBadge status={experience.status} />
              <Badge tone="outline">v{experience.version}</Badge>
            </div>
            <p className="mt-1 font-mono text-[12px] text-ink-muted">{experience.internalTitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Stat
              label="Target"
              value={formatSeconds(experience.durationSeconds)}
              hint={timeline ? `arranged ${formatSeconds(timeline.totalSeconds)}` : undefined}
            />
            <Stat
              label="Drift"
              value={drift ? `${drift.deltaSeconds >= 0 ? "+" : ""}${drift.deltaSeconds.toFixed(1)}s` : "—"}
              tone={drift?.withinTolerance ? "good" : "danger"}
              hint="tolerance ±30s"
            />
            <Stat
              label="Confidence"
              value={plan ? plan.confidence.toFixed(2) : "—"}
              hint="engine, not a probability"
            />
            <Stat
              label="DNA score"
              value={experience.dnaScore ? experience.dnaScore.total.toFixed(2) : "—"}
              tone={
                (experience.dnaScore?.total ?? 0) >= 0.8
                  ? "good"
                  : (experience.dnaScore?.total ?? 0) >= 0.6
                    ? "warning"
                    : "danger"
              }
            />
            <Stat
              label="Blocking"
              value={String(summary.blocking)}
              tone={summary.blocking > 0 ? "danger" : "good"}
              hint={summary.canPublish ? "publishable" : "cannot publish"}
            />
          </div>
        </div>
      </div>

      {/* Three columns */}
      <div className="grid min-h-[calc(100dvh-8rem)] grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className="border-b border-line bg-canvas-sunk/60 xl:border-b-0 xl:border-r">
          <ComposerLeftPanel
            experience={experience}
            versions={await experienceVersions(experience.id)}
            comments={store.comments(experience.id)}
            reviews={store.reviews().filter((r) => r.experienceId === experience.id)}
            contributors={contributors}
            sources={sources}
            skillLabels={SKILL_LABELS}
          />
        </aside>

        <main className="scroll-quiet min-w-0 px-5 py-6 sm:px-6">
          {/* Engine explanation */}
          {plan && (
            <Card className="mb-5">
              <CardHeader className="pb-3">
                <CardTitle>Why this session looks like this</CardTitle>
                <p className="text-[13px] leading-6 text-ink-muted">
                  Target: {plan.target}. The engine gated on safety and hard boundaries first,
                  scored what survived, allocated seconds inside each mechanism&rsquo;s exposure
                  window, and ordered the result into the fixed Osora grammar.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ol className="space-y-1.5">
                  {plan.sequence.map((block) => (
                    <li key={block.order} className="flex items-start gap-3 text-[13px]">
                      <span className="w-5 shrink-0 pt-0.5 font-mono text-[11px] text-ink-faint">
                        {block.order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink-soft">
                            {block.interventionName ?? MECHANISM_BY_KEY[block.mechanism]?.name}
                          </span>
                          <Badge tone={block.familiar ? "sand" : "clay"}>
                            {block.familiar ? "familiar" : "exploration"}
                          </Badge>
                          <span className="font-mono text-[11px] text-ink-muted">
                            {formatSeconds(block.seconds)}
                          </span>
                        </div>
                        <p className="text-[12px] leading-5 text-ink-muted">{block.rationale}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                {plan.warnings.length > 0 && (
                  <div className="space-y-1 rounded-md border border-amber/25 bg-amber-soft/40 p-3">
                    {plan.warnings.map((warning, i) => (
                      <p key={i} className="flex gap-2 text-[12px] leading-5 text-ink-soft">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber" />
                        {warning}
                      </p>
                    ))}
                  </div>
                )}

                <details className="rounded-md border border-line bg-surface-muted/60">
                  <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-ink-soft">
                    Full decision trace — {plan.trace.length} entries
                  </summary>
                  <div className="scroll-quiet max-h-72 overflow-y-auto border-t border-line px-3 py-2">
                    {plan.trace.map((entry, i) => (
                      <div key={i} className="flex gap-2 py-1 text-[11px] leading-4">
                        <span className="w-14 shrink-0 font-mono uppercase tracking-wide text-ink-faint">
                          {entry.stage}
                        </span>
                        <span
                          className={`w-16 shrink-0 font-mono ${
                            entry.decision === "excluded"
                              ? "text-rust"
                              : entry.decision === "included"
                                ? "text-sage"
                                : "text-ink-faint"
                          }`}
                        >
                          {entry.decision}
                        </span>
                        <span className="w-40 shrink-0 truncate text-ink-soft">{entry.subject}</span>
                        <span className="min-w-0 flex-1 text-ink-muted">{entry.reason}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </CardContent>
            </Card>
          )}

          {/* Timeline table */}
          {timeline && (
            <Card className="mb-5">
              <CardHeader className="pb-3">
                <CardTitle>Deterministic timeline</CardTitle>
                <p className="text-[13px] leading-6 text-ink-muted">
                  Planned before any text existed. After narration is generated, every estimate here
                  is replaced by a measured duration and the arrangement is re-derived.
                </p>
              </CardHeader>
              <CardContent>
                <div className="scroll-quiet overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-line text-left">
                        <th className="py-1.5 pr-3 font-medium text-ink-muted">Section</th>
                        <th className="py-1.5 pr-3 text-right font-medium text-ink-muted">Words</th>
                        <th className="py-1.5 pr-3 text-right font-medium text-ink-muted">Est.</th>
                        <th className="py-1.5 pr-3 text-right font-medium text-ink-muted">Actual</th>
                        <th className="py-1.5 pr-3 text-right font-medium text-ink-muted">Pause</th>
                        <th className="py-1.5 pr-3 text-right font-medium text-ink-muted">Sound</th>
                        <th className="py-1.5 pr-3 text-right font-medium text-ink-muted">Start</th>
                        <th className="py-1.5 text-right font-medium text-ink-muted">End</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono tabular-nums">
                      {timeline.sections.map((section) => (
                        <tr key={section.id} className="border-b border-line/60">
                          <td className="max-w-[200px] truncate py-1.5 pr-3 font-sans text-ink-soft">
                            {section.title}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-ink-muted">
                            {section.wordCount || "—"}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-ink-muted">
                            {section.estimatedSpeechSeconds.toFixed(1)}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-ink-soft">
                            {section.actualSpeechSeconds?.toFixed(1) ?? "—"}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-ink-muted">
                            {section.pauseSeconds.toFixed(1)}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-ink-muted">
                            {section.soundOnlySeconds.toFixed(1)}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-ink-muted">
                            {formatSeconds(section.startSeconds)}
                          </td>
                          <td className="py-1.5 text-right text-ink-muted">
                            {formatSeconds(section.endSeconds)}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-medium">
                        <td className="py-2 pr-3 font-sans text-ink">Total</td>
                        <td className="py-2 pr-3 text-right text-ink">
                          {timeline.sections.reduce((s, x) => s + x.wordCount, 0)}
                        </td>
                        <td colSpan={5} />
                        <td className="py-2 text-right text-ink">
                          {formatSeconds(timeline.totalSeconds)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {drift && !drift.withinTolerance && (
                  <div className="mt-4 rounded-md border border-amber/25 bg-amber-soft/40 p-3">
                    <p className="text-[13px] font-medium text-ink">
                      {drift.deltaSeconds > 0 ? "Over" : "Under"} target by{" "}
                      {Math.abs(drift.deltaSeconds).toFixed(1)}s
                    </p>
                    <ul className="mt-2 space-y-1">
                      {drift.remedies.map((remedy) => (
                        <li key={remedy.key} className="text-[12px] leading-5 text-ink-soft">
                          <span className="font-medium">{remedy.label}</span> — {remedy.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Script sections */}
          <h2 className="mb-3 text-[15px] font-medium tracking-tight text-ink">Sections</h2>
          <div className="space-y-4">
            {timeline?.sections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>

          {/* Scientific rationale + contraindications */}
          {plan && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Scientific rationale</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {plan.mechanisms.map((recommendation) => {
                    const mechanism = MECHANISM_BY_KEY[recommendation.mechanism];
                    return (
                      <div key={recommendation.mechanism}>
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-medium text-ink-soft">{mechanism?.name}</p>
                          <EvidenceBadge level={recommendation.evidenceLevel} />
                        </div>
                        <p className="text-[12px] leading-5 text-ink-muted">
                          {mechanism?.intendedEffect}
                        </p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Contraindications in force</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {plan.sequence.flatMap((block) => {
                    const intervention = block.interventionKey
                      ? INTERVENTION_BY_KEY[block.interventionKey]
                      : undefined;
                    return (intervention?.contraindications ?? []).map((contraindication) => (
                      <div key={`${block.order}-${contraindication.id}`}>
                        <p className="text-[13px] font-medium text-ink-soft">
                          {contraindication.summary}
                        </p>
                        <p className="text-[12px] leading-5 text-ink-muted">
                          {contraindication.guidance}
                        </p>
                        {contraindication.requiresSkill && (
                          <Badge tone="slate" className="mt-1">
                            {SKILL_LABELS[contraindication.requiresSkill]} review
                          </Badge>
                        )}
                      </div>
                    ));
                  })}
                  {resolved.blockedTags.size > 0 && (
                    <div className="rounded-md border border-rust/20 bg-rust-soft/40 p-2.5">
                      <p className="text-[12px] font-medium text-ink-soft">
                        Hard boundaries removed {resolved.blockedTags.size} content tag
                        {resolved.blockedTags.size === 1 ? "" : "s"} before scoring
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {[...resolved.blockedTags].map((tag) => (
                          <Badge key={tag} tone="rust">
                            {tag.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Validation */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  Rule validation
                  <span className="text-[12px] font-normal text-ink-muted">
                    {summary.passed}/{summary.total} passing
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {failed.length === 0 ? (
                  <p className="flex items-center gap-2 text-[13px] text-sage">
                    <CircleCheck className="size-4" /> Every active rule passes.
                  </p>
                ) : (
                  failed.map((result, index) => (
                    <div
                      key={`${result.ruleKey}-${index}`}
                      className="rounded-md border border-line bg-surface-muted/60 p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium text-ink-soft">{result.ruleName}</p>
                        <SeverityBadge severity={result.severity} />
                      </div>
                      <p className="mt-0.5 text-[12px] leading-5 text-ink-muted">{result.message}</p>
                      {result.suggestion && (
                        <p className="mt-1 text-[12px] leading-5 text-clay">{result.suggestion}</p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {flow && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Flow validation</CardTitle>
                  <p className="text-[12px] leading-5 text-ink-muted">
                    Editorial support, not a measure of therapeutic quality.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ScoreBar label="Overall" value={flow.scores.overall} />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <ScoreBar label="Timing" value={flow.scores.timing} />
                    <ScoreBar label="Voice pacing" value={flow.scores.voicePacing} />
                    <ScoreBar label="Sound balance" value={flow.scores.soundBalance} />
                    <ScoreBar label="Familiarity" value={flow.scores.familiarity} />
                    <ScoreBar label="Scientific quality" value={flow.scores.scientificQuality} />
                    <ScoreBar label="Safety" value={flow.scores.safety} />
                  </div>

                  {flow.blockingErrors.length > 0 && (
                    <div className="space-y-1 rounded-md border border-rust/25 bg-rust-soft/40 p-2.5">
                      {flow.blockingErrors.map((error, i) => (
                        <p key={i} className="flex gap-2 text-[12px] leading-5 text-ink-soft">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-rust" />
                          {error}
                        </p>
                      ))}
                    </div>
                  )}

                  <details className="rounded-md border border-line bg-surface-muted/60">
                    <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-ink-soft">
                      All {flow.checks.length} checks
                    </summary>
                    <div className="scroll-quiet max-h-64 overflow-y-auto border-t border-line">
                      {flow.checks.map((check) => (
                        <div
                          key={check.key}
                          className="flex items-center justify-between gap-2 border-b border-line/60 px-3 py-1.5 last:border-0"
                        >
                          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
                            {check.label}
                          </span>
                          <span className="font-mono text-[11px] text-ink-muted">{check.value}</span>
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${
                              check.status === "ok"
                                ? "bg-sage"
                                : check.status === "warning"
                                  ? "bg-amber"
                                  : check.status === "blocking"
                                    ? "bg-rust"
                                    : "bg-stone"
                            }`}
                          />
                        </div>
                      ))}
                    </div>
                  </details>

                  {flow.suggestions.length > 0 && (
                    <div className="space-y-1">
                      {flow.suggestions.map((suggestion, i) => (
                        <p key={i} className="flex gap-2 text-[12px] leading-5 text-ink-muted">
                          <Info className="mt-0.5 size-3.5 shrink-0 text-slate" />
                          {suggestion}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* DNA */}
          {experience.dnaScore && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle>Osora DNA score — {experience.dnaScore.total.toFixed(2)}</CardTitle>
                <p className="text-[12px] leading-5 text-ink-muted">
                  How much of the stable identity survived this personalised composition.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {experience.dnaScore.components.map((component) => (
                    <div key={component.key}>
                      <ScoreBar
                        label={`${component.label} · ×${component.weight}`}
                        value={component.score}
                        hint={component.detail}
                      />
                    </div>
                  ))}
                </div>
                {experience.dnaScore.warnings.length > 0 && (
                  <div className="mt-3 space-y-1 rounded-md border border-amber/25 bg-amber-soft/40 p-2.5">
                    {experience.dnaScore.warnings.map((warning, i) => (
                      <p key={i} className="text-[12px] leading-5 text-ink-soft">
                        {warning}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {experience.audioProjectId && (
              <Button asChild variant="outline">
                <Link href={`/audio-lab/${experience.audioProjectId}`}>Open in Audio Lab</Link>
              </Button>
            )}
            {experience.experimentId && (
              <Button asChild variant="outline">
                <Link href={`/experiments/${experience.experimentId}`}>View experiment</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/reviews">Review queue</Link>
            </Button>
          </div>
        </main>

        <aside className="border-t border-line bg-canvas-sunk/60 xl:border-l xl:border-t-0">
          <ComposerRightPanel
            experienceId={experience.id}
            hasScript={(timeline?.sections ?? []).some((s) => s.text.trim().length > 0)}
            canEdit={!["published", "archived", "approved"].includes(experience.status)}
            settings={experience.settings}
            voices={voiceOptions}
            voicesAreShortlist={shortlist.length > 0}
            soundStyles={["low_bed", "warm_drone", "soft_air", "near_silence", "slow_pulse"]}
            llmProviders={[
              { id: "mock", label: "Mock provider", configured: true },
              { id: "anthropic", label: "Anthropic", configured: false },
              { id: "openai", label: "OpenAI", configured: false },
              { id: "gemini", label: "Google Gemini", configured: false },
            ]}
            ttsProviders={[
              { id: "mock", label: "Mock voice & sound", configured: true },
              { id: "elevenlabs", label: "ElevenLabs", configured: false },
            ]}
            perspectives={PERSPECTIVES}
            blockedVoiceIds={[...resolved.blockedVoiceIds]}
          />
        </aside>
      </div>
    </div>
  );
}
