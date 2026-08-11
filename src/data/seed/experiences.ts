import { scoreDna } from "@/domain/dna/score";
import { runStateEngine } from "@/domain/engine/state-engine";
import { INTERVENTION_BY_KEY } from "@/domain/interventions/library";
import { countWords, estimateSpeechSeconds, planTimeline, recomputeBounds } from "@/domain/timeline/planner";
import type {
  ComposerSettings,
  DesiredStateInput,
  EngineInput,
  Experience,
  ExperienceStatus,
  ExperienceVersion,
  SectionTimeline,
  StateProfile,
  UserConstraint,
} from "@/domain/types";
import { OSORA_DNA } from "./dna";
import { VOICES } from "./audio-library";

/**
 * Experience seed.
 *
 * These are not hand-written fixtures. Each one runs the real State Engine and
 * the real timeline planner, so the placeholder data is internally consistent
 * with the logic the studio actually uses — including its warnings, its
 * exclusions and its drift.
 */

const PRODUCTION = {
  maxNarrationWords: 1400,
  minSectionSeconds: 20,
  wordsPerMinute: 105,
  availableVoiceIds: VOICES.filter((v) => v.approved).map((v) => v.id),
  availableSoundStyles: ["low_bed", "warm_drone", "soft_air", "near_silence", "slow_pulse"],
};

function constraint(
  id: string,
  userId: string,
  type: "hard" | "soft",
  key: UserConstraint["key"],
  value: UserConstraint["value"],
  reason: string,
  scope: UserConstraint["scope"] = "always",
): UserConstraint {
  return {
    id,
    userId,
    type,
    key,
    value,
    reason,
    scope,
    createdAt: "2026-05-12T09:00:00.000Z",
    updatedAt: "2026-07-14T09:00:00.000Z",
  };
}

/** Constraint sets belonging to the demo listener profiles. */
export const USER_CONSTRAINT_SETS: Record<string, UserConstraint[]> = {
  "profile-a": [
    constraint("c-a1", "profile-a", "hard", "no_spiritual_terminology", null, "Finds it alienating."),
    constraint("c-a2", "profile-a", "soft", "more_silence", 1, "Asked for less talking."),
    constraint("c-a3", "profile-a", "soft", "more_scientific_language", 1, "Prefers plain mechanism language."),
  ],
  "profile-b": [
    constraint(
      "c-b1",
      "profile-b",
      "hard",
      "no_visualisation",
      null,
      "Imagery consistently produced intrusive content. Set after session 14.",
    ),
    constraint(
      "c-b2",
      "profile-b",
      "hard",
      "no_breath_retention",
      null,
      "Breath holds trigger discomfort.",
    ),
    constraint("c-b3", "profile-b", "soft", "more_structure", 1, "Prefers knowing what is coming."),
    constraint("c-b4", "profile-b", "soft", "less_silence", 0.5, "Long silence reads as being left alone."),
  ],
  "profile-c": [
    constraint(
      "c-c1",
      "profile-c",
      "hard",
      "no_pain_focus",
      null,
      "Persistent shoulder pain. Attention there makes it worse.",
    ),
    constraint("c-c2", "profile-c", "hard", "keep_predictable", null, "Wants no surprises at all."),
    constraint("c-c3", "profile-c", "soft", "less_body_awareness", 0.7, "Body work has been mixed."),
    constraint(
      "c-c4",
      "profile-c",
      "hard",
      "avoid_voice",
      "voice-linnea",
      "Reported the voice as too awake for evening use.",
    ),
  ],
  "profile-d": [
    constraint("c-d1", "profile-d", "soft", "more_body_awareness", 1, "Body work lands best."),
    constraint("c-d2", "profile-d", "soft", "more_poetic_language", 0.5, "Prefers warmer wording."),
  ],
};

