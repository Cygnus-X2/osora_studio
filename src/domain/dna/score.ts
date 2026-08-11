import { INTERVENTION_BY_KEY } from "@/domain/interventions/library";
import type { DnaScore, OsoraDnaProfile, SectionTimeline, SessionPlan } from "@/domain/types";

/**
 * Osora DNA scoring.
 *
 * Personalisation without a spine produces sessions that feel like different
 * products. The DNA score measures how much of the stable identity survived a
 * personalised composition, so drift is visible before publication rather
 * than after a user notices it.
 */
export function scoreDna(
  plan: SessionPlan,
  timeline: SectionTimeline | null,
  dna: OsoraDnaProfile,
): DnaScore {
  const components: DnaScore["components"] = [];
  const warnings: string[] = [];

  // 1. Familiarity ratio against the DNA target.
  const familiarityTarget = dna.rules.defaultFamiliarityRatio;
  const familiarityGap = Math.abs(plan.familiarityRatio - familiarityTarget);
  const familiarityScore = clamp01(1 - familiarityGap / 0.35);
  components.push({
    key: "familiarity",
    label: "Familiarity ratio",
    score: round(familiarityScore),
    weight: 0.25,
    detail: `${pct(plan.familiarityRatio)} familiar against a ${pct(familiarityTarget)} target.`,
  });
  if (familiarityGap > 0.15) {
    warnings.push(
      `Familiarity ratio is ${pct(plan.familiarityRatio)}, ${pct(familiarityGap)} away from the DNA target.`,
    );
  }

  // 2. Unfamiliar major interventions — the novelty budget.
  const unfamiliarMajors = plan.sequence.filter((block) => {
    if (!block.interventionKey) return false;
    return INTERVENTION_BY_KEY[block.interventionKey]?.major && !block.familiar;
  }).length;
  const noveltyScore = unfamiliarMajors <= dna.rules.maxUnfamiliarMajorInterventions ? 1 : 0.3;
  components.push({
    key: "novelty_budget",
    label: "Novelty budget",
    score: round(noveltyScore),
    weight: 0.2,
    detail: `${unfamiliarMajors} unfamiliar major intervention(s); limit is ${dna.rules.maxUnfamiliarMajorInterventions}.`,
  });
  if (noveltyScore < 1) {
    warnings.push(
      `${unfamiliarMajors} unfamiliar major interventions exceeds the DNA limit of ${dna.rules.maxUnfamiliarMajorInterventions}.`,
    );
  }

  // 3. Locked sections present — opening and closing carry the identity.
  const presentKinds = new Set(timeline?.sections.map((s) => s.kind) ?? plan.sequence.map((b) => b.sectionKind));
  const missingLocked = dna.rules.lockedSections.filter((kind) => !presentKinds.has(kind));
  const structureScore = clamp01(
    1 - missingLocked.length / Math.max(1, dna.rules.lockedSections.length),
  );
  components.push({
    key: "locked_sections",
    label: "Locked sections",
    score: round(structureScore),
    weight: 0.2,
    detail: missingLocked.length
      ? `Missing: ${missingLocked.join(", ")}.`
      : "All locked sections present.",
  });
  if (missingLocked.length) {
    warnings.push(`Locked Osora sections are missing: ${missingLocked.join(", ")}.`);
  }

  // 4. Silence ratio inside the adaptive band.
  const [silenceMin, silenceMax] = dna.adaptive.silenceRatioRange;
  const inBand = plan.silenceRatio >= silenceMin && plan.silenceRatio <= silenceMax;
  const silenceScore = inBand
    ? 1
    : clamp01(
        1 -
          Math.min(
            Math.abs(plan.silenceRatio - silenceMin),
            Math.abs(plan.silenceRatio - silenceMax),
          ) /
            0.2,
      );
  components.push({
    key: "silence_band",
    label: "Silence ratio",
    score: round(silenceScore),
    weight: 0.15,
    detail: `${pct(plan.silenceRatio)} against the ${pct(silenceMin)}–${pct(silenceMax)} band.`,
  });

  // 5. Recognisable structure — how much of the session is core material.
  const totalSeconds = plan.sequence.reduce((sum, b) => sum + b.seconds, 0) || 1;
  const coreSeconds = plan.sequence
    .filter((b) => {
      if (!b.interventionKey) return false;
      const group = INTERVENTION_BY_KEY[b.interventionKey]?.familiarityGroup ?? "";
      return group.endsWith("_core");
    })
    .reduce((sum, b) => sum + b.seconds, 0);
  const recognisable = coreSeconds / totalSeconds;
  const recognisableScore = clamp01(recognisable / dna.rules.minRecognisableStructureRatio);
  components.push({
    key: "recognisable_structure",
    label: "Recognisable structure",
    score: round(recognisableScore),
    weight: 0.2,
    detail: `${pct(recognisable)} of the session is core Osora material; minimum is ${pct(dna.rules.minRecognisableStructureRatio)}.`,
  });
  if (recognisable < dna.rules.minRecognisableStructureRatio) {
    warnings.push(
      `Only ${pct(recognisable)} of the session is recognisable core material — below the ${pct(dna.rules.minRecognisableStructureRatio)} floor.`,
    );
  }

  const total = components.reduce((sum, c) => sum + c.score * c.weight, 0);
  return { total: round(total), components, warnings };
}

/**
 * How exploration should move after a session, given how it was received.
 * Down fast, up slowly — a bad session costs more trust than a good one earns.
 */
export function nextExplorationRatio(
  current: number,
  dna: OsoraDnaProfile,
  outcome: "positive" | "neutral" | "negative",
): number {
  const max = 1 - dna.rules.defaultFamiliarityRatio + 0.15;
  if (outcome === "negative") {
    return round(Math.max(0, current - dna.rules.explorationDropAfterNegative), 2);
  }
  if (outcome === "positive") {
    return round(Math.min(max, current + dna.rules.explorationGrowthAfterPositive), 2);
  }
  return round(current, 2);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
function round(value: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}
