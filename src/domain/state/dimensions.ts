import type {
  DesiredDirection,
  DesiredDirectionDefinition,
  DimensionKey,
  StateDimension,
  StateProfile,
} from "@/domain/types";

/**
 * The state model.
 *
 * These are subjective, self-reported readings on a 0–10 scale. They are not
 * clinical instruments and must never be presented as a diagnosis: the
 * `internalInterpretation` field is for the studio team, `userFacingWording`
 * is the only text a person ever sees.
 */
export const STATE_DIMENSIONS: StateDimension[] = [
  {
    key: "stress",
    name: "Stress",
    description: "Felt pressure or activation right now.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: false,
    userFacingWording: "How much pressure do you feel right now?",
    internalInterpretation:
      "Composite of perceived demand and arousal. High values bias toward down-regulating mechanisms before any cognitive work.",
    allowedUseCases: ["session_selection", "outcome_tracking", "experiment_primary_outcome"],
    safetyNotes:
      "A high reading is not a clinical signal. Do not infer a disorder and do not offer treatment framing.",
    version: 3,
  },
  {
    key: "calmness",
    name: "Calmness",
    description: "Felt settledness of body and mind.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: true,
    userFacingWording: "How settled do you feel?",
    internalInterpretation:
      "Inverse-correlated with stress but reported separately; the gap between them is informative for pacing.",
    allowedUseCases: ["session_selection", "outcome_tracking", "experiment_primary_outcome"],
    safetyNotes: null,
    version: 2,
  },
  {
    key: "energy",
    name: "Energy",
    description: "Available physical and mental resource.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: true,
    userFacingWording: "How much energy do you have available?",
    internalInterpretation:
      "Low energy caps guidance density and total duration; very low energy blocks activating sequences.",
    allowedUseCases: ["session_selection", "outcome_tracking"],
    safetyNotes: null,
    version: 2,
  },
  {
    key: "tiredness",
    name: "Tiredness",
    description: "Felt need for rest.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: false,
    userFacingWording: "How tired do you feel?",
    internalInterpretation:
      "High tiredness with a sleep intent raises silence share and lowers words per minute.",
    allowedUseCases: ["session_selection", "outcome_tracking"],
    safetyNotes: null,
    version: 2,
  },
  {
    key: "mental_activity",
    name: "Mental activity",
    description: "How busy the mind feels.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: false,
    userFacingWording: "How busy is your mind?",
    internalInterpretation:
      "High values favour anchored attention and rhythm before open awareness.",
    allowedUseCases: ["session_selection", "outcome_tracking", "experiment_primary_outcome"],
    safetyNotes: null,
    version: 3,
  },
  {
    key: "rumination",
    name: "Rumination",
    description: "Getting caught in repeating thoughts.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: false,
    userFacingWording: "How much are your thoughts circling?",
    internalInterpretation:
      "Favours cognitive distancing and labelling. Avoid unstructured silence at high values.",
    allowedUseCases: ["session_selection", "outcome_tracking"],
    safetyNotes:
      "Persistent high rumination is a signal to review copy for medicalising language, not to escalate content.",
    version: 2,
  },
  {
    key: "focus",
    name: "Focus",
    description: "Ability to hold attention where you place it.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: true,
    userFacingWording: "How easily can you hold your attention?",
    internalInterpretation:
      "Low focus shortens block length and increases the number of gentle re-anchors.",
    allowedUseCases: ["session_selection", "outcome_tracking", "experiment_primary_outcome"],
    safetyNotes: null,
    version: 2,
  },
  {
    key: "emotional_intensity",
    name: "Emotional intensity",
    description: "How strong feelings are right now.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: false,
    userFacingWording: "How strong do your feelings feel right now?",
    internalInterpretation:
      "Above 7, prioritise perceived safety and exteroceptive orientation before interoception.",
    allowedUseCases: ["session_selection", "outcome_tracking"],
    safetyNotes:
      "High intensity requires trauma-informed review of any content that invites turning toward the feeling.",
    version: 4,
  },
  {
    key: "physical_tension",
    name: "Physical tension",
    description: "Held tightness in the body.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: false,
    userFacingWording: "How much tension do you notice in your body?",
    internalInterpretation: "Drives muscle relaxation share and body-scan pacing.",
    allowedUseCases: ["session_selection", "outcome_tracking"],
    safetyNotes: null,
    version: 2,
  },
  {
    key: "discomfort",
    name: "Discomfort",
    description: "Physical discomfort or pain right now.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: false,
    userFacingWording: "How much physical discomfort do you notice?",
    internalInterpretation:
      "Never used to make a clinical inference. High values exclude direct attention to the painful area unless a pain-science reviewer approved the content.",
    allowedUseCases: ["session_selection", "outcome_tracking"],
    safetyNotes:
      "Osora does not treat pain. Content touching this dimension requires pain-science review.",
    version: 5,
  },
  {
    key: "safety",
    name: "Sense of safety",
    description: "Felt sense of being okay where you are.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: true,
    userFacingWording: "How safe does it feel to settle right now?",
    internalInterpretation:
      "The gating dimension. Below 4, only stabilising and orienting mechanisms are eligible.",
    allowedUseCases: ["session_selection", "safety_gating", "outcome_tracking"],
    safetyNotes:
      "This dimension gates the engine. Never allow a scoring boost to override its exclusions.",
    version: 4,
  },
  {
    key: "connectedness",
    name: "Connectedness",
    description: "Feeling in contact with yourself or others.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: true,
    userFacingWording: "How connected do you feel?",
    internalInterpretation: "Favours self-compassion and warmth in tone.",
    allowedUseCases: ["session_selection", "outcome_tracking"],
    safetyNotes: null,
    version: 2,
  },
  {
    key: "openness",
    name: "Openness",
    description: "Willingness to let experience be as it is.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: true,
    userFacingWording: "How open do you feel to whatever is here?",
    internalInterpretation:
      "Low openness reduces acceptance share and increases structure and predictability.",
    allowedUseCases: ["session_selection", "outcome_tracking"],
    safetyNotes: null,
    version: 2,
  },
  {
    key: "motivation",
    name: "Motivation",
    description: "Willingness to engage with a session.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: true,
    userFacingWording: "How much do you feel like doing this?",
    internalInterpretation:
      "Low motivation caps session length and favours familiar material over exploration.",
    allowedUseCases: ["session_selection", "outcome_tracking"],
    safetyNotes: null,
    version: 1,
  },
  {
    key: "restlessness",
    name: "Restlessness",
    description: "Difficulty staying still.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: false,
    userFacingWording: "How restless does your body feel?",
    internalInterpretation:
      "High restlessness favours rhythm and movement-tolerant framing; reduces long silence.",
    allowedUseCases: ["session_selection", "outcome_tracking"],
    safetyNotes: null,
    version: 2,
  },
  {
    key: "overwhelm",
    name: "Overwhelm",
    description: "Feeling that it is all a bit much.",
    scale: "0-10",
    min: 0,
    max: 10,
    higherIsPleasant: false,
    userFacingWording: "How much does it feel like too much right now?",
    internalInterpretation:
      "Second gating dimension. Above 7, interoceptive and emotional-exposure content is excluded.",
    allowedUseCases: ["session_selection", "safety_gating", "outcome_tracking"],
    safetyNotes: "Gates the engine alongside `safety`. Exclusions here are non-negotiable.",
    version: 4,
  },
];

