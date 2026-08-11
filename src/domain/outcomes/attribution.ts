import { INTERVENTION_BY_KEY } from "@/domain/interventions/library";
import { MECHANISM_BY_KEY } from "@/domain/mechanisms/library";
import { orientedDelta, profileDelta } from "@/domain/state/dimensions";
import type {
  DimensionKey,
  Experience,
  MechanismKey,
  OutcomeAttributionRow,
  SessionOutcome,
} from "@/domain/types";

/**
 * Outcome attribution.
 *
 * This is descriptive aggregation over recorded sessions — product-learning
 * data, not medical evidence and not a causal claim. Sample size travels with
 * every row so a mean of two sessions is never read as a finding.
 */

export interface AttributionInput {
  outcomes: SessionOutcome[];
  experiences: Experience[];
}

interface Bucket {
  label: string;
  deltas: number[];
  helpfulness: number[];
  feltSafe: boolean[];
}

function emptyBucket(label: string): Bucket {
  return { label, deltas: [], helpfulness: [], feltSafe: [] };
}

function toRows(buckets: Map<string, Bucket>): OutcomeAttributionRow[] {
  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      sessions: bucket.deltas.length,
      meanDelta: mean(bucket.deltas),
      meanHelpfulness: mean(bucket.helpfulness),
      feltSafeRatio:
        bucket.feltSafe.length === 0
          ? 0
          : round(bucket.feltSafe.filter(Boolean).length / bucket.feltSafe.length),
    }))
    .sort((a, b) => b.meanDelta - a.meanDelta);
}

function collect(
  input: AttributionInput,
  keysFor: (outcome: SessionOutcome, experience: Experience) => Array<{ key: string; label: string }>,
): OutcomeAttributionRow[] {
  const buckets = new Map<string, Bucket>();
  const byId = new Map(input.experiences.map((e) => [e.id, e]));

  for (const outcome of input.outcomes) {
    const experience = byId.get(outcome.experienceId);
    if (!experience) continue;
    const delta = profileDelta(outcome.pre, outcome.post);

    for (const { key, label } of keysFor(outcome, experience)) {
      const bucket = buckets.get(key) ?? emptyBucket(label);
      bucket.deltas.push(delta);
      bucket.helpfulness.push(outcome.helpfulness);
      bucket.feltSafe.push(outcome.feltSafe);
      buckets.set(key, bucket);
    }
  }

  return toRows(buckets);
}

export function attributionByMechanism(input: AttributionInput): OutcomeAttributionRow[] {
  return collect(input, (_, experience) =>
    (experience.plan?.mechanisms ?? []).map((m) => ({
      key: m.mechanism,
      label: MECHANISM_BY_KEY[m.mechanism]?.name ?? m.mechanism,
    })),
  );
}

export function attributionByIntervention(input: AttributionInput): OutcomeAttributionRow[] {
  return collect(input, (_, experience) =>
    (experience.plan?.sequence ?? [])
      .filter((b) => b.interventionKey)
      .map((b) => ({
        key: b.interventionKey as string,
        label: INTERVENTION_BY_KEY[b.interventionKey as string]?.name ?? (b.interventionKey as string),
      })),
  );
}

export function attributionBySequence(input: AttributionInput): OutcomeAttributionRow[] {
  return collect(input, (_, experience) => {
    const kinds = (experience.plan?.sequence ?? []).map((b) => b.sectionKind);
    if (kinds.length === 0) return [];
    const key = kinds.join(">");
    return [{ key, label: kinds.join(" → ") }];
  });
}

export function attributionByVoice(input: AttributionInput): OutcomeAttributionRow[] {
  return collect(input, (_, experience) => [
    { key: experience.settings.voiceId, label: experience.settings.voiceId },
  ]);
}

export function attributionBySoundStyle(input: AttributionInput): OutcomeAttributionRow[] {
  return collect(input, (_, experience) => [
    { key: experience.settings.soundStyle, label: experience.settings.soundStyle },
  ]);
}

