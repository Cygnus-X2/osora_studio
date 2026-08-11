import { MECHANISMS, MECHANISM_BY_KEY } from "@/domain/mechanisms/library";
import {
  INTERVENTIONS,
  INTERVENTION_BY_KEY,
  SAFE_CORE_INTERVENTION_KEYS,
} from "@/domain/interventions/library";
import { DIRECTION_BY_KEY, readDimension } from "@/domain/state/dimensions";
import { resolveConstraints, type ResolvedConstraints } from "@/domain/constraints/catalog";
import {
  EVIDENCE_WEIGHT,
  type DimensionCondition,
  type EngineInput,
  type Intervention,
  type Mechanism,
  type MechanismKey,
  type MechanismRecommendation,
  type PlannedBlock,
  type ProfessionalSkillKey,
  type RankedIntervention,
  type SectionKind,
  type SessionPlan,
  type StateProfile,
  type TraceEntry,
} from "@/domain/types";

/**
 * The Osora State Engine.
 *
 * Deterministic by construction: no ML, no sampling, no LLM. The same input
 * always produces the same plan, and every include/exclude decision leaves a
 * trace entry so a reviewer can see exactly why a block is or is not there.
 *
 * Stage order matters. Gating runs first and only ever *removes* candidates,
 * so no score, preference or model output can reintroduce something a hard
 * boundary or contraindication excluded.
 */

/** How much a user's measured outcome history may move a mechanism's score. */
const OUTCOME_BIAS_CAP = 0.6;
/** How much a soft preference may move a mechanism's score. */
const PREFERENCE_BIAS_CAP = 0.8;
const MAX_MECHANISMS = 6;
const MIN_MECHANISMS = 3;

export function evaluateCondition(profile: StateProfile, condition: DimensionCondition): boolean {
  const value = readDimension(profile, condition.dimension);
  switch (condition.operator) {
    case "gte":
      return value >= condition.value;
    case "lte":
      return value <= condition.value;
    case "gt":
      return value > condition.value;
    case "lt":
      return value < condition.value;
  }
}

function describeCondition(condition: DimensionCondition): string {
  const op = { gte: "≥", lte: "≤", gt: ">", lt: "<" }[condition.operator];
  return `${condition.dimension} ${op} ${condition.value}`;
}

/* ------------------------------------------------------------------ */
/* Stage 1 — gating                                                     */
/* ------------------------------------------------------------------ */

interface GateResult {
  eligibleMechanisms: Mechanism[];
  eligibleInterventions: Intervention[];
  excludedInterventions: Map<string, string>;
  requiredSkills: Set<ProfessionalSkillKey>;
  trace: TraceEntry[];
  fellBackToSafeCore: boolean;
}