function settings(overrides: Partial<ComposerSettings> = {}): ComposerSettings {
  return {
    llmProvider: "mock",
    llmModel: "mock-composer-1",
    temperature: 0.4,
    promptTemplate: "osora-compose-v3",
    professionalPerspective: null,
    voiceId: "voice-aurel",
    voiceStyle: "unhurried",
    language: "en",
    speakingRate: 1,
    voiceStability: 0.72,
    soundModel: "mock_sound_v1",
    soundStyle: "low_bed",
    soundIntensity: 0.28,
    targetSeconds: 720,
    silenceRatio: 0.2,
    fadeInSeconds: 4,
    fadeOutSeconds: 18,
    loudnessTargetLufs: -19,
    familiarityRatio: 0.8,
    explorationRatio: 0.2,
    ...overrides,
  };
}

/**
 * Deterministic script filler for the seed.
 *
 * It writes inside each section's word budget, the same discipline the real
 * composer works under, so seeded timelines reconcile the way real ones do.
 */
function fillScript(timeline: SectionTimeline, wpm: number): SectionTimeline {
  const sections = timeline.sections.map((section) => {
    if (section.wordBudget <= 0) {
      return { ...section, text: "", wordCount: 0, actualSpeechSeconds: 0 };
    }

    const intervention = section.interventionKey
      ? INTERVENTION_BY_KEY[section.interventionKey]
      : undefined;

    const lines = (intervention?.scriptTemplate ?? "Letting the next part be as it is.")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("["))
      .map((line) =>
        line
          .replace(/\{\{contact_one\}\}/g, "feet meet the floor")
          .replace(/\{\{contact_two\}\}/g, "where you're sitting")
          .replace(/\{\{contact_three\}\}/g, "your hands")
          .replace(/\{\{region_sequence\}\}/g, "The hips. The back. The shoulders.")
          .replace(/\{\{phrase\}\}/g, "this is hard, and I'm here")
          .replace(/\{\{scene\}\}/g, "a wide field in early light")
          .replace(/\{\{minutes\}\}/g, String(Math.round(timeline.targetSeconds / 60)))
          .replace(/\{\{shape\}\}/g, "breath, then the body, then some quiet")
          .replace(/\{\{[^}]+\}\}/g, "that"),
      );

    // Fill the budget rather than stopping at the first line that does not
    // fit — an under-filled section would understate the drift the studio is
    // meant to surface.
    const chosen: string[] = [];
    let words = 0;
    for (let i = 0; i < 40 && lines.length > 0; i += 1) {
      if (section.wordBudget - words < 4) break;
      const line = lines[i % lines.length];
      const lineWords = countWords(line);
      if (words + lineWords > section.wordBudget) continue;
      chosen.push(line);
      words += lineWords;
    }

    const pausePerGap = Math.max(4, Math.round(section.pauseSeconds / Math.max(1, chosen.length)));
    const text = chosen.join(`\n\n[pause ${pausePerGap}]\n\n`);
    const wordCount = countWords(text);

    // Real narration never matches the estimate exactly. A small deterministic
    // wobble keeps the seeded reconciliation honest.
    const wobble = 1 + ((section.order * 37) % 13) / 100 - 0.06;
    return {
      ...section,
      text,
      wordCount,
      actualSpeechSeconds: Number((estimateSpeechSeconds(wordCount, wpm) * wobble).toFixed(1)),
    };
  });

  return recomputeBounds({ ...timeline, sections }, wpm);
}

interface Blueprint {
  id: string;
  title: string;
  internalTitle: string;
  status: ExperienceStatus;
  profileId: keyof typeof USER_CONSTRAINT_SETS;
  currentState: StateProfile;
  desired: DesiredStateInput;
  targetOutcome: string;
  familiarGroups: EngineInput["familiarGroups"];
  recent: string[];
  outcomeBias: EngineInput["outcomeBias"];
  settings: ComposerSettings;
  contributorIds: string[];
  audioProjectId: string | null;
  experimentId: string | null;
  version: number;
  updatedAt: string;
  updatedBy: string;
  createdAt: string;
  /** Whether to run the script filler — early-stage work has no script yet. */
  scripted: boolean;
}

