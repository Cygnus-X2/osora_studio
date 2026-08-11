import {
  BOUNDARY_BLOCKS,
  type BoundaryKey,
  type BoundaryTag,
  type MechanismKey,
  type PreferenceKey,
  type UserConstraint,
} from "@/domain/types";

export interface PreferenceDefinition {
  key: PreferenceKey;
  label: string;
  description: string;
  /** Scoring nudges applied to mechanisms, −1…+1. */
  mechanismBias: Partial<Record<MechanismKey, number>>;
  /** Direct nudge to the session silence ratio. */
  silenceRatioDelta?: number;
  /** Nudge to how directive the language is, −1 invitational … +1 direct. */
  directivenessDelta?: number;
}

export const PREFERENCES: PreferenceDefinition[] = [
  {
    key: "more_silence",
    label: "More silence",
    description: "Longer unguided stretches.",
    mechanismBias: { silence: 0.5, progressive_guidance_reduction: 0.3 },
    silenceRatioDelta: 0.08,
  },
  {
    key: "less_silence",
    label: "Less silence",
    description: "Keep the voice more present.",
    mechanismBias: { silence: -0.5, repetition: 0.2, predictability: 0.2 },
    silenceRatioDelta: -0.08,
  },
  {
    key: "more_body_awareness",
    label: "More body awareness",
    description: "More attention to physical sensation.",
    mechanismBias: { body_awareness: 0.5, muscle_relaxation: 0.3, interoceptive_awareness: 0.2 },
  },
  {
    key: "less_body_awareness",
    label: "Less body awareness",
    description: "Less attention to physical sensation.",
    mechanismBias: {
      body_awareness: -0.5,
      interoceptive_awareness: -0.5,
      muscle_relaxation: -0.3,
      exteroceptive_orientation: 0.2,
    },
  },
  {
    key: "more_structure",
    label: "More structure",
    description: "Clearer shape, more signposting.",
    mechanismBias: { predictability: 0.5, repetition: 0.3, attention_stabilisation: 0.2 },
    directivenessDelta: 0.3,
  },
  {
    key: "more_openness",
    label: "More openness",
    description: "Less instruction, more room.",
    mechanismBias: {
      attentional_widening: 0.4,
      acceptance: 0.3,
      progressive_guidance_reduction: 0.3,
      predictability: -0.2,
    },
    directivenessDelta: -0.3,
  },
  {
    key: "more_scientific_language",
    label: "More scientific language",
    description: "Plain, mechanism-oriented wording.",
    mechanismBias: { imagery: -0.3 },
    directivenessDelta: 0.2,
  },
  {
    key: "more_poetic_language",
    label: "More poetic language",
    description: "Warmer, more evocative wording.",
    mechanismBias: { imagery: 0.3 },
    directivenessDelta: -0.2,
  },
  {
    key: "spiritually_neutral",
    label: "Spiritually neutral",
    description: "No spiritual framing at all.",
    mechanismBias: {},
  },
  {
    key: "more_nature_imagery",
    label: "More nature imagery",
    description: "Prefer natural scenes when imagery is used.",
    mechanismBias: { imagery: 0.4 },
  },
  {
    key: "less_visualisation",
    label: "Less visualisation",
    description: "Prefer sensory contact over imagined scenes.",
    mechanismBias: { imagery: -0.5, sensory_grounding: 0.3 },
  },
  {
    key: "more_direct_guidance",
    label: "More direct guidance",
    description: "Tell me what to do.",
    mechanismBias: { predictability: 0.3 },
    directivenessDelta: 0.4,
  },
  {
    key: "more_invitational_guidance",
    label: "More invitational guidance",
    description: "Offer rather than instruct.",
    mechanismBias: { acceptance: 0.2 },
    directivenessDelta: -0.4,
  },
];

export const PREFERENCE_BY_KEY: Record<PreferenceKey, PreferenceDefinition> =
  Object.fromEntries(PREFERENCES.map((p) => [p.key, p])) as Record<
    PreferenceKey,
    PreferenceDefinition
  >;

export interface BoundaryDefinition {
  key: BoundaryKey;
  label: string;
  description: string;
  blocksTags: BoundaryTag[];
  /** Mechanisms removed outright, beyond tag matching. */
  blocksMechanisms: MechanismKey[];
  /** True when the boundary needs a `value` (e.g. which voice to avoid). */
  requiresValue: boolean;
}

