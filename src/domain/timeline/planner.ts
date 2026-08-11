import { INTERVENTION_BY_KEY } from "@/domain/interventions/library";
import { MECHANISM_BY_KEY } from "@/domain/mechanisms/library";
import type {
  OsoraDnaProfile,
  SectionKind,
  SectionTimeline,
  SessionPlan,
  TimelineSection,
} from "@/domain/types";

/**
 * Deterministic timeline planning.
 *
 * The composer never asks a model for "a ten-minute meditation". It computes
 * an explicit timing plan first — start, end, pause, sound-only and a word
 * budget per section — and the model then writes text to fit those budgets.
 * After narration exists, `reconcileTimeline` replaces every estimate with a
 * measured duration and re-derives the whole arrangement.
 */

/** Default narration pace. Slow by design; this is not audiobook delivery. */
export const DEFAULT_WORDS_PER_MINUTE = 105;

/** Speaking-rate bounds. Outside these, flow suffers more than it gains. */
export const MIN_SPEAKING_RATE = 0.9;
export const MAX_SPEAKING_RATE = 1.1;

export function estimateSpeechSeconds(
  wordCount: number,
  wordsPerMinute = DEFAULT_WORDS_PER_MINUTE,
  speakingRate = 1,
): number {
  if (wordCount <= 0) return 0;
  return round((wordCount / (wordsPerMinute * speakingRate)) * 60, 1);
}

export function wordsForSeconds(
  seconds: number,
  wordsPerMinute = DEFAULT_WORDS_PER_MINUTE,
  speakingRate = 1,
): number {
  return Math.max(0, Math.round((seconds / 60) * wordsPerMinute * speakingRate));
}

export function countWords(text: string): number {
  // Bracketed production directives are not spoken.
  const spoken = text.replace(/\[[^\]]*\]/g, " ");
  const matches = spoken.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

/** Extracts `[pause 8]` / `[silence 90]` / `[sound_only 60]` directives. */
export function extractDirectiveSeconds(text: string): {
  pauseSeconds: number;
  silenceSeconds: number;
  soundOnlySeconds: number;
} {
  const sum = (pattern: RegExp) => {
    let total = 0;
    for (const match of text.matchAll(pattern)) total += Number(match[1]) || 0;
    return total;
  };
  return {
    pauseSeconds: sum(/\[pause\s+(\d+(?:\.\d+)?)\]/gi),
    silenceSeconds: sum(/\[silence\s+(\d+(?:\.\d+)?)\]/gi),
    soundOnlySeconds: sum(/\[sound_only\s+(\d+(?:\.\d+)?)\]/gi),
  };
}

const SECTION_TITLES: Record<SectionKind, string> = {
  intention: "Session intention",
  opening: "Opening",
  orientation: "Orientation",
  main: "Main intervention",
  transition: "Transition",
  breath: "Breath instructions",
  body: "Body instructions",
  reflection: "Reflection",
  silence: "Silence",
  sound_only: "Sound only",
  closing: "Closing",
  aftercare: "Aftercare",
  rationale: "Scientific rationale",
  contraindications: "Contraindications",
};

export function sectionTitle(kind: SectionKind): string {
  return SECTION_TITLES[kind];
}

/** Seconds of handover between two spoken sections. */
const TRANSITION_SECONDS = 4;

export interface PlanTimelineOptions {
  wordsPerMinute?: number;
  speakingRate?: number;
  /** Seconds of ambience before the first word. */
  leadInSeconds?: number;
}

/**
 * Turns a frozen SessionPlan into an explicit second-by-second arrangement.
 * Every section gets a word budget derived from its speaking time, so the
 * composer physically cannot overrun the plan.
 */