const BLUEPRINTS: Blueprint[] = [
  {
    id: "exp-evening-reset",
    title: "Evening reset",
    internalTitle: "12min · stress 7 · tension 7 · → calmer, less mentally busy",
    status: "audio_review",
    profileId: "profile-a",
    currentState: {
      stress: 7,
      calmness: 3,
      energy: 4,
      tiredness: 6,
      mental_activity: 8,
      rumination: 6,
      focus: 4,
      emotional_intensity: 5,
      physical_tension: 7,
      discomfort: 2,
      safety: 7,
      connectedness: 5,
      openness: 6,
      motivation: 5,
      restlessness: 5,
      overwhelm: 5,
    },
    desired: {
      directions: ["calmer", "less_mentally_busy"],
      intent: "wind_down",
      environment: "quiet_room",
      availableSeconds: 720,
      context: "End of a long stretch of work. Not tired enough for sleep yet.",
    },
    targetOutcome: "Reduce cognitive and physiological activation without producing sleepiness.",
    familiarGroups: ["grounding_core", "breath_core", "body_core", "silence_core"],
    recent: ["feet-to-head-scan", "return-without-comment"],
    outcomeBias: { extended_exhalation: 0.4, body_awareness: 0.3, imagery: -0.2 },
    settings: settings({ targetSeconds: 720, soundStyle: "low_bed" }),
    contributorIds: ["prof-yuki-tanabe", "prof-hedda-lindqvist", "prof-ines-caballero"],
    audioProjectId: "project-evening-reset",
    experimentId: "exp-silence-ratio",
    version: 4,
    updatedAt: "2026-08-05T16:42:00.000Z",
    updatedBy: "Inés Caballero",
    createdAt: "2026-07-21T09:00:00.000Z",
    scripted: true,
  },
  {
    id: "exp-overwhelm-orientation",
    title: "When it's a lot",
    internalTitle: "8min · overwhelm 9 · safety 3 · → less overwhelmed, more grounded",
    status: "safety_review",
    profileId: "profile-b",
    currentState: {
      stress: 8,
      calmness: 2,
      energy: 3,
      tiredness: 7,
      mental_activity: 9,
      rumination: 7,
      focus: 2,
      emotional_intensity: 8,
      physical_tension: 6,
      discomfort: 3,
      safety: 3,
      connectedness: 3,
      openness: 3,
      motivation: 4,
      restlessness: 7,
      overwhelm: 9,
    },
    desired: {
      directions: ["less_overwhelmed", "more_grounded"],
      intent: "recover_after_stress",
      environment: "shared_space",
      availableSeconds: 480,
      context: "Needs something that does not ask for much.",
    },
    targetOutcome:
      "Establish enough felt safety and orientation that nothing else is required of the person.",
    familiarGroups: ["grounding_core"],
    recent: ["outward-listening"],
    outcomeBias: { exteroceptive_orientation: 0.5, perceived_safety: 0.4 },
    settings: settings({
      targetSeconds: 480,
      soundStyle: "near_silence",
      soundIntensity: 0.14,
      voiceId: "voice-soren",
      fadeOutSeconds: 20,
    }),
    contributorIds: ["prof-marcus-abiodun", "prof-yuki-tanabe"],
    audioProjectId: null,
    experimentId: null,
    version: 2,
    updatedAt: "2026-08-06T08:10:00.000Z",
    updatedBy: "Marcus Abiodun",
    createdAt: "2026-08-02T11:30:00.000Z",
    scripted: true,
  },
  {
    id: "exp-before-sleep",
    title: "Before sleep",
    internalTitle: "15min · tiredness 8 · tension 6 · → ready for sleep",
    status: "approved",
    profileId: "profile-c",
    currentState: {
      stress: 5,
      calmness: 5,
      energy: 2,
      tiredness: 8,
      mental_activity: 6,
      rumination: 4,
      focus: 3,
      emotional_intensity: 3,
      physical_tension: 6,
      discomfort: 6,
      safety: 8,
      connectedness: 6,
      openness: 7,
      motivation: 4,
      restlessness: 3,
      overwhelm: 3,
    },
    desired: {
      directions: ["ready_for_sleep", "calmer"],
      intent: "prepare_for_sleep",
      environment: "bed",
      availableSeconds: 900,
      context: "Shoulder discomfort. Wants nothing that asks for a decision.",
    },
    targetOutcome: "Reduce activation and hand the session over quietly, without a decision point.",
    familiarGroups: ["grounding_core", "body_core", "silence_core", "breath_core"],
    recent: ["progressive-release"],
    outcomeBias: { muscle_relaxation: 0.5, silence: 0.3, body_awareness: 0.2 },
    settings: settings({
      targetSeconds: 900,
      soundStyle: "soft_air",
      soundIntensity: 0.18,
      fadeOutSeconds: 25,
      silenceRatio: 0.28,
    }),
    contributorIds: ["prof-noor-farhadi", "prof-tomas-reiner", "prof-yuki-tanabe"],
    audioProjectId: "project-before-sleep",
    experimentId: null,
    version: 7,
    updatedAt: "2026-08-03T20:15:00.000Z",
    updatedBy: "Dr Noor Farhadi",
    createdAt: "2026-06-14T14:00:00.000Z",
    scripted: true,
  },
  {
    id: "exp-morning-focus",
    title: "Before the day starts",
    internalTitle: "6min · focus 3 · energy 5 · → more focused",
    status: "changes_requested",
    profileId: "profile-d",
    currentState: {
      stress: 4,
      calmness: 6,
      energy: 5,
      tiredness: 5,
      mental_activity: 7,
      rumination: 3,
      focus: 3,
      emotional_intensity: 3,
      physical_tension: 4,
      discomfort: 1,
      safety: 8,
      connectedness: 6,
      openness: 7,
      motivation: 6,
      restlessness: 5,
      overwhelm: 3,
    },
    desired: {
      directions: ["more_focused", "more_grounded"],
      intent: "prepare_for_focus",
      environment: "office",
      availableSeconds: 360,
      context: "Wants to start rather than to relax.",
    },
    targetOutcome: "Attention easier to place, without producing drowsiness.",
    familiarGroups: ["grounding_core", "breath_core"],
    recent: ["three-points-of-contact", "gentle-exhale-extension"],
    outcomeBias: { attention_stabilisation: 0.4 },
    settings: settings({
      targetSeconds: 360,
      soundStyle: "warm_drone",
      voiceId: "voice-maren",
      fadeOutSeconds: 10,
    }),
    contributorIds: ["prof-yuki-tanabe", "prof-elke-brandt"],
    audioProjectId: "project-morning-focus",
    experimentId: "exp-voice-comparison",
    version: 2,
    updatedAt: "2026-08-05T09:05:00.000Z",
    updatedBy: "Elke Brandt",
    createdAt: "2026-07-30T08:20:00.000Z",
    scripted: true,
  },
  {
    id: "exp-sitting-with-it",
    title: "Sitting with it",
    internalTitle: "10min · emotional intensity 7 · → more accepting",
    status: "scientific_review",
    profileId: "profile-a",
    currentState: {
      stress: 6,
      calmness: 4,
      energy: 5,
      tiredness: 4,
      mental_activity: 6,
      rumination: 7,
      focus: 5,
      emotional_intensity: 7,
      physical_tension: 5,
      discomfort: 2,
      safety: 6,
      connectedness: 4,
      openness: 4,
      motivation: 5,
      restlessness: 4,
      overwhelm: 5,
    },
    desired: {
      directions: ["more_accepting", "more_spacious"],
      intent: "sit_with_a_feeling",
      environment: "quiet_room",
      availableSeconds: 600,
      context: "Something specific happened today.",
    },
    targetOutcome: "Less energy spent resisting what is already present.",
    familiarGroups: ["grounding_core", "cognitive_core", "silence_core"],
    recent: ["what-is-already-here"],
    outcomeBias: { cognitive_distancing: 0.3, acceptance: 0.35 },
    settings: settings({ targetSeconds: 600, soundStyle: "near_silence", silenceRatio: 0.26 }),
    contributorIds: ["prof-marcus-abiodun", "prof-hedda-lindqvist"],
    audioProjectId: null,
    experimentId: null,
    version: 3,
    updatedAt: "2026-08-04T13:20:00.000Z",
    updatedBy: "Marcus Abiodun",
    createdAt: "2026-07-25T10:00:00.000Z",
    scripted: true,
  },
  {
    id: "exp-mid-day-reset",
    title: "Middle of the day",
    internalTitle: "5min · restlessness 7 · → calmer",
    status: "composition",
    profileId: "profile-d",
    currentState: {
      stress: 6,
      calmness: 4,
      energy: 6,
      tiredness: 3,
      mental_activity: 7,
      rumination: 4,
      focus: 4,
      emotional_intensity: 4,
      physical_tension: 6,
      discomfort: 1,
      safety: 7,
      connectedness: 5,
      openness: 6,
      motivation: 5,
      restlessness: 7,
      overwhelm: 4,
    },
    desired: {
      directions: ["calmer", "more_grounded"],
      intent: "reset_during_day",
      environment: "office",
      availableSeconds: 300,
      context: null,
    },
    targetOutcome: "A short interruption of physiological activation between two things.",
    familiarGroups: ["grounding_core", "breath_core"],
    recent: [],
    outcomeBias: {},
    settings: settings({ targetSeconds: 300, soundStyle: "low_bed", fadeOutSeconds: 8 }),
    contributorIds: ["prof-yuki-tanabe"],
    audioProjectId: null,
    experimentId: null,
    version: 1,
    updatedAt: "2026-08-06T07:30:00.000Z",
    updatedBy: "Nik Völker",
    createdAt: "2026-08-06T07:12:00.000Z",
    scripted: false,
  },
  {
    id: "exp-loneliness-draft",
    title: "When it feels far away",
    internalTitle: "10min · connectedness 2 · → more connected",
    status: "research",
    profileId: "profile-b",
    currentState: {
      stress: 5,
      calmness: 5,
      energy: 4,
      tiredness: 5,
      mental_activity: 6,
      rumination: 6,
      focus: 4,
      emotional_intensity: 6,
      physical_tension: 4,
      discomfort: 2,
      safety: 6,
      connectedness: 2,
      openness: 4,
      motivation: 4,
      restlessness: 4,
      overwhelm: 4,
    },
    desired: {
      directions: ["more_connected", "more_accepting"],
      intent: "sit_with_a_feeling",
      environment: "quiet_room",
      availableSeconds: 600,
      context: "Early research. No script yet.",
    },
    targetOutcome: "A warmer internal tone that persists past the end of the session.",
    familiarGroups: ["grounding_core", "compassion_core"],
    recent: [],
    outcomeBias: {},
    settings: settings({ targetSeconds: 600, voiceId: "voice-maren" }),
    contributorIds: ["prof-marcus-abiodun"],
    audioProjectId: null,
    experimentId: null,
    version: 1,
    updatedAt: "2026-08-01T15:00:00.000Z",
    updatedBy: "Marcus Abiodun",
    createdAt: "2026-08-01T15:00:00.000Z",
    scripted: false,
  },
];

