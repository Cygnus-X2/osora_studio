import type { Experiment, SessionOutcome } from "@/domain/types";

/**
 * Experiments.
 *
 * Every variation is a hypothesis with one variable. No autonomous
 * optimisation: assignment is manual, the stop condition is written down
 * before the experiment starts, and interpretation is a human sentence.
 */
export const EXPERIMENTS: Experiment[] = [
  {
    id: "exp-silence-ratio",
    name: "Silence ratio in evening wind-down",
    hypothesis:
      "Raising the silence share from 45% to 60% in evening sessions increases the calmness delta, because the settling happens in the gaps rather than in the instructions.",
    eligiblePopulation:
      "Users with ≥3 completed evening sessions, reported stress ≥5, no hard boundary on silence length.",
    exclusionCriteria: [
      "First-time users",
      "Users with a `less_silence` preference",
      "Users with rumination ≥8, where unstructured silence is contraindicated",
    ],
    variable: "silence_ratio",
    variants: [
      {
        id: "var-silence-control",
        label: "Control — 45% silence",
        isControl: true,
        description: "Current default arrangement.",
        settingsDelta: { silenceRatio: 0.45 },
        assignments: 148,
        completions: 131,
        meanPrimaryDelta: 1.62,
      },
      {
        id: "var-silence-high",
        label: "Variant — 60% silence",
        isControl: false,
        description: "Pause time extended inside each guided block; no interventions changed.",
        settingsDelta: { silenceRatio: 0.6 },
        assignments: 145,
        completions: 118,
        meanPrimaryDelta: 1.94,
      },
    ],
    primaryOutcome: "calmness",
    secondaryOutcomes: ["stress", "mental_activity"],
    safetyGuardrails: [
      "Stop immediately if felt-safe rate in either arm falls below 92%.",
      "Stop if completion rate in the variant arm falls more than 15 points below control.",
    ],
    minimumSample: 120,
    stopCondition:
      "120 completed sessions per arm, or 6 weeks, whichever comes first. No peeking before n=60 per arm.",
    ownerId: "user-hedda",
    ownerName: "Dr Hedda Lindqvist",
    requiredReview: "scientific",
    status: "running",
    results:
      "Variant +0.32 mean calmness delta over control (n=131 / 118). Completion is 9 points lower in the variant arm.",
    interpretation:
      "The calmness difference is in the expected direction but the completion gap matters more: some people are leaving during the longer silences. Not shipping until we can see where they stop.",
    startedAt: "2026-06-24T09:00:00.000Z",
    updatedAt: "2026-08-05T11:20:00.000Z",
  },
  {
    id: "exp-voice-comparison",
    name: "Aurel against Maren for morning sessions",
    hypothesis:
      "Maren's warmer, slightly faster delivery suits morning focus sessions better than the Aurel reference voice, which was tuned for evening.",
    eligiblePopulation: "Morning sessions with a `prepare_for_focus` intent.",
    exclusionCriteria: ["Users with an `avoid_voice` boundary on either voice"],
    variable: "voice",
    variants: [
      {
        id: "var-voice-aurel",
        label: "Control — Aurel",
        isControl: true,
        description: "The stable Osora voice identity.",
        settingsDelta: { voiceId: "voice-aurel" },
        assignments: 74,
        completions: 68,
        meanPrimaryDelta: 1.28,
      },
      {
        id: "var-voice-maren",
        label: "Variant — Maren",
        isControl: false,
        description: "Warmer mid-range, marginally faster.",
        settingsDelta: { voiceId: "voice-maren" },
        assignments: 71,
        completions: 66,
        meanPrimaryDelta: 1.41,
      },
    ],
    primaryOutcome: "focus",
    secondaryOutcomes: ["energy", "connectedness"],
    safetyGuardrails: ["Stop if either arm's felt-safe rate falls below 95%."],
    minimumSample: 100,
    stopCondition: "100 completed sessions per arm.",
    ownerId: "user-hedda",
    ownerName: "Dr Hedda Lindqvist",
    requiredReview: "internal",
    status: "running",
    results: "Variant +0.13 on focus delta. Well inside noise at this sample size.",
    interpretation:
      "No signal yet. Worth noting that changing the voice touches a stable DNA element, so a positive result would still need a separate decision about whether to act on it.",
    startedAt: "2026-07-15T08:00:00.000Z",
    updatedAt: "2026-08-04T16:45:00.000Z",
  },
  {
    id: "exp-body-vs-breath",
    name: "Body first against breath first",
    hypothesis:
      "For users reporting physical tension ≥6, opening with body work rather than breath work produces a larger tension delta.",
    eligiblePopulation: "Physical tension ≥6, session length ≥8 minutes.",
    exclusionCriteria: ["Discomfort ≥6", "Hard boundary on body scanning"],
    variable: "body_first_vs_breath_first",
    variants: [
      {
        id: "var-breath-first",
        label: "Control — breath first",
        isControl: true,
        description: "Current session grammar order.",
        settingsDelta: { order: "breath_first" },
        assignments: 96,
        completions: 88,
        meanPrimaryDelta: 1.71,
      },
      {
        id: "var-body-first",
        label: "Variant — body first",
        isControl: false,
        description: "Body block precedes the breath block.",
        settingsDelta: { order: "body_first" },
        assignments: 94,
        completions: 84,
        meanPrimaryDelta: 1.55,
      },
    ],
    primaryOutcome: "physical_tension",
    secondaryOutcomes: ["calmness", "stress"],
    safetyGuardrails: ["Stop if the variant arm's felt-safe rate drops below control by 3 points."],
    minimumSample: 80,
    stopCondition: "80 completed sessions per arm.",
    ownerId: "user-yuki",
    ownerName: "Yuki Tanabe",
    requiredReview: "professional",
    status: "analysed",
    results: "Control +0.16 on tension delta (n=88 / 84). The variant did not beat the default.",
    interpretation:
      "Hypothesis not supported. Keeping breath first. Worth noting the variant also changed the session grammar, which is a stable DNA element — that was probably too much to move for one test.",
    startedAt: "2026-05-06T09:00:00.000Z",
    updatedAt: "2026-07-02T10:00:00.000Z",
  },
  {
    id: "exp-invitational-language",
    name: "Direct against invitational phrasing",
    hypothesis:
      "Users with a `more_structure` preference respond better to direct phrasing than to the Osora default invitational register.",
    eligiblePopulation: "Users with an explicit `more_structure` or `more_direct_guidance` preference.",
    exclusionCriteria: ["Trauma-informed review flags on the session", "Sleep sessions"],
    variable: "direct_vs_invitational",
    variants: [
      {
        id: "var-invitational",
        label: "Control — invitational",
        isControl: true,
        description: '"See if the out-breath can lengthen."',
        settingsDelta: { directiveness: "invitational" },
        assignments: 0,
        completions: 0,
        meanPrimaryDelta: null,
      },
      {
        id: "var-direct",
        label: "Variant — direct",
        isControl: false,
        description: '"Let the out-breath lengthen."',
        settingsDelta: { directiveness: "direct" },
        assignments: 0,
        completions: 0,
        meanPrimaryDelta: null,
      },
    ],
    primaryOutcome: "calmness",
    secondaryOutcomes: ["focus", "safety"],
    safetyGuardrails: [
      "Direct phrasing must not appear in any session carrying a trauma-informed review requirement.",
    ],
    minimumSample: 100,
    stopCondition: "100 completed sessions per arm.",
    ownerId: "user-yuki",
    ownerName: "Yuki Tanabe",
    requiredReview: "safety",
    status: "review",
    results: null,
    interpretation: null,
    startedAt: null,
    updatedAt: "2026-08-06T09:15:00.000Z",
  },
  {
    id: "exp-opening-length",
    name: "Opening length before the first instruction",
    hypothesis:
      "Extending the arrival section from 8s to 20s of ambience before the first word reduces early drop-off.",
    eligiblePopulation: "All sessions ≥10 minutes.",
    exclusionCriteria: ["Sessions under 10 minutes"],
    variable: "opening_duration",
    variants: [
      {
        id: "var-opening-8",
        label: "Control — 8s arrival",
        isControl: true,
        description: "Current default.",
        settingsDelta: { leadInSeconds: 8 },
        assignments: 0,
        completions: 0,
        meanPrimaryDelta: null,
      },
      {
        id: "var-opening-20",
        label: "Variant — 20s arrival",
        isControl: false,
        description: "Longer ambience before the voice enters.",
        settingsDelta: { leadInSeconds: 20 },
        assignments: 0,
        completions: 0,
        meanPrimaryDelta: null,
      },
    ],
    primaryOutcome: "calmness",
    secondaryOutcomes: ["safety"],
    safetyGuardrails: [],
    minimumSample: 150,
    stopCondition: "150 completed sessions per arm, or 8 weeks.",
    ownerId: "user-nik",
    ownerName: "Nik Völker",
    requiredReview: "internal",
    status: "design",
    results: null,
    interpretation: null,
    startedAt: null,
    updatedAt: "2026-08-05T14:00:00.000Z",
  },
];