export function planTimeline(
  plan: SessionPlan,
  dna: OsoraDnaProfile,
  options: PlanTimelineOptions = {},
): SectionTimeline {
  const wpm = options.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE;
  const rate = options.speakingRate ?? 1;
  const leadIn = options.leadInSeconds ?? 8;

  const sections: TimelineSection[] = [];
  let cursor = 0;
  let order = 0;

  // `startSeconds` / `endSeconds` on the input are placeholders; the cursor
  // below is what actually decides where a section sits.
  const push = (section: Omit<TimelineSection, "order">) => {
    order += 1;
    const total =
      section.estimatedSpeechSeconds +
      section.pauseSeconds +
      section.soundOnlySeconds +
      section.transitionSeconds;
    const entry: TimelineSection = {
      ...section,
      order,
      startSeconds: round(cursor, 1),
      endSeconds: round(cursor + total, 1),
    };
    cursor += total;
    sections.push(entry);
    return entry;
  };

  // Arrival: ambience before anything is said. Part of the stable DNA opening.
  push({
    id: "section-arrival",
    kind: "opening",
    title: "Arrival",
    mechanism: null,
    interventionKey: null,
    evidenceSourceIds: [],
    reviewStatus: "draft",
    text: "",
    wordCount: 0,
    wordBudget: 0,
    estimatedSpeechSeconds: 0,
    actualSpeechSeconds: null,
    pauseSeconds: 0,
    soundOnlySeconds: leadIn,
    transitionSeconds: 0,
    startSeconds: 0,
    endSeconds: 0,
  });

  const blocks = plan.sequence;
  blocks.forEach((block, index) => {
    const intervention = block.interventionKey
      ? INTERVENTION_BY_KEY[block.interventionKey]
      : undefined;
    const mechanism = MECHANISM_BY_KEY[block.mechanism];
    const isLast = index === blocks.length - 1;

    const pauseRatio = intervention?.pausePattern.pauseRatio ?? 0.45;
    const transitionSeconds = isLast ? 0 : TRANSITION_SECONDS;
    const usable = Math.max(0, block.seconds - transitionSeconds);

    // Silence and sound-only blocks carry no narration at all.
    const isSilence = block.sectionKind === "silence" || block.mechanism === "silence";
    const isSoundOnly = intervention?.key === "ambient-passage";

    if (isSilence || isSoundOnly) {
      push({
        id: `section-${block.order}-${block.mechanism}`,
        kind: isSoundOnly ? "sound_only" : "silence",
        title: intervention?.name ?? sectionTitle(block.sectionKind),
        mechanism: block.mechanism,
        interventionKey: block.interventionKey,
        evidenceSourceIds: intervention?.supportingSourceIds ?? mechanism?.supportingSourceIds ?? [],
        reviewStatus: "draft",
        text: "",
        wordCount: 0,
        wordBudget: isSilence ? 12 : 0,
        estimatedSpeechSeconds: 0,
        actualSpeechSeconds: null,
        pauseSeconds: isSilence ? usable : 0,
        soundOnlySeconds: isSoundOnly ? usable : 0,
        transitionSeconds,
        startSeconds: 0,
        endSeconds: 0,
      });
      return;
    }

    const pauseSeconds = round(usable * pauseRatio, 1);
    const speechSeconds = round(usable - pauseSeconds, 1);

    push({
      id: `section-${block.order}-${block.mechanism}`,
      kind: block.sectionKind,
      title: intervention?.name ?? sectionTitle(block.sectionKind),
      mechanism: block.mechanism,
      interventionKey: block.interventionKey,
      evidenceSourceIds: intervention?.supportingSourceIds ?? mechanism?.supportingSourceIds ?? [],
      reviewStatus: "draft",
      text: "",
      wordCount: 0,
      wordBudget: wordsForSeconds(speechSeconds, wpm, rate),
      estimatedSpeechSeconds: speechSeconds,
      actualSpeechSeconds: null,
      pauseSeconds,
      soundOnlySeconds: 0,
      transitionSeconds,
      startSeconds: 0,
      endSeconds: 0,
    });
  });

  // Closing tail: final silence under the fade. A stable DNA element.
  const hasClosing = sections.some((s) => s.kind === "closing");
  if (!hasClosing && dna.rules.lockedSections.includes("closing")) {
    push({
      id: "section-closing-tail",
      kind: "closing",
      title: "Closing",
      mechanism: "progressive_guidance_reduction",
      interventionKey: "stepping-back-close",
      evidenceSourceIds: ["src-osora-note-structure"],
      reviewStatus: "draft",
      text: "",
      wordCount: 0,
      wordBudget: wordsForSeconds(30, wpm, rate),
      estimatedSpeechSeconds: 30,
      actualSpeechSeconds: null,
      pauseSeconds: 30,
      soundOnlySeconds: 15,
      transitionSeconds: 0,
      startSeconds: 0,
      endSeconds: 0,
    });
  }

  return normaliseToTarget(
    { targetSeconds: plan.durationSeconds, totalSeconds: round(cursor, 1), reconciled: false, sections },
    plan.durationSeconds,
    wpm,
    rate,
  );
}

/**
 * Scales pause and sound-only time (never speech) so the arrangement lands on
 * the target. Speech is left alone because compressing it is what makes a
 * session feel rushed.
 */
function normaliseToTarget(
  timeline: SectionTimeline,
  targetSeconds: number,
  wpm: number,
  rate: number,
): SectionTimeline {
  const drift = targetSeconds - timeline.totalSeconds;
  if (Math.abs(drift) < 1) return recomputeBounds(timeline, wpm, rate);

  const flexible = timeline.sections.reduce(
    (sum, s) => sum + s.pauseSeconds + s.soundOnlySeconds,
    0,
  );
  if (flexible <= 0) return recomputeBounds(timeline, wpm, rate);

  const factor = (flexible + drift) / flexible;
  const sections = timeline.sections.map((s) => ({
    ...s,
    pauseSeconds: round(s.pauseSeconds * factor, 1),
    soundOnlySeconds: round(s.soundOnlySeconds * factor, 1),
  }));

  return recomputeBounds({ ...timeline, sections }, wpm, rate);
}