export function attributionBySilenceRatio(input: AttributionInput): OutcomeAttributionRow[] {
  return collect(input, (_, experience) => {
    const ratio = experience.plan?.silenceRatio ?? experience.settings.silenceRatio;
    const bucket = Math.floor(ratio * 10) / 10;
    return [{ key: `silence-${bucket}`, label: `${Math.round(bucket * 100)}–${Math.round(bucket * 100) + 10}%` }];
  });
}

export function attributionByDuration(input: AttributionInput): OutcomeAttributionRow[] {
  return collect(input, (_, experience) => {
    const minutes = Math.round(experience.durationSeconds / 60);
    const bucket = minutes <= 5 ? "≤5 min" : minutes <= 10 ? "6–10 min" : minutes <= 15 ? "11–15 min" : ">15 min";
    return [{ key: bucket, label: bucket }];
  });
}

/** Mean oriented delta per dimension, across all recorded outcomes. */
export function dimensionDeltas(
  outcomes: SessionOutcome[],
): Array<{ dimension: DimensionKey; meanDelta: number; sessions: number }> {
  const buckets = new Map<DimensionKey, number[]>();
  for (const outcome of outcomes) {
    for (const key of Object.keys(outcome.pre) as DimensionKey[]) {
      const pre = outcome.pre[key];
      const post = outcome.post[key];
      if (pre === undefined || post === undefined) continue;
      const list = buckets.get(key) ?? [];
      list.push(orientedDelta(key, pre, post));
      buckets.set(key, list);
    }
  }
  return [...buckets.entries()]
    .map(([dimension, deltas]) => ({
      dimension,
      meanDelta: mean(deltas),
      sessions: deltas.length,
    }))
    .sort((a, b) => b.meanDelta - a.meanDelta);
}

/**
 * Per-user mechanism bias fed back into engine scoring. Deliberately small and
 * capped in the engine — this is a nudge from recorded experience, not a
 * learned model.
 */
export function mechanismOutcomeBias(
  input: AttributionInput,
  minimumSessions = 2,
): Partial<Record<MechanismKey, number>> {
  const bias: Partial<Record<MechanismKey, number>> = {};
  for (const row of attributionByMechanism(input)) {
    if (row.sessions < minimumSessions) continue;
    // A mean oriented delta of ±2 maps to roughly ±0.5 of scoring influence.
    bias[row.key as MechanismKey] = round(clamp(row.meanDelta / 4, -0.6, 0.6));
  }
  return bias;
}

export interface OutcomeSummary {
  sessions: number;
  meanDelta: number;
  meanHelpfulness: number;
  completionRate: number;
  feltSafeRate: number;
  wouldRepeatRate: number;
  audioProblemRate: number;
}

export function summariseOutcomes(outcomes: SessionOutcome[]): OutcomeSummary {
  if (outcomes.length === 0) {
    return {
      sessions: 0,
      meanDelta: 0,
      meanHelpfulness: 0,
      completionRate: 0,
      feltSafeRate: 0,
      wouldRepeatRate: 0,
      audioProblemRate: 0,
    };
  }
  return {
    sessions: outcomes.length,
    meanDelta: mean(outcomes.map((o) => profileDelta(o.pre, o.post))),
    meanHelpfulness: mean(outcomes.map((o) => o.helpfulness)),
    completionRate: round(outcomes.filter((o) => o.completed).length / outcomes.length),
    feltSafeRate: round(outcomes.filter((o) => o.feltSafe).length / outcomes.length),
    wouldRepeatRate: round(outcomes.filter((o) => o.wouldRepeat).length / outcomes.length),
    audioProblemRate: round(
      outcomes.filter((o) => o.audioProblems.length > 0).length / outcomes.length,
    ),
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((a, b) => a + b, 0) / values.length);
}
function round(value: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