export const EXPERIMENT_BY_ID = Object.fromEntries(EXPERIMENTS.map((e) => [e.id, e]));

/* ------------------------------------------------------------------ */
/* Outcomes                                                             */
/* ------------------------------------------------------------------ */

const EXPERIENCE_IDS = [
  "exp-evening-reset",
  "exp-before-sleep",
  "exp-morning-focus",
  "exp-sitting-with-it",
  "exp-overwhelm-orientation",
];

const DISLIKE_POOL = [
  "The silence in the middle felt too long",
  "Too much talking",
  "The background sound was distracting",
  "The ending came too quickly",
  "I did not like the phrase about the body",
];

const AUDIO_PROBLEM_POOL = ["Background ended before the voice", "Level jump near the end", "Loop seam audible"];

const FEEDBACK_POOL = [
  "The part where nothing was said was the part that worked.",
  "I stopped after about four minutes — not because it was bad, I just had to go.",
  "Knowing the shape up front made it much easier to settle.",
  "The breathing bit felt like homework.",
  "I have done this one a few times now. It is the one I come back to.",
  "The voice is the right amount of not-cheerful.",
  null,
  null,
];

/**
 * Recorded outcomes.
 *
 * Deterministically generated so the aggregates are stable across reloads —
 * the point of the screen is the shape of the data, not any single session.
 */
