"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { countWords, recomputeBounds } from "@/domain/timeline/planner";
import { buildHardConstraints, getLlmProvider, type LlmProviderId } from "@/providers/llm";
import { OSORA_DNA } from "@/data/seed/dna";
import { findExperience } from "@/data/source";
import { createExperience, saveTimeline, updateStatus } from "@/lib/db/experiences";
import { isDatabaseConfigured } from "@/lib/db/client";
import type {
  BoundaryKey,
  DesiredDirection,
  DimensionKey,
  FamiliarityGroup,
  PreferenceKey,
  SessionEnvironment,
  SessionIntent,
  StateProfile,
  UserConstraint,
} from "@/domain/types";

/**
 * Composer server actions.
 *
 * These are the only places the studio writes. Each one is a step in the same
 * ordered pipeline the architecture describes — create runs the engine, script
 * fills budgets the engine set, submit moves a status. None of them may skip a
 * stage, because each reads what the previous one wrote.
 */

const DIMENSIONS: DimensionKey[] = [
  "stress", "calmness", "energy", "tiredness", "mental_activity", "rumination",
  "focus", "emotional_intensity", "physical_tension", "discomfort", "safety",
  "connectedness", "openness", "motivation", "restlessness", "overwhelm",
];

const createSchema = z.object({
  title: z.string().min(1, "Give the session a title.").max(120),
  directions: z.array(z.string()).min(1, "Choose at least one direction."),
  intent: z.string().min(1),
  environment: z.string().min(1),
  minutes: z.coerce.number().min(2).max(45),
  context: z.string().max(500).optional(),
  boundaries: z.array(z.string()).default([]),
  preferences: z.array(z.string()).default([]),
  familiarGroups: z.array(z.string()).default([]),
});

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function createSessionAction(formData: FormData): Promise<ActionResult> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: "No database is configured, so a new session cannot be saved. Set DATABASE_URL.",
    };
  }

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    directions: formData.getAll("directions"),
    intent: formData.get("intent"),
    environment: formData.get("environment"),
    minutes: formData.get("minutes"),
    context: formData.get("context") || undefined,
    boundaries: formData.getAll("boundaries"),
    preferences: formData.getAll("preferences"),
    familiarGroups: formData.getAll("familiarGroups"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const input = parsed.data;

  const currentState: StateProfile = {};
  for (const dimension of DIMENSIONS) {
    const raw = formData.get(`state.${dimension}`);
    if (typeof raw === "string" && raw !== "") {
      const value = Number(raw);
      if (Number.isFinite(value)) currentState[dimension] = Math.max(0, Math.min(10, value));
    }
  }

  const now = new Date().toISOString();
  const constraints: UserConstraint[] = [
    ...input.boundaries.map<UserConstraint>((key, index) => ({
      id: `hard-${index}`,
      userId: "studio",
      type: "hard",
      key: key as BoundaryKey,
      value: null,
      reason: "Set at intake.",
      scope: "always",
      createdAt: now,
      updatedAt: now,
    })),
    ...input.preferences.map<UserConstraint>((key, index) => ({
      id: `soft-${index}`,
      userId: "studio",
      type: "soft",
      key: key as PreferenceKey,
      value: 1,
      reason: "Set at intake.",
      scope: "always",
      createdAt: now,
      updatedAt: now,
    })),
  ];

  let experience;
  try {
    experience = await createExperience({
      title: input.title,
      currentState,
      desired: {
        directions: input.directions as DesiredDirection[],
        intent: input.intent as SessionIntent,
        environment: input.environment as SessionEnvironment,
        availableSeconds: Math.round(input.minutes * 60),
        context: input.context ?? null,
      },
      constraints,
      familiarGroups: (input.familiarGroups.length > 0
        ? input.familiarGroups
        : ["grounding_core"]) as FamiliarityGroup[],
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create the session.",
    };
  }

  revalidatePath("/experiences");
  revalidatePath("/composer");
  revalidatePath("/dashboard");
  redirect(`/composer/${experience.id}`);
}

/**
 * Fills every section's text via the configured provider.
 *
 * The plan is already frozen at this point: the model receives the timeline it
 * must write into and the hard-constraint block, and anything it returns for
 * an unknown section is discarded before it can be stored.
 */
export async function generateScriptAction(idOrSlug: string): Promise<ActionResult> {
  const experience = await findExperience(idOrSlug);
  if (!experience?.plan || !experience.timeline) {
    return { ok: false, error: "This session has no plan to write into yet." };
  }
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "No database is configured, so the script cannot be saved." };
  }

  try {
    const provider = getLlmProvider(experience.settings.llmProvider as LlmProviderId);
    const response = await provider.generateScript({
      plan: experience.plan,
      timeline: experience.timeline,
      dna: OSORA_DNA,
      constraints: experience.constraints,
      hardConstraints: buildHardConstraints(experience.constraints),
      professionalPerspective: experience.settings.professionalPerspective,
      temperature: experience.settings.temperature,
      promptVersion: experience.settings.promptTemplate,
    });

    const byId = new Map(response.data.sections.map((s) => [s.sectionId, s.text]));
    const sections = experience.timeline.sections.map((section) => {
      const text = byId.get(section.id);
      if (text === undefined) return section;
      // Word counts are recomputed from the text rather than trusted from the
      // model, and the estimate is left for narration to correct later.
      return { ...section, text, wordCount: countWords(text) };
    });

    await saveTimeline(
      idOrSlug,
      recomputeBounds({ ...experience.timeline, sections }),
      "Script generated",
      `${response.model} wrote ${sections.filter((s) => s.wordCount > 0).length} sections. Draft until reviewed.`,
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Script generation failed.",
    };
  }

  revalidatePath(`/composer/${idOrSlug}`);
  return { ok: true };
}

export async function submitForReviewAction(idOrSlug: string): Promise<ActionResult> {
  const experience = await findExperience(idOrSlug);
  if (!experience) return { ok: false, error: "Session not found." };

  // Which review it goes to is derived from what the plan requires, not chosen.
  const next = experience.requiredReviewSkills.includes("trauma_informed_practice")
    ? "safety_review"
    : experience.requiredReviewSkills.includes("scientific_research")
      ? "scientific_review"
      : "internal_review";

  await updateStatus(idOrSlug, next);
  revalidatePath(`/composer/${idOrSlug}`);
  revalidatePath("/reviews");
  return { ok: true };
}