export const DIMENSION_BY_KEY: Record<DimensionKey, StateDimension> = Object.fromEntries(
  STATE_DIMENSIONS.map((d) => [d.key, d]),
) as Record<DimensionKey, StateDimension>;

export const DESIRED_DIRECTIONS: DesiredDirectionDefinition[] = [
  {
    key: "calmer",
    label: "Calmer",
    description: "Lower activation, more settledness.",
    targets: [
      { dimension: "stress", direction: -1, weight: 1 },
      { dimension: "calmness", direction: 1, weight: 1 },
      { dimension: "physical_tension", direction: -1, weight: 0.6 },
    ],
  },
  {
    key: "more_grounded",
    label: "More grounded",
    description: "More contact with the body and the present surroundings.",
    targets: [
      { dimension: "safety", direction: 1, weight: 0.9 },
      { dimension: "restlessness", direction: -1, weight: 0.8 },
      { dimension: "overwhelm", direction: -1, weight: 0.7 },
    ],
  },
  {
    key: "more_focused",
    label: "More focused",
    description: "Attention easier to place and hold.",
    targets: [
      { dimension: "focus", direction: 1, weight: 1 },
      { dimension: "mental_activity", direction: -1, weight: 0.7 },
    ],
  },
  {
    key: "more_connected",
    label: "More connected",
    description: "Warmer contact with yourself.",
    targets: [
      { dimension: "connectedness", direction: 1, weight: 1 },
      { dimension: "openness", direction: 1, weight: 0.5 },
    ],
  },
  {
    key: "less_mentally_busy",
    label: "Less mentally busy",
    description: "Fewer thoughts pulling in every direction.",
    targets: [
      { dimension: "mental_activity", direction: -1, weight: 1 },
      { dimension: "rumination", direction: -1, weight: 0.9 },
    ],
  },
  {
    key: "ready_for_sleep",
    label: "Ready for sleep",
    description: "Slower, quieter, with less to hold onto.",
    targets: [
      { dimension: "calmness", direction: 1, weight: 1 },
      { dimension: "mental_activity", direction: -1, weight: 0.8 },
      { dimension: "physical_tension", direction: -1, weight: 0.7 },
      { dimension: "energy", direction: -1, weight: 0.4 },
    ],
  },
  {
    key: "more_accepting",
    label: "More accepting",
    description: "Less struggle with what is already here.",
    targets: [
      { dimension: "openness", direction: 1, weight: 1 },
      { dimension: "emotional_intensity", direction: -1, weight: 0.5 },
    ],
  },
  {
    key: "more_energised",
    label: "More energised",
    description: "More available resource, gently.",
    targets: [
      { dimension: "energy", direction: 1, weight: 1 },
      { dimension: "tiredness", direction: -1, weight: 0.8 },
    ],
  },
  {
    key: "more_spacious",
    label: "More spacious",
    description: "More room around whatever is happening.",
    targets: [
      { dimension: "overwhelm", direction: -1, weight: 1 },
      { dimension: "openness", direction: 1, weight: 0.7 },
    ],
  },
  {
    key: "less_overwhelmed",
    label: "Less overwhelmed",
    description: "Fewer things demanding attention at once.",
    targets: [
      { dimension: "overwhelm", direction: -1, weight: 1 },
      { dimension: "safety", direction: 1, weight: 0.8 },
      { dimension: "stress", direction: -1, weight: 0.6 },
    ],
  },
];

export const DIRECTION_BY_KEY: Record<DesiredDirection, DesiredDirectionDefinition> =
  Object.fromEntries(DESIRED_DIRECTIONS.map((d) => [d.key, d])) as Record<
    DesiredDirection,
    DesiredDirectionDefinition
  >;

/** Signed change from pre to post, oriented so that positive = movement toward pleasant. */
export function orientedDelta(
  dimension: DimensionKey,
  pre: number,
  post: number,
): number {
  const raw = post - pre;
  return DIMENSION_BY_KEY[dimension].higherIsPleasant ? raw : -raw;
}

/** Mean oriented delta across the dimensions present in both profiles. */
export function profileDelta(pre: StateProfile, post: StateProfile): number {
  const keys = (Object.keys(pre) as DimensionKey[]).filter((k) => post[k] !== undefined);
  if (keys.length === 0) return 0;
  const total = keys.reduce(
    (sum, key) => sum + orientedDelta(key, pre[key] as number, post[key] as number),
    0,
  );
  return total / keys.length;
}

export function readDimension(profile: StateProfile, key: DimensionKey, fallback = 5): number {
  const value = profile[key];
  return typeof value === "number" ? value : fallback;
}