function buildExperience(blueprint: Blueprint): Experience {
  const constraints = USER_CONSTRAINT_SETS[blueprint.profileId];

  const plan = runStateEngine({
    currentState: blueprint.currentState,
    desired: blueprint.desired,
    constraints,
    dna: OSORA_DNA,
    familiarGroups: blueprint.familiarGroups,
    recentInterventionKeys: blueprint.recent,
    outcomeBias: blueprint.outcomeBias,
    production: PRODUCTION,
  });

  const planned = planTimeline(plan, OSORA_DNA, {
    wordsPerMinute: PRODUCTION.wordsPerMinute,
    speakingRate: blueprint.settings.speakingRate,
  });
  const timeline = blueprint.scripted ? fillScript(planned, PRODUCTION.wordsPerMinute) : planned;

  return {
    id: blueprint.id,
    title: blueprint.title,
    internalTitle: blueprint.internalTitle,
    status: blueprint.status,
    currentState: blueprint.currentState,
    desired: blueprint.desired,
    targetOutcome: blueprint.targetOutcome,
    durationSeconds: blueprint.desired.availableSeconds,
    plan,
    timeline,
    settings: {
      ...blueprint.settings,
      familiarityRatio: plan.familiarityRatio,
      explorationRatio: plan.explorationRatio,
      silenceRatio: plan.silenceRatio,
    },
    constraints,
    contributorIds: blueprint.contributorIds,
    requiredReviewSkills: plan.requiredReviews,
    scientificConfidence: plan.confidence,
    dnaProfileId: OSORA_DNA.id,
    dnaScore: scoreDna(plan, timeline, OSORA_DNA),
    audioProjectId: blueprint.audioProjectId,
    experimentId: blueprint.experimentId,
    version: blueprint.version,
    updatedAt: blueprint.updatedAt,
    updatedBy: blueprint.updatedBy,
    createdAt: blueprint.createdAt,
  };
}