function gate(input: EngineInput, resolved: ResolvedConstraints): GateResult {
  const trace: TraceEntry[] = [];
  const requiredSkills = new Set<ProfessionalSkillKey>();
  const excludedInterventions = new Map<string, string>();
  const state = input.currentState;

  const blockedMechanisms = new Set<MechanismKey>(resolved.blockedMechanisms);
  for (const key of resolved.blockedMechanisms) {
    trace.push({
      stage: "gate",
      subject: MECHANISM_BY_KEY[key]?.name ?? key,
      decision: "excluded",
      reason: "Removed by a hard user boundary. Not overridable.",
      constraintKey: "hard_boundary",
    });
  }

  const eligibleMechanisms = MECHANISMS.filter((mechanism) => {
    if (blockedMechanisms.has(mechanism.key)) return false;

    if (mechanism.reviewStatus !== "approved") {
      trace.push({
        stage: "gate",
        subject: mechanism.name,
        decision: "excluded",
        reason: `Review status is "${mechanism.reviewStatus}" — only approved mechanisms may be composed.`,
      });
      return false;
    }

    for (const contraindication of mechanism.contraindications) {
      if (contraindication.condition && evaluateCondition(state, contraindication.condition)) {
        blockedMechanisms.add(mechanism.key);
        trace.push({
          stage: "gate",
          subject: mechanism.name,
          decision: "excluded",
          reason: `Contraindicated: ${contraindication.summary} (${describeCondition(contraindication.condition)}).`,
          constraintKey: contraindication.id,
        });
        if (contraindication.requiresSkill) requiredSkills.add(contraindication.requiresSkill);
        return false;
      }
    }
    return true;
  });

  const eligibleInterventions = INTERVENTIONS.filter((intervention) => {
    const exclude = (reason: string, constraintKey?: string) => {
      excludedInterventions.set(intervention.key, reason);
      trace.push({
        stage: "gate",
        subject: intervention.name,
        decision: "excluded",
        reason,
        constraintKey,
      });
      return false;
    };

    if (intervention.reviewStatus !== "approved") {
      return exclude(`Review status is "${intervention.reviewStatus}".`);
    }

    // Hard boundaries first — structural removal, before anything is scored.
    const blockedTag = intervention.boundaryTags.find((tag) => resolved.blockedTags.has(tag));
    if (blockedTag) {
      return exclude(
        `Carries the "${blockedTag}" tag, which a hard user boundary blocks. Not overridable.`,
        "hard_boundary",
      );
    }

    // A hard boundary removes the mechanism at any weight — that is the user's
    // decision and it is absolute. A *contraindication* only removes blocks
    // where the excluded mechanism is a primary driver (weight ≥ 0.7); a block
    // that merely touches it is still governed by its own contraindications,
    // which a qualified reviewer authored for exactly this case.
    const boundaryBlocked = intervention.mechanisms.find(
      (m) => resolved.blockedMechanisms.has(m.mechanism),
    );
    if (boundaryBlocked) {
      return exclude(
        `Depends on "${MECHANISM_BY_KEY[boundaryBlocked.mechanism]?.name}", which a hard user boundary removes.`,
        "hard_boundary",
      );
    }

    const primaryBlocked = intervention.mechanisms.find(
      (m) => blockedMechanisms.has(m.mechanism) && m.weight >= 0.7,
    );
    if (primaryBlocked) {
      return exclude(
        `Primarily driven by the contraindicated mechanism "${MECHANISM_BY_KEY[primaryBlocked.mechanism]?.name}".`,
      );
    }

    for (const condition of intervention.excludedStates) {
      if (evaluateCondition(state, condition)) {
        return exclude(`Excluded at the reported state (${describeCondition(condition)}).`);
      }
    }

    for (const contraindication of intervention.contraindications) {
      if (contraindication.condition && evaluateCondition(state, contraindication.condition)) {
        if (contraindication.requiresSkill) requiredSkills.add(contraindication.requiresSkill);
        return exclude(
          `Contraindicated: ${contraindication.summary} (${describeCondition(contraindication.condition)}).`,
          contraindication.id,
        );
      }
      if (contraindication.requiresSkill) requiredSkills.add(contraindication.requiresSkill);
    }

    return true;
  });

  // If gating emptied the field, fall back to the safe core rather than
  // relaxing a constraint. Constraints are never traded away.
  let fellBackToSafeCore = false;
  if (eligibleInterventions.length < 3) {
    fellBackToSafeCore = true;
    for (const key of SAFE_CORE_INTERVENTION_KEYS) {
      const intervention = INTERVENTION_BY_KEY[key];
      if (!intervention) continue;
      const tagBlocked = intervention.boundaryTags.some((t) => resolved.blockedTags.has(t));
      if (tagBlocked) continue;
      if (eligibleInterventions.some((i) => i.key === key)) continue;
      eligibleInterventions.push(intervention);
      excludedInterventions.delete(key);
      trace.push({
        stage: "gate",
        subject: intervention.name,
        decision: "included",
        reason: "Gating left too few candidates; restored from the always-safe core set.",
      });
    }
  }

  return {
    eligibleMechanisms,
    eligibleInterventions,
    excludedInterventions,
    requiredSkills,
    trace,
    fellBackToSafeCore,
  };
}

/* ------------------------------------------------------------------ */
/* Stage 2 — scoring                                                    */
/* ------------------------------------------------------------------ */

interface ScoredMechanism {
  mechanism: Mechanism;
  score: number;
  factors: Array<{ factor: string; value: number }>;
}