export const BOUNDARIES: BoundaryDefinition[] = [
  {
    key: "no_hypnotic_language",
    label: "No hypnotic language",
    description: "No induction patterns, deepening counts, or suggestion framing.",
    blocksTags: BOUNDARY_BLOCKS.no_hypnotic_language,
    blocksMechanisms: [],
    requiresValue: false,
  },
  {
    key: "no_spiritual_terminology",
    label: "No spiritual terminology",
    description: "No spiritual or religious vocabulary anywhere in the session.",
    blocksTags: BOUNDARY_BLOCKS.no_spiritual_terminology,
    blocksMechanisms: [],
    requiresValue: false,
  },
  {
    key: "no_visualisation",
    label: "No visualisation",
    description: "No imagined scenes or evoked imagery.",
    blocksTags: BOUNDARY_BLOCKS.no_visualisation,
    blocksMechanisms: ["imagery"],
    requiresValue: false,
  },
  {
    key: "no_breath_retention",
    label: "No breath retention",
    description: "No holds at any point in the breath cycle.",
    blocksTags: BOUNDARY_BLOCKS.no_breath_retention,
    blocksMechanisms: [],
    requiresValue: false,
  },
  {
    key: "no_strong_breath_manipulation",
    label: "No strong breath manipulation",
    description: "No counted patterns, ratios, or paced breathing.",
    blocksTags: BOUNDARY_BLOCKS.no_strong_breath_manipulation,
    blocksMechanisms: ["extended_exhalation"],
    requiresValue: false,
  },
  {
    key: "no_pain_focus",
    label: "No direct focus on pain",
    description: "Attention never directed to a painful or uncomfortable area.",
    blocksTags: BOUNDARY_BLOCKS.no_pain_focus,
    blocksMechanisms: [],
    requiresValue: false,
  },
  {
    key: "no_sudden_sounds",
    label: "No sudden sounds",
    description: "No transients, chimes, or level jumps.",
    blocksTags: BOUNDARY_BLOCKS.no_sudden_sounds,
    blocksMechanisms: [],
    requiresValue: false,
  },
  {
    key: "avoid_voice",
    label: "Avoid a specific voice",
    description: "Never use the named voice.",
    blocksTags: [],
    blocksMechanisms: [],
    requiresValue: true,
  },
  {
    key: "avoid_sound_type",
    label: "Avoid a sound type",
    description: "Never use the named sound style.",
    blocksTags: [],
    blocksMechanisms: [],
    requiresValue: true,
  },
  {
    key: "avoid_theme",
    label: "Avoid a theme",
    description: "Never use the named imagery or content theme.",
    blocksTags: [],
    blocksMechanisms: [],
    requiresValue: true,
  },
  {
    key: "keep_predictable",
    label: "Keep the session predictable",
    description: "Announced structure only; no unannounced changes.",
    blocksTags: BOUNDARY_BLOCKS.keep_predictable,
    blocksMechanisms: [],
    requiresValue: false,
  },
];

export const BOUNDARY_BY_KEY: Record<BoundaryKey, BoundaryDefinition> = Object.fromEntries(
  BOUNDARIES.map((b) => [b.key, b]),
) as Record<BoundaryKey, BoundaryDefinition>;

const SCOPE_ORDER = ["always", "this_session", "evening", "sleep_only", "daytime"] as const;

export function isBoundaryKey(key: string): key is BoundaryKey {
  return key in BOUNDARY_BY_KEY;
}

export function isPreferenceKey(key: string): key is PreferenceKey {
  return key in PREFERENCE_BY_KEY;
}

export interface ResolvedConstraints {
  /** Every intervention tag that is off limits. */
  blockedTags: Set<BoundaryTag>;
  /** Mechanisms removed outright by a hard boundary. */
  blockedMechanisms: Set<MechanismKey>;
  blockedVoiceIds: Set<string>;
  blockedSoundStyles: Set<string>;
  blockedThemes: Set<string>;
  /** Accumulated soft bias per mechanism. */
  mechanismBias: Partial<Record<MechanismKey, number>>;
  silenceRatioDelta: number;
  directivenessDelta: number;
  hard: UserConstraint[];
  soft: UserConstraint[];
}

/**
 * Collapses a user's constraint list into the shape the engine consumes.
 *
 * Hard constraints become set membership — the engine can only *remove*
 * candidates with them, never weigh them against a score. That asymmetry is
 * the whole point: there is no numeric path by which a boundary can lose.
 */
export function resolveConstraints(constraints: UserConstraint[]): ResolvedConstraints {
  const resolved: ResolvedConstraints = {
    blockedTags: new Set(),
    blockedMechanisms: new Set(),
    blockedVoiceIds: new Set(),
    blockedSoundStyles: new Set(),
    blockedThemes: new Set(),
    mechanismBias: {},
    silenceRatioDelta: 0,
    directivenessDelta: 0,
    hard: [],
    soft: [],
  };

  for (const constraint of constraints) {
    if (constraint.type === "hard") {
      resolved.hard.push(constraint);
      if (!isBoundaryKey(constraint.key)) continue;
      const definition = BOUNDARY_BY_KEY[constraint.key];
      definition.blocksTags.forEach((tag) => resolved.blockedTags.add(tag));
      definition.blocksMechanisms.forEach((m) => resolved.blockedMechanisms.add(m));

      const value = typeof constraint.value === "string" ? constraint.value : null;
      if (value) {
        if (constraint.key === "avoid_voice") resolved.blockedVoiceIds.add(value);
        if (constraint.key === "avoid_sound_type") resolved.blockedSoundStyles.add(value);
        if (constraint.key === "avoid_theme") resolved.blockedThemes.add(value);
      }
      continue;
    }

    resolved.soft.push(constraint);
    if (!isPreferenceKey(constraint.key)) continue;
    const definition = PREFERENCE_BY_KEY[constraint.key];
    const strength = typeof constraint.value === "number" ? constraint.value : 1;

    for (const [mechanism, bias] of Object.entries(definition.mechanismBias)) {
      const key = mechanism as MechanismKey;
      resolved.mechanismBias[key] = (resolved.mechanismBias[key] ?? 0) + bias * strength;
    }
    resolved.silenceRatioDelta += (definition.silenceRatioDelta ?? 0) * strength;
    resolved.directivenessDelta += (definition.directivenessDelta ?? 0) * strength;
  }

  return resolved;
}

export function constraintLabel(constraint: UserConstraint): string {
  if (isBoundaryKey(constraint.key)) return BOUNDARY_BY_KEY[constraint.key].label;
  if (isPreferenceKey(constraint.key)) return PREFERENCE_BY_KEY[constraint.key].label;
  return constraint.key;
}

export function sortConstraints(constraints: UserConstraint[]): UserConstraint[] {
  return [...constraints].sort((a, b) => {
    if (a.type !== b.type) return a.type === "hard" ? -1 : 1;
    return SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope);
  });
}