export const EXPERIENCES: Experience[] = BLUEPRINTS.map(buildExperience);

export const EXPERIENCE_BY_ID = Object.fromEntries(EXPERIENCES.map((e) => [e.id, e]));

export const EXPERIENCE_VERSIONS: ExperienceVersion[] = [
  {
    id: "ver-evening-4",
    experienceId: "exp-evening-reset",
    version: 4,
    label: "Silence block moved after body work",
    authorName: "Yuki Tanabe",
    createdAt: "2026-08-05T16:42:00.000Z",
    summary: "Silence lands better once the body section has finished than between breath and body.",
  },
  {
    id: "ver-evening-3",
    experienceId: "exp-evening-reset",
    version: 3,
    label: "Breath block shortened to 120s",
    authorName: "Dr Hedda Lindqvist",
    createdAt: "2026-08-02T11:15:00.000Z",
    summary: "180s of breath work was more than the evidence supports for a wind-down session.",
  },
  {
    id: "ver-evening-2",
    experienceId: "exp-evening-reset",
    version: 2,
    label: "Imagery removed",
    authorName: "Elke Brandt",
    createdAt: "2026-07-28T09:30:00.000Z",
    summary: "The landscape image read as a different product. Replaced with silence.",
  },
  {
    id: "ver-evening-1",
    experienceId: "exp-evening-reset",
    version: 1,
    label: "Initial composition",
    authorName: "Nik Völker",
    createdAt: "2026-07-21T09:00:00.000Z",
    summary: "First plan from the State Engine at stress 7 / mental activity 8.",
  },
  {
    id: "ver-sleep-7",
    experienceId: "exp-before-sleep",
    version: 7,
    label: "Final fade extended to 25s",
    authorName: "Dr Noor Farhadi",
    createdAt: "2026-08-03T20:15:00.000Z",
    summary: "18s still read as an ending. 25s does not.",
  },
  {
    id: "ver-sleep-6",
    experienceId: "exp-before-sleep",
    version: 6,
    label: "Neutral-region routing for the body section",
    authorName: "Tomas Reiner",
    createdAt: "2026-07-30T17:40:00.000Z",
    summary: "Full scan reaches the shoulder. Routed around it.",
  },
];