function scoreMechanisms(
  input: EngineInput,
  resolved: ResolvedConstraints,
  eligible: Mechanism[],
): { scored: ScoredMechanism[]; trace: TraceEntry[] } {
  const trace: TraceEntry[] = [];
  const state = input.currentState;

  const scored = eligible.map((mechanism) => {
    const factors: Array<{ factor: string; value: number }> = [];

    // Directional fit — does this mechanism serve what the person asked for?
    let directional = 0;
    for (const direction of input.desired.directions) {
      directional += mechanism.servesDirections[direction] ?? 0;
    }
    directional = input.desired.directions.length
      ? directional / input.desired.directions.length
      : 0;
    factors.push({ factor: "Directional fit", value: round(directional * 2) });

    // State suitability — expert-authored conditions that currently hold.
    const suitableHits = mechanism.suitableStates.filter((c) => evaluateCondition(state, c)).length;
    const suitability = mechanism.suitableStates.length
      ? suitableHits / mechanism.suitableStates.length
      : 0.35;
    factors.push({ factor: "State suitability", value: round(suitability) });

    // Unsuitability — a penalty, never a block.
    const unsuitableHits = mechanism.unsuitableStates.filter((c) =>
      evaluateCondition(state, c),
    ).length;
    const unsuitabilityPenalty = unsuitableHits * 0.5;
    if (unsuitabilityPenalty > 0) {
      factors.push({ factor: "Poor state fit", value: -round(unsuitabilityPenalty) });
    }

    // Evidence weight.
    const evidence = EVIDENCE_WEIGHT[mechanism.evidenceLevel] * 0.6;
    factors.push({ factor: "Evidence weight", value: round(evidence) });

    // Soft user preferences, capped.
    const preference = clamp(
      resolved.mechanismBias[mechanism.key] ?? 0,
      -PREFERENCE_BIAS_CAP,
      PREFERENCE_BIAS_CAP,
    );
    if (preference !== 0) factors.push({ factor: "User preference", value: round(preference) });

    // Recorded outcomes for this person, capped so history cannot dominate.
    const outcome = clamp(input.outcomeBias[mechanism.key] ?? 0, -OUTCOME_BIAS_CAP, OUTCOME_BIAS_CAP);
    if (outcome !== 0) factors.push({ factor: "Past outcomes", value: round(outcome) });

    const score = factors.reduce((sum, f) => sum + f.value, 0);
    trace.push({
      stage: "score",
      subject: mechanism.name,
      decision: score > 0 ? "boosted" : "penalised",
      reason: factors.map((f) => `${f.factor} ${f.value >= 0 ? "+" : ""}${f.value}`).join(", "),
      delta: round(score),
    });

    return { mechanism, score, factors };
  });

  return { scored: scored.sort((a, b) => b.score - a.score), trace };
}

/* ------------------------------------------------------------------ */
/* Stage 3 — selection                                                  */
/* ------------------------------------------------------------------ */

function selectMechanisms(scored: ScoredMechanism[], durationSeconds: number) {
  const trace: TraceEntry[] = [];
  const selected: ScoredMechanism[] = [];

  // Longer sessions can carry more distinct mechanisms without feeling busy.
  const capacity = clamp(Math.round(durationSeconds / 150), MIN_MECHANISMS, MAX_MECHANISMS);

  for (const candidate of scored) {
    if (selected.length >= capacity) break;
    if (candidate.score <= 0) continue;

    const conflict = selected.find(
      (s) =>
        s.mechanism.incompatibleWith.includes(candidate.mechanism.key) ||
        candidate.mechanism.incompatibleWith.includes(s.mechanism.key),
    );
    if (conflict) {
      trace.push({
        stage: "select",
        subject: candidate.mechanism.name,
        decision: "excluded",
        reason: `Incompatible with the higher-scoring "${conflict.mechanism.name}" (${round(conflict.score)} vs ${round(candidate.score)}).`,
      });
      continue;
    }

    selected.push(candidate);
    trace.push({
      stage: "select",
      subject: candidate.mechanism.name,
      decision: "included",
      reason: `Ranked ${selected.length} of ${capacity} with score ${round(candidate.score)}.`,
      delta: round(candidate.score),
    });
  }

  return { selected, trace };
}

/* ------------------------------------------------------------------ */
/* Stage 4 — duration allocation                                        */
/* ------------------------------------------------------------------ */