/** Re-derives start/end/total from each section's own durations. */
export function recomputeBounds(
  timeline: SectionTimeline,
  wpm = DEFAULT_WORDS_PER_MINUTE,
  rate = 1,
): SectionTimeline {
  let cursor = 0;
  const sections = timeline.sections.map((section) => {
    const speech = section.actualSpeechSeconds ?? section.estimatedSpeechSeconds;
    const total = speech + section.pauseSeconds + section.soundOnlySeconds + section.transitionSeconds;
    const entry: TimelineSection = {
      ...section,
      wordBudget: section.wordBudget || wordsForSeconds(section.estimatedSpeechSeconds, wpm, rate),
      startSeconds: round(cursor, 1),
      endSeconds: round(cursor + total, 1),
    };
    cursor += total;
    return entry;
  });

  return {
    ...timeline,
    sections,
    totalSeconds: round(cursor, 1),
    reconciled: sections
      .filter((s) => s.wordCount > 0)
      .every((s) => s.actualSpeechSeconds !== null),
  };
}

/**
 * Replaces estimated speech durations with measured ones and re-derives the
 * arrangement. This is the only place the timeline is allowed to learn the
 * truth about how long narration actually is.
 */
export function reconcileTimeline(
  timeline: SectionTimeline,
  measured: Record<string, number>,
): SectionTimeline {
  const sections = timeline.sections.map((section) => {
    const actual = measured[section.id];
    return actual === undefined ? section : { ...section, actualSpeechSeconds: round(actual, 1) };
  });
  return recomputeBounds({ ...timeline, sections });
}

export interface TimelineDrift {
  targetSeconds: number;
  actualSeconds: number;
  deltaSeconds: number;
  withinTolerance: boolean;
  /** Ordered by preference — speeding up narration is deliberately last. */
  remedies: Array<{ key: string; label: string; detail: string }>;
}

/**
 * Reports how far the arrangement is from target and what may be done about
 * it. Speaking-rate change is offered last and bounded, because compressing
 * narration damages the flow the plan was built for.
 */
export function analyseDrift(timeline: SectionTimeline, toleranceSeconds = 30): TimelineDrift {
  const delta = round(timeline.totalSeconds - timeline.targetSeconds, 1);
  const remedies: TimelineDrift["remedies"] = [];

  if (delta > toleranceSeconds) {
    const excessWords = wordsForSeconds(delta);
    remedies.push({
      key: "reduce_text",
      label: "Reduce text",
      detail: `Remove roughly ${excessWords} words across the longest sections.`,
    });
    remedies.push({
      key: "adjust_pauses",
      label: "Shorten pauses",
      detail: `Trim ${Math.round(delta)}s of pause time, keeping each pause above its intervention minimum.`,
    });
    remedies.push({
      key: "regenerate",
      label: "Regenerate narration",
      detail: "Re-run generation with a tighter word budget for the overrunning sections.",
    });
    remedies.push({
      key: "speaking_rate",
      label: "Adjust speaking rate",
      detail: `Bounded to ${MIN_SPEAKING_RATE}–${MAX_SPEAKING_RATE}×. Never auto-applied — it changes the intended pacing.`,
    });
    remedies.push({
      key: "extend_target",
      label: "Increase total duration",
      detail: `Move the target to ${formatSeconds(timeline.totalSeconds)}.`,
    });
  } else if (delta < -toleranceSeconds) {
    remedies.push({
      key: "extend_pauses",
      label: "Lengthen pauses",
      detail: `Add ${Math.round(Math.abs(delta))}s of pause, respecting each intervention's maximum.`,
    });
    remedies.push({
      key: "extend_silence",
      label: "Extend the silence block",
      detail: "Silence absorbs additional time without changing the intervention mix.",
    });
    remedies.push({
      key: "shorten_target",
      label: "Reduce total duration",
      detail: `Move the target to ${formatSeconds(timeline.totalSeconds)}.`,
    });
  }

  return {
    targetSeconds: timeline.targetSeconds,
    actualSeconds: timeline.totalSeconds,
    deltaSeconds: delta,
    withinTolerance: Math.abs(delta) <= toleranceSeconds,
    remedies,
  };
}

export function formatSeconds(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const minutes = Math.floor(abs / 60);
  const rest = abs - minutes * 60;
  const whole = Math.floor(rest);
  const tenths = Math.round((rest - whole) * 10);
  const secondsLabel =
    tenths > 0 ? `${String(whole).padStart(2, "0")}.${tenths}` : String(whole).padStart(2, "0");
  return `${sign}${minutes}:${secondsLabel.padStart(2, "0")}`;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