function buildOutcomes(): SessionOutcome[] {
  const outcomes: SessionOutcome[] = [];
  let seed = 20260806;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  for (let i = 0; i < 96; i += 1) {
    const experienceId = EXPERIENCE_IDS[i % EXPERIENCE_IDS.length];
    const isSleep = experienceId === "exp-before-sleep";
    const isOverwhelm = experienceId === "exp-overwhelm-orientation";

    const preStress = Math.round(4 + next() * 5);
    const preCalm = Math.round(2 + next() * 4);
    const preTension = Math.round(3 + next() * 5);
    const preMental = Math.round(4 + next() * 5);
    const preFocus = Math.round(2 + next() * 5);
    const preConnected = Math.round(3 + next() * 4);
    const preSafety = isOverwhelm ? Math.round(2 + next() * 3) : Math.round(5 + next() * 4);

    // Most sessions move things a little. Some do nothing. A few go backwards.
    const magnitude = next();
    const direction = magnitude < 0.08 ? -1 : magnitude < 0.2 ? 0 : 1;
    const shift = direction * Math.round(next() * 3);

    const completed = next() > (isSleep ? 0.08 : 0.14);
    const completionRatio = completed ? 1 : Number((0.25 + next() * 0.6).toFixed(2));
    const helpfulness = Math.max(1, Math.min(5, 3 + direction + Math.round(next() * 1.4 - 0.7)));

    outcomes.push({
      id: `outcome-${i + 1}`,
      experienceId,
      userId: `listener-${(i % 24) + 1}`,
      experimentVariantId:
        experienceId === "exp-evening-reset"
          ? i % 2 === 0
            ? "var-silence-control"
            : "var-silence-high"
          : experienceId === "exp-morning-focus"
            ? i % 2 === 0
              ? "var-voice-aurel"
              : "var-voice-maren"
            : null,
      pre: {
        stress: preStress,
        calmness: preCalm,
        focus: preFocus,
        connectedness: preConnected,
        mental_activity: preMental,
        physical_tension: preTension,
        safety: preSafety,
      },
      post: {
        stress: clamp(preStress - shift),
        calmness: clamp(preCalm + shift),
        focus: clamp(preFocus + Math.round(shift * 0.6)),
        connectedness: clamp(preConnected + Math.round(shift * 0.4)),
        mental_activity: clamp(preMental - shift),
        physical_tension: clamp(preTension - Math.round(shift * 0.8)),
        safety: clamp(preSafety + Math.round(shift * 0.5)),
      },
      completed,
      completionRatio,
      skipPoints: completed ? [] : [Math.round(completionRatio * 600)],
      replays: next() > 0.86 ? 1 : 0,
      helpfulness,
      feltSafe: next() > 0.03,
      wouldRepeat: helpfulness >= 3 && next() > 0.12,
      freeText: FEEDBACK_POOL[Math.floor(next() * FEEDBACK_POOL.length)] ?? null,
      dislikes: next() > 0.78 ? [DISLIKE_POOL[Math.floor(next() * DISLIKE_POOL.length)]] : [],
      audioProblems:
        next() > 0.94 ? [AUDIO_PROBLEM_POOL[Math.floor(next() * AUDIO_PROBLEM_POOL.length)]] : [],
      context: {
        environment: isSleep ? "bed" : next() > 0.5 ? "quiet_room" : "office",
        timeOfDay: isSleep ? "night" : next() > 0.5 ? "evening" : "morning",
      },
      recordedAt: new Date(Date.UTC(2026, 6, 1 + (i % 36), 8 + (i % 12), (i * 7) % 60)).toISOString(),
    });
  }

  return outcomes;
}

function clamp(value: number) {
  return Math.max(0, Math.min(10, value));
}

export const SESSION_OUTCOMES: SessionOutcome[] = buildOutcomes();