function allocate(selected: ScoredMechanism[], durationSeconds: number) {
  const trace: TraceEntry[] = [];
  const totalScore = selected.reduce((sum, s) => sum + s.score, 0) || 1;

  // Proportional first pass, then clamp to each mechanism's exposure window.
  const draft = selected.map((s) => ({
    scored: s,
    seconds: (s.score / totalScore) * durationSeconds,
  }));

  let residual = 0;
  const clamped = draft.map((entry) => {
    const { minExposureSeconds, maxExposureSeconds, name } = entry.scored.mechanism;
    const bounded = clamp(entry.seconds, minExposureSeconds, maxExposureSeconds);
    if (Math.abs(bounded - entry.seconds) > 1) {
      residual += entry.seconds - bounded;
      trace.push({
        stage: "allocate",
        subject: name,
        decision: "adjusted",
        reason: `Clamped from ${Math.round(entry.seconds)}s to ${Math.round(bounded)}s by its exposure window (${minExposureSeconds}–${maxExposureSeconds}s).`,
        delta: Math.round(bounded - entry.seconds),
      });
    }
    return { ...entry, seconds: bounded };
  });

  // Redistribute whatever the clamps freed up, to mechanisms with headroom.
  if (Math.abs(residual) > 1) {
    const expandable = clamped.filter((e) =>
      residual > 0
        ? e.seconds < e.scored.mechanism.maxExposureSeconds
        : e.seconds > e.scored.mechanism.minExposureSeconds,
    );
    const headroom = expandable.reduce(
      (sum, e) =>
        sum +
        (residual > 0
          ? e.scored.mechanism.maxExposureSeconds - e.seconds
          : e.seconds - e.scored.mechanism.minExposureSeconds),
      0,
    );
    if (headroom > 0) {
      for (const entry of expandable) {
        const available =
          residual > 0
            ? entry.scored.mechanism.maxExposureSeconds - entry.seconds
            : entry.seconds - entry.scored.mechanism.minExposureSeconds;
        entry.seconds += residual * (available / headroom);
      }
      trace.push({
        stage: "allocate",
        subject: "Session",
        decision: "adjusted",
        reason: `Redistributed ${Math.round(Math.abs(residual))}s of clamped time across mechanisms with headroom.`,
      });
    }
  }

  const allocatedTotal = clamped.reduce((sum, e) => sum + e.seconds, 0) || 1;
  const scale = durationSeconds / allocatedTotal;

  const recommendations: MechanismRecommendation[] = clamped.map((entry) => {
    const seconds = Math.round(entry.seconds * scale);
    return {
      mechanism: entry.scored.mechanism.key,
      score: round(entry.scored.score),
      share: round(seconds / durationSeconds, 3),
      seconds,
      rationale: entry.scored.factors
        .filter((f) => f.value !== 0)
        .map((f) => `${f.factor} ${f.value >= 0 ? "+" : ""}${f.value}`)
        .join(" · "),
      evidenceLevel: entry.scored.mechanism.evidenceLevel,
    };
  });

  return { recommendations, trace };
}

/* ------------------------------------------------------------------ */
/* Stage 5 — intervention ranking and sequencing                        */
/* ------------------------------------------------------------------ */

