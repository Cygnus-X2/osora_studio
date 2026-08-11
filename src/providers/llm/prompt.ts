import { BOUNDARY_BY_KEY, isBoundaryKey } from "@/domain/constraints/catalog";
import { CLAIM_PATTERNS } from "@/domain/safety/claims";
import type { CompositionRequest, HardConstraintBlock } from "./types";
import type { UserConstraint } from "@/domain/types";

export const PROMPT_VERSION = "osora-compose-v3";

/**
 * Builds the non-negotiable constraint block.
 *
 * Note what this does *not* do: it does not ask the model to respect the
 * user's boundaries as a preference. Blocked material was already removed from
 * the plan at gating, so the block below is a belt-and-braces restatement, not
 * the enforcement mechanism. Enforcement is structural.
 */
export function buildHardConstraints(constraints: UserConstraint[]): HardConstraintBlock {
  const blockedTags = new Set<string>();
  const notes: string[] = [];

  for (const constraint of constraints) {
    if (constraint.type !== "hard") continue;
    if (!isBoundaryKey(constraint.key)) continue;
    const definition = BOUNDARY_BY_KEY[constraint.key];
    definition.blocksTags.forEach((t) => blockedTags.add(t));
    notes.push(
      `${definition.label}: ${definition.description}${constraint.value ? ` (${constraint.value})` : ""}`,
    );
  }

  return {
    blockedTags: [...blockedTags],
    prohibitedLanguage: CLAIM_PATTERNS.filter((p) => p.severity === "blocking").map((p) => p.label),
    lockedSections: ["opening", "closing"],
    notes,
  };
}

const SYSTEM_PROMPT = `You are the writing surface of Osora, a wellness audio studio.

You are NOT the decision system. A deterministic engine has already chosen the
mechanisms, the interventions, the sequence and the exact number of seconds and
words each section gets. Your only job is to write the words that fit inside
that plan.

Absolute rules:
1. Never add, remove, merge or reorder sections. Write only the section ids given.
2. Never exceed a section's word budget. Under-running is acceptable; over-running is not.
3. Never write medical, diagnostic, curative, preventive or "proven" language.
   Osora is wellness and educational content. It does not treat anything.
4. Never introduce a technique that is not in the plan you were given.
5. Never name a tradition, school, teacher or method. The listener hears one
   consistent Osora voice, not a tour of therapeutic schools.
6. Respect every item in the HARD CONSTRAINTS block without exception. These are
   not preferences and there is no situation in which they may be traded away.
7. Keep sentences short. Use plain words. Leave silence alone — pause markers are
   placed by the planner, not by you.

Your output is a draft. A human reviews everything before it reaches anyone.`;

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildUserPrompt(request: CompositionRequest): string {
  const { plan, timeline, dna, hardConstraints, professionalPerspective } = request;

  const sectionLines = timeline.sections
    .map(
      (s) =>
        `- id=${s.id} | kind=${s.kind} | title="${s.title}" | mechanism=${s.mechanism ?? "—"} | ` +
        `intervention=${s.interventionKey ?? "—"} | wordBudget=${s.wordBudget} | ` +
        `speech=${s.estimatedSpeechSeconds}s | pause=${s.pauseSeconds}s`,
    )
    .join("\n");

  return [
    `TARGET: ${plan.target}`,
    `DURATION: ${plan.durationSeconds}s`,
    `SILENCE RATIO: ${plan.silenceRatio}`,
    `FAMILIARITY / EXPLORATION: ${plan.familiarityRatio} / ${plan.explorationRatio}`,
    "",
    "OSORA DNA (stable — do not vary):",
    `- Opening style: ${dna.stable.openingStyle}`,
    `- Closing style: ${dna.stable.closingStyle}`,
    `- Language tone: ${dna.stable.languageTone}`,
    `- Emotional attitude: ${dna.stable.emotionalAttitude}`,
    `- Directiveness: ${dna.stable.directiveness}`,
    `- Safety framing: ${dna.stable.safetyFraming}`,
    "",
    "HARD CONSTRAINTS — NON-NEGOTIABLE:",
    hardConstraints.notes.length
      ? hardConstraints.notes.map((n) => `- ${n}`).join("\n")
      : "- (none set for this profile)",
    `- Blocked content tags: ${hardConstraints.blockedTags.join(", ") || "none"}`,
    `- Prohibited language: ${hardConstraints.prohibitedLanguage.join(", ")}`,
    `- Locked sections (structure fixed): ${hardConstraints.lockedSections.join(", ")}`,
    "",
    professionalPerspective
      ? `EDITORIAL PERSPECTIVE: write as if reviewed by a ${professionalPerspective.replace(/_/g, " ")} specialist. This is an editorial lens only and does not constitute professional approval.`
      : "",
    "",
    "SECTIONS TO WRITE:",
    sectionLines,
    "",
    'Return JSON: {"sections":[{"sectionId":"…","text":"…"}]} and nothing else.',
  ]
    .filter(Boolean)
    .join("\n");
}