function rankInterventions(
  input: EngineInput,
  resolved: ResolvedConstraints,
  gateResult: GateResult,
  recommendations: MechanismRecommendation[],
): RankedIntervention[] {
  const shareByMechanism = new Map(recommendations.map((r) => [r.mechanism, r.share]));
  const state = input.currentState;

  const eligible = gateResult.eligibleInterventions.map<RankedIntervention>((intervention) => {
    const breakdown: Array<{ factor: string; value: number }> = [];

    // How much of this block's effect lands on mechanisms we actually want.
    const coverage = intervention.mechanisms.reduce(
      (sum, m) => sum + (shareByMechanism.get(m.mechanism) ?? 0) * m.weight,
      0,
    );
    breakdown.push({ factor: "Mechanism coverage", value: round(coverage * 4) });

    const suitableHits = intervention.suitableStates.filter((c) =>
      evaluateCondition(state, c),
    ).length;
    const suitability = intervention.suitableStates.length
      ? suitableHits / intervention.suitableStates.length
      : 0.35;
    breakdown.push({ factor: "State fit", value: round(suitability) });

    breakdown.push({
      factor: "Evidence",
      value: round(EVIDENCE_WEIGHT[intervention.evidenceLevel] * 0.5),
    });

    const familiar = input.familiarGroups.includes(intervention.familiarityGroup);
    breakdown.push({ factor: familiar ? "Familiar" : "Unfamiliar", value: familiar ? 0.4 : -0.2 });

    // Recency penalty — decays over the last five sessions.
    const recencyIndex = input.recentInterventionKeys.indexOf(intervention.key);
    if (recencyIndex >= 0 && recencyIndex < 5) {
      breakdown.push({ factor: "Recently used", value: -round(0.5 - recencyIndex * 0.1) });
    }

    const preferenceBias = intervention.mechanisms.reduce(
      (sum, m) => sum + (resolved.mechanismBias[m.mechanism] ?? 0) * m.weight,
      0,
    );
    if (preferenceBias !== 0) {
      breakdown.push({
        factor: "User preference",
        value: round(clamp(preferenceBias, -PREFERENCE_BIAS_CAP, PREFERENCE_BIAS_CAP)),
      });
    }

    return {
      interventionKey: intervention.key,
      name: intervention.name,
      score: round(breakdown.reduce((sum, f) => sum + f.value, 0)),
      familiar,
      breakdown,
      eligible: true,
      exclusionReason: null,
    };
  });

  const excluded = [...gateResult.excludedInterventions.entries()].map<RankedIntervention>(
    ([key, reason]) => ({
      interventionKey: key,
      name: INTERVENTION_BY_KEY[key]?.name ?? key,
      score: 0,
      familiar: false,
      breakdown: [],
      eligible: false,
      exclusionReason: reason,
    }),
  );

  return [...eligible.sort((a, b) => b.score - a.score), ...excluded];
}

/** Which section a mechanism naturally occupies in the Osora session grammar. */
const MECHANISM_SECTION: Partial<Record<MechanismKey, SectionKind>> = {
  predictability: "orientation",
  perceived_safety: "opening",
  sensory_grounding: "orientation",
  exteroceptive_orientation: "orientation",
  extended_exhalation: "breath",
  breath_awareness: "breath",
  rhythmic_entrainment: "breath",
  body_awareness: "body",
  muscle_relaxation: "body",
  interoceptive_awareness: "body",
  attention_stabilisation: "main",
  attentional_widening: "main",
  cognitive_distancing: "main",
  acceptance: "main",
  emotional_labelling: "main",
  self_compassion: "main",
  imagery: "main",
  repetition: "main",
  silence: "silence",
  progressive_guidance_reduction: "closing",
};

const SECTION_ORDER: SectionKind[] = [
  "opening",
  "orientation",
  "breath",
  "body",
  "main",
  "silence",
  "reflection",
  "closing",
];

function buildSequence(
  input: EngineInput,
  resolved: ResolvedConstraints,
  recommendations: MechanismRecommendation[],
  ranked: RankedIntervention[],
): { sequence: PlannedBlock[]; trace: TraceEntry[]; warnings: string[] } {
  const trace: TraceEntry[] = [];
  const warnings: string[] = [];
  const used = new Set<string>();
  let unfamiliarMajorCount = 0;
  const maxUnfamiliarMajor = input.dna.rules.maxUnfamiliarMajorInterventions;

  const blocks: PlannedBlock[] = [];

  for (const recommendation of recommendations) {
    const sectionKind = MECHANISM_SECTION[recommendation.mechanism] ?? "main";

    // Blocks that engage this mechanism, ordered so that a block for which
    // this mechanism is *primary* wins over one that only touches it. Without
    // this, a high-scoring block gets consumed by a mechanism it barely serves
    // and the mechanism it was written for is left with nothing.
    const candidates = ranked
      .filter((r) => r.eligible && !used.has(r.interventionKey))
      .map((r) => ({
        ranked: r,
        weight:
          INTERVENTION_BY_KEY[r.interventionKey]?.mechanisms.find(
            (m) => m.mechanism === recommendation.mechanism,
          )?.weight ?? 0,
      }))
      .filter((entry) => entry.weight > 0)
      .sort((a, b) => b.weight * (1 + b.ranked.score) - a.weight * (1 + a.ranked.score))
      .map((entry) => entry.ranked);

    let chosen: RankedIntervention | undefined;
    for (const candidate of candidates) {
      const intervention = INTERVENTION_BY_KEY[candidate.interventionKey];
      const isUnfamiliarMajor = intervention.major && !candidate.familiar;
      if (isUnfamiliarMajor && unfamiliarMajorCount >= maxUnfamiliarMajor) {
        trace.push({
          stage: "sequence",
          subject: intervention.name,
          decision: "excluded",
          reason: `Osora DNA allows at most ${maxUnfamiliarMajor} unfamiliar major intervention per session; that slot is taken.`,
          constraintKey: "dna.maxUnfamiliarMajorInterventions",
        });
        continue;
      }
      chosen = candidate;
      if (isUnfamiliarMajor) unfamiliarMajorCount += 1;
      break;
    }

    if (!chosen) {
      warnings.push(
        `No eligible intervention remained for "${MECHANISM_BY_KEY[recommendation.mechanism].name}". The mechanism is carried by the section framing only.`,
      );
      blocks.push({
        order: 0,
        sectionKind,
        mechanism: recommendation.mechanism,
        interventionKey: null,
        interventionName: null,
        seconds: recommendation.seconds,
        familiar: true,
        rationale: "Mechanism retained without a dedicated block — no eligible intervention.",
      });
      continue;
    }

    used.add(chosen.interventionKey);
    const intervention = INTERVENTION_BY_KEY[chosen.interventionKey];
    const seconds = clamp(
      recommendation.seconds,
      intervention.minDurationSeconds,
      intervention.maxDurationSeconds,
    );

    blocks.push({
      order: 0,
      sectionKind,
      mechanism: recommendation.mechanism,
      interventionKey: intervention.key,
      interventionName: intervention.name,
      seconds,
      familiar: chosen.familiar,
      rationale: `${MECHANISM_BY_KEY[recommendation.mechanism].name} at ${Math.round(recommendation.share * 100)}% of the session; "${intervention.name}" ranked ${chosen.score}.`,
    });
  }

  // Locked sections are not personalisation surface. The opening and closing
  // carry the Osora identity, so they are inserted regardless of how the
  // mechanism scoring came out — and the adaptive blocks give up the time.
  const lockedAdditions: PlannedBlock[] = [];
  for (const locked of input.dna.rules.lockedSections) {
    if (blocks.some((b) => b.sectionKind === locked)) continue;
    const anchorKey = locked === "opening" ? "what-happens-next" : "stepping-back-close";
    const anchor = INTERVENTION_BY_KEY[anchorKey];
    if (!anchor) continue;
    if (anchor.boundaryTags.some((tag) => resolved.blockedTags.has(tag))) {
      warnings.push(
        `The locked ${locked} section could not be filled — its Osora anchor is blocked by a hard boundary.`,
      );
      continue;
    }

    lockedAdditions.push({
      order: 0,
      sectionKind: locked,
      mechanism: anchor.mechanisms[0].mechanism,
      interventionKey: anchor.key,
      interventionName: anchor.name,
      seconds: anchor.preferredDurationSeconds,
      familiar: true,
      rationale: `Locked Osora ${locked}. Present in every session regardless of the mechanism ranking.`,
    });
    trace.push({
      stage: "sequence",
      subject: anchor.name,
      decision: "included",
      reason: `Osora DNA locks the ${locked} section; the anchor is inserted independently of scoring.`,
      constraintKey: "dna.lockedSections",
    });
  }

  if (lockedAdditions.length > 0) {
    // Reclaim the locked time from the adaptive blocks, proportionally, so the
    // session still lands on its target duration.
    const lockedSeconds = lockedAdditions.reduce((sum, b) => sum + b.seconds, 0);
    const adaptiveSeconds = blocks.reduce((sum, b) => sum + b.seconds, 0);
    if (adaptiveSeconds > lockedSeconds) {
      const factor = (adaptiveSeconds - lockedSeconds) / adaptiveSeconds;
      for (const block of blocks) {
        const intervention = block.interventionKey
          ? INTERVENTION_BY_KEY[block.interventionKey]
          : undefined;
        const floor = intervention?.minDurationSeconds ?? 30;
        block.seconds = Math.max(floor, Math.round(block.seconds * factor));
      }
    }
    blocks.push(...lockedAdditions);
  }

  // Osora session grammar decides the order — never the ranking.
  blocks.sort((a, b) => SECTION_ORDER.indexOf(a.sectionKind) - SECTION_ORDER.indexOf(b.sectionKind));
  blocks.forEach((block, index) => {
    block.order = index + 1;
  });

  trace.push({
    stage: "sequence",
    subject: "Session grammar",
    decision: "adjusted",
    reason: `Ordered ${blocks.length} blocks into the fixed Osora grammar: ${SECTION_ORDER.join(" → ")}.`,
  });

  return { sequence: blocks, trace, warnings };
}

/* ------------------------------------------------------------------ */
/* Stage 6 — assembly                                                   */
/* ------------------------------------------------------------------ */

function describeTarget(input: EngineInput): string {
  const labels = input.desired.directions.map((d) => DIRECTION_BY_KEY[d].label.toLowerCase());
  if (labels.length === 0) return "support the reported state";
  if (labels.length === 1) return `move toward feeling ${labels[0]}`;
  return `move toward feeling ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function computeConfidence(
  recommendations: MechanismRecommendation[],
  input: EngineInput,
  fellBackToSafeCore: boolean,
): number {
  if (recommendations.length === 0) return 0;

  const evidence =
    recommendations.reduce((sum, r) => sum + EVIDENCE_WEIGHT[r.evidenceLevel] * r.share, 0) /
    (recommendations.reduce((sum, r) => sum + r.share, 0) || 1);

  const answered = Object.keys(input.currentState).length;
  const coverage = clamp(answered / 8, 0, 1);

  // A clear winner is more trustworthy than a field of near-ties.
  const scores = recommendations.map((r) => r.score);
  const margin =
    scores.length > 1 ? clamp((scores[0] - scores[scores.length - 1]) / (scores[0] || 1), 0, 1) : 0.5;

  const raw = evidence * 0.5 + coverage * 0.3 + margin * 0.2;
  return round(fellBackToSafeCore ? raw * 0.7 : raw, 2);
}

export function runStateEngine(input: EngineInput): SessionPlan {
  const resolved = resolveConstraints(input.constraints);
  const durationSeconds = input.desired.availableSeconds;

  const gateResult = gate(input, resolved);
  const { scored, trace: scoreTrace } = scoreMechanisms(input, resolved, gateResult.eligibleMechanisms);
  const { selected, trace: selectTrace } = selectMechanisms(scored, durationSeconds);
  const { recommendations, trace: allocateTrace } = allocate(selected, durationSeconds);
  const ranked = rankInterventions(input, resolved, gateResult, recommendations);
  const {
    sequence,
    trace: sequenceTrace,
    warnings,
  } = buildSequence(input, resolved, recommendations, ranked);

  // Silence ratio means one thing throughout the platform: the share of the
  // session in which nobody is speaking. That is dedicated silence blocks
  // *plus* the pauses inside every guided block — the flow validator measures
  // exactly the same quantity from the finished arrangement.
  const plannedSeconds = sequence.reduce((sum, b) => sum + b.seconds, 0) || 1;
  const quietSeconds = sequence.reduce((sum, block) => {
    if (block.mechanism === "silence" || block.sectionKind === "silence") return sum + block.seconds;
    const pauseRatio = block.interventionKey
      ? (INTERVENTION_BY_KEY[block.interventionKey]?.pausePattern.pauseRatio ?? 0.45)
      : 0.45;
    return sum + block.seconds * pauseRatio;
  }, 0);

  const silenceRatio = round(
    clamp(
      quietSeconds / plannedSeconds + resolved.silenceRatioDelta,
      input.dna.adaptive.silenceRatioRange[0],
      input.dna.adaptive.silenceRatioRange[1],
    ),
    2,
  );

  const familiarSeconds = sequence
    .filter((b) => b.familiar)
    .reduce((sum, b) => sum + b.seconds, 0);
  const totalSeconds = sequence.reduce((sum, b) => sum + b.seconds, 0) || 1;
  const familiarityRatio = round(familiarSeconds / totalSeconds, 2);

  const requiredReviews = new Set<ProfessionalSkillKey>(gateResult.requiredSkills);
  for (const block of sequence) {
    MECHANISM_BY_KEY[block.mechanism]?.requiredSkills.forEach((s) => requiredReviews.add(s));
    if (block.interventionKey) {
      INTERVENTION_BY_KEY[block.interventionKey]?.requiredSkills.forEach((s) =>
        requiredReviews.add(s),
      );
    }
  }

  const allWarnings = [...warnings];
  if (gateResult.fellBackToSafeCore) {
    allWarnings.push(
      "Gating left too few eligible interventions, so the always-safe core was used. Constraints were not relaxed.",
    );
  }
  if (familiarityRatio < input.dna.rules.defaultFamiliarityRatio - 0.15) {
    allWarnings.push(
      `Familiarity ratio ${(familiarityRatio * 100).toFixed(0)}% is below the Osora DNA target of ${(input.dna.rules.defaultFamiliarityRatio * 100).toFixed(0)}%.`,
    );
  }
  if (resolved.hard.length > 0) {
    allWarnings.push(
      `${resolved.hard.length} hard boundary/boundaries applied before scoring. Blocked material never reaches the composer or any model.`,
    );
  }

  const voice = pickVoice(input, resolved);
  const sound = pickSound(input, resolved, silenceRatio);

  return {
    target: describeTarget(input),
    durationSeconds,
    familiarityRatio,
    explorationRatio: round(1 - familiarityRatio, 2),
    composition: recommendations.map((r) => ({ mechanism: r.mechanism, share: r.share })),
    mechanisms: recommendations,
    rankedInterventions: ranked,
    sequence,
    voiceRecommendation: voice,
    soundRecommendation: sound,
    silenceRatio,
    requiredReviews: [...requiredReviews],
    confidence: computeConfidence(recommendations, input, gateResult.fellBackToSafeCore),
    warnings: allWarnings,
    trace: [
      ...gateResult.trace,
      ...scoreTrace,
      ...selectTrace,
      ...allocateTrace,
      ...sequenceTrace,
      {
        stage: "explain",
        subject: "Plan",
        decision: "included",
        reason: `${recommendations.length} mechanisms, ${sequence.length} blocks, ${Math.round(durationSeconds / 60)} minutes, ${(familiarityRatio * 100).toFixed(0)}% familiar.`,
      },
    ],
  };
}

function pickVoice(
  input: EngineInput,
  resolved: ResolvedConstraints,
): { voiceId: string; reason: string } | null {
  const available = input.production.availableVoiceIds.filter(
    (id) => !resolved.blockedVoiceIds.has(id),
  );
  if (available.length === 0) return null;

  // Voice identity is a stable DNA element: keep it unless it is blocked.
  const preferred = input.dna.stable.voiceIdentity;
  if (available.includes(preferred)) {
    return { voiceId: preferred, reason: "Stable Osora voice identity, not blocked for this user." };
  }
  return {
    voiceId: available[0],
    reason: "The stable voice identity is blocked by a user boundary; nearest approved voice used.",
  };
}

function pickSound(
  input: EngineInput,
  resolved: ResolvedConstraints,
  silenceRatio: number,
): { style: string; intensity: number; reason: string } | null {
  const available = input.production.availableSoundStyles.filter(
    (style) => !resolved.blockedSoundStyles.has(style),
  );
  if (available.length === 0) return null;

  const preferred = input.dna.adaptive.soundscapeOptions.find((s) => available.includes(s));
  const style = preferred ?? available[0];
  const tiredness = readDimension(input.currentState, "tiredness");
  const intensity = round(clamp(0.45 - silenceRatio * 0.4 - (tiredness - 5) * 0.02, 0.1, 0.6), 2);

  return {
    style,
    intensity,
    reason: `Sound bed kept low against a ${(silenceRatio * 100).toFixed(0)}% silence share so it never competes with narration.`,
  };
}

/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
