import { INTERVENTION_BY_KEY } from "@/domain/interventions/library";
import { EVIDENCE_WEIGHT } from "@/domain/types";
import { MECHANISM_BY_KEY } from "@/domain/mechanisms/library";
import { detectClaims } from "@/domain/safety/claims";
import { countWords, formatSeconds } from "@/domain/timeline/planner";
import type {
  AudioProject,
  FlowAnalysis,
  FlowCheck,
  OsoraDnaProfile,
  SectionTimeline,
  SessionPlan,
} from "@/domain/types";

/**
 * Flow validation.
 *
 * These scores are editorial support. They describe how a session is arranged
 * — pacing, density, balance, structural drift — and they are explicitly not
 * a measure of therapeutic quality or medical truth.
 */

export interface FlowInput {
  plan: SessionPlan;
  timeline: SectionTimeline;
  dna: OsoraDnaProfile;
  audioProject: AudioProject | null;
  fadeOutSeconds: number;
  narrationVolumeDb: number;
  ambientVolumeDb: number;
}

export function validateFlow(input: FlowInput, analysedAt: string): FlowAnalysis {
  const { timeline, plan, dna } = input;
  const checks: FlowCheck[] = [];
  const warnings: string[] = [];
  const blockingErrors: string[] = [];
  const suggestions: string[] = [];

  const spokenSections = timeline.sections.filter((s) => s.wordCount > 0);
  const totalWords = spokenSections.reduce((sum, s) => sum + s.wordCount, 0);
  const speechSeconds = timeline.sections.reduce(
    (sum, s) => sum + (s.actualSpeechSeconds ?? s.estimatedSpeechSeconds),
    0,
  );
  const pauseSeconds = timeline.sections.reduce((sum, s) => sum + s.pauseSeconds, 0);
  const soundOnlySeconds = timeline.sections.reduce((sum, s) => sum + s.soundOnlySeconds, 0);
  const total = timeline.totalSeconds || 1;

  /* -------- Timing -------- */

  const delta = timeline.totalSeconds - timeline.targetSeconds;
  const timingOk = Math.abs(delta) <= 30;
  checks.push({
    key: "total_duration",
    label: "Total duration",
    value: `${formatSeconds(timeline.totalSeconds)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}s)`,
    status: timingOk ? "ok" : "blocking",
    detail: `Target ${formatSeconds(timeline.targetSeconds)}, tolerance ±30s.`,
  });
  if (!timingOk) {
    blockingErrors.push(
      `Duration is ${delta > 0 ? "over" : "under"} target by ${Math.abs(delta).toFixed(1)}s.`,
    );
  }

  const firstInstruction = timeline.sections.find((s) => s.wordCount > 0);
  const timeToFirstWord = firstInstruction?.startSeconds ?? 0;
  const openingOk = timeToFirstWord >= 5;
  checks.push({
    key: "time_to_first_instruction",
    label: "Time before the first word",
    value: `${timeToFirstWord.toFixed(1)}s`,
    status: openingOk ? "ok" : "warning",
    detail: "The session should breathe before it speaks. At least 5 seconds.",
  });
  if (!openingOk) warnings.push("The voice enters too quickly at the start.");

  const denseOpening = timeline.sections.filter(
    (s) =>
      s.startSeconds < 20 &&
      s.interventionKey &&
      INTERVENTION_BY_KEY[s.interventionKey]?.guidanceDensity === "dense",
  );
  checks.push({
    key: "opening_pace",
    label: "Opening pace",
    value: denseOpening.length === 0 ? "Gentle" : `${denseOpening.length} dense block(s)`,
    status: denseOpening.length === 0 ? "ok" : "warning",
    detail: "No complex instruction inside the first 20 seconds.",
  });
  if (denseOpening.length > 0) {
    warnings.push("A dense instruction block sits inside the opening 20 seconds.");
    suggestions.push("Move dense guidance after orientation and let arrival hold the opening.");
  }

  /* -------- Voice pacing -------- */

  const wpm = speechSeconds > 0 ? (totalWords / speechSeconds) * 60 : 0;
  const wpmOk = wpm >= 85 && wpm <= 125;
  checks.push({
    key: "words_per_minute",
    label: "Words per minute",
    value: wpm.toFixed(0),
    status: wpmOk ? "ok" : "warning",
    detail: "Osora narration sits between 85 and 125 wpm.",
  });
  if (!wpmOk && wpm > 0) {
    warnings.push(`Narration runs at ${wpm.toFixed(0)} wpm, outside the 85–125 range.`);
    suggestions.push(
      wpm > 125
        ? "Reduce text rather than slowing the voice; the section is carrying too many words."
        : "Either add a little text or shorten the section — the pace reads as hesitant.",
    );
  }

  const sentences = spokenSections.flatMap((s) =>
    s.text
      .replace(/\[[^\]]*\]/g, " ")
      .split(/[.!?]+/)
      .map((t) => t.trim())
      .filter(Boolean),
  );
  const meanSentenceWords = sentences.length
    ? sentences.reduce((sum, s) => sum + countWords(s), 0) / sentences.length
    : 0;
  const sentenceOk = meanSentenceWords > 0 && meanSentenceWords <= 16;
  checks.push({
    key: "sentence_length",
    label: "Mean sentence length",
    value: `${meanSentenceWords.toFixed(1)} words`,
    status: sentenceOk ? "ok" : "warning",
    detail: "Long sentences are hard to follow with the eyes closed. Target ≤ 16 words.",
  });
  if (!sentenceOk && meanSentenceWords > 0) {
    warnings.push(`Mean sentence length is ${meanSentenceWords.toFixed(1)} words.`);
  }

  const instructionDensity = speechSeconds > 0 ? (sentences.length / speechSeconds) * 60 : 0;
  checks.push({
    key: "instruction_density",
    label: "Instruction density",
    value: `${instructionDensity.toFixed(1)} / min`,
    status: instructionDensity <= 9 ? "ok" : "warning",
    detail: "More than nine statements a minute leaves no room to follow them.",
  });
  if (instructionDensity > 9) warnings.push("Instruction density is high for a settling session.");

  const pauseCount = timeline.sections.filter((s) => s.pauseSeconds > 0).length;
  checks.push({
    key: "pause_frequency",
    label: "Pause frequency",
    value: `${pauseCount} section(s) with pause`,
    status: pauseCount >= Math.ceil(timeline.sections.length / 2) ? "ok" : "warning",
    detail: "At least half the sections should carry deliberate pause time.",
  });

  const meanPause = pauseCount > 0 ? pauseSeconds / pauseCount : 0;
  checks.push({
    key: "pause_duration",
    label: "Mean pause per section",
    value: `${meanPause.toFixed(1)}s`,
    status: meanPause >= 5 ? "ok" : "warning",
    detail: "Short pauses read as gaps rather than as space.",
  });

  const breathBlock = plan.sequence.find((b) =>
    ["extended_exhalation", "breath_awareness", "rhythmic_entrainment"].includes(b.mechanism),
  );
  if (breathBlock) {
    const cycles = breathBlock.seconds / 10;
    checks.push({
      key: "breathing_cycle",
      label: "Breathing cycles available",
      value: `${cycles.toFixed(0)} cycles`,
      status: cycles >= 6 ? "ok" : "warning",
      detail: "A breath block needs at least six slow cycles to settle into.",
    });
    if (cycles < 6) warnings.push("The breath block is too short to establish a rhythm.");
  }

  /* -------- Sound balance -------- */

  const silenceRatio = (pauseSeconds + soundOnlySeconds) / total;
  const [silenceMin, silenceMax] = dna.adaptive.silenceRatioRange;
  const silenceOk = silenceRatio >= silenceMin && silenceRatio <= silenceMax;
  checks.push({
    key: "silence_ratio",
    label: "Silence ratio",
    value: `${(silenceRatio * 100).toFixed(0)}%`,
    status: silenceOk ? "ok" : "warning",
    detail: `Osora DNA band is ${(silenceMin * 100).toFixed(0)}–${(silenceMax * 100).toFixed(0)}%.`,
  });
  if (!silenceOk) warnings.push(`Silence ratio ${(silenceRatio * 100).toFixed(0)}% is outside the DNA band.`);

  const narrationRatio = speechSeconds / total;
  checks.push({
    key: "narration_to_sound",
    label: "Narration share",
    value: `${(narrationRatio * 100).toFixed(0)}%`,
    status: narrationRatio <= 0.6 ? "ok" : "warning",
    detail: "Above 60% narration the session becomes a talk rather than a practice.",
  });

  const levelGap = input.narrationVolumeDb - input.ambientVolumeDb;
  checks.push({
    key: "level_gap",
    label: "Narration over ambient",
    value: `${levelGap.toFixed(1)} dB`,
    status: levelGap >= 12 ? "ok" : "warning",
    detail: "The bed must sit at least 12 dB below the voice.",
  });
  if (levelGap < 12) {
    warnings.push("The ambient bed is close enough to the voice to compete with it.");
    suggestions.push("Lower the ambient track by a few dB.");
  }

  checks.push({
    key: "final_fade",
    label: "Final fade",
    value: `${input.fadeOutSeconds}s`,
    status: input.fadeOutSeconds >= 10 ? "ok" : "warning",
    detail: "A short fade at the end undoes the settling the session just built.",
  });
  if (input.fadeOutSeconds < 10) warnings.push("The final fade is short for a settling session.");

  const lastSection = timeline.sections[timeline.sections.length - 1];
  const finalSilence = lastSection ? lastSection.pauseSeconds + lastSection.soundOnlySeconds : 0;
  checks.push({
    key: "final_silence",
    label: "Final silence",
    value: `${finalSilence.toFixed(1)}s`,
    status: finalSilence >= 10 ? "ok" : "warning",
    detail: "The session should end in quiet, not on a word.",
  });

  /* -------- Audio arrangement -------- */

  if (input.audioProject) {
    const project = input.audioProject;
    const narration = project.tracks.find((t) => t.kind === "narration");
    const ambient = project.tracks.find((t) => t.kind === "ambient");

    const narrationEnd = trackEnd(narration?.clips ?? []);
    const ambientEnd = trackEnd(ambient?.clips ?? []);
    const bedCovers = ambientEnd >= narrationEnd - 0.5;
    checks.push({
      key: "bed_covers_narration",
      label: "Bed covers narration",
      value: bedCovers ? "Yes" : `Ends ${(narrationEnd - ambientEnd).toFixed(1)}s early`,
      status: bedCovers ? "ok" : "blocking",
      detail: "Background audio must not stop before the last word.",
    });
    if (!bedCovers) blockingErrors.push("The ambient bed ends before the narration does.");

    const overlaps = findOverlaps(project);
    checks.push({
      key: "clip_overlap",
      label: "Unexpected clip overlap",
      value: overlaps.length === 0 ? "None" : `${overlaps.length}`,
      status: overlaps.length === 0 ? "ok" : "warning",
      detail: "Clips on the same track should not overlap unless crossfaded.",
    });
    if (overlaps.length) {
      warnings.push(`${overlaps.length} overlapping clip pair(s) on a single track.`);
    }

    const loopGaps = (ambient?.clips ?? []).filter((c) => c.loop && c.fadeInSeconds < 0.5);
    checks.push({
      key: "loop_gaps",
      label: "Audible loop seams",
      value: loopGaps.length === 0 ? "None" : `${loopGaps.length} clip(s)`,
      status: loopGaps.length === 0 ? "ok" : "warning",
      detail: "Looped beds need a short crossfade to hide the seam.",
    });
    if (loopGaps.length) suggestions.push("Add a 0.5s crossfade to looped ambient clips.");

    const jumps = project.tracks.flatMap((track) =>
      track.clips.filter((c) => Math.abs(c.gainDb) > 6 && c.fadeInSeconds < 0.3),
    );
    checks.push({
      key: "volume_jumps",
      label: "Sudden volume changes",
      value: jumps.length === 0 ? "None" : `${jumps.length}`,
      status: jumps.length === 0 ? "ok" : "warning",
      detail: "Large gain changes need a fade to avoid a startle.",
    });
    if (jumps.length) warnings.push("A clip changes level sharply without a fade.");
  }

  /* -------- Emotional intensity curve -------- */

  const curve = timeline.sections.map((s) => intensityOf(s.kind));
  const peakIndex = curve.indexOf(Math.max(...curve));
  const peakPosition = curve.length > 1 ? peakIndex / (curve.length - 1) : 0.5;
  const curveOk = peakPosition >= 0.3 && peakPosition <= 0.75;
  checks.push({
    key: "intensity_curve",
    label: "Intensity curve",
    value: `Peak at ${(peakPosition * 100).toFixed(0)}%`,
    status: curveOk ? "ok" : "warning",
    detail: "The most demanding moment belongs in the middle, not at either edge.",
  });
  if (!curveOk) warnings.push("The intensity peak sits at the edge of the session.");

  const abruptTransitions = timeline.sections.filter(
    (s, i) => i > 0 && s.transitionSeconds === 0 && s.wordCount > 0 && timeline.sections[i - 1].wordCount > 0,
  );
  checks.push({
    key: "transition_quality",
    label: "Transitions",
    value: abruptTransitions.length === 0 ? "Smooth" : `${abruptTransitions.length} abrupt`,
    status: abruptTransitions.length === 0 ? "ok" : "info",
    detail: "Spoken sections should be separated by a short handover.",
  });

  /* -------- Scores -------- */

  const timingScore = clamp01(1 - Math.abs(delta) / 90) * 0.6 + (openingOk ? 0.4 : 0.1);
  const pacingScore =
    (wpmOk ? 0.4 : 0.15) +
    (sentenceOk ? 0.3 : 0.1) +
    (instructionDensity <= 9 ? 0.3 : 0.1);
  const soundScore =
    (silenceOk ? 0.4 : 0.15) + (levelGap >= 12 ? 0.35 : 0.1) + (input.fadeOutSeconds >= 10 ? 0.25 : 0.1);
  const familiarityScore = clamp01(
    1 - Math.abs(plan.familiarityRatio - dna.rules.defaultFamiliarityRatio) / 0.35,
  );

  const evidenceWeighted =
    plan.mechanisms.reduce((sum, m) => sum + EVIDENCE_WEIGHT[m.evidenceLevel] * m.share, 0) /
    (plan.mechanisms.reduce((sum, m) => sum + m.share, 0) || 1);
  const script = timeline.sections.map((s) => s.text).join("\n");
  const claims = detectClaims(script);
  const blockingClaims = claims.filter((c) => c.pattern.severity === "blocking");
  const scientificScore = clamp01(evidenceWeighted - blockingClaims.length * 0.25);

  const contraindicationCount = plan.sequence.reduce((sum, b) => {
    const mech = MECHANISM_BY_KEY[b.mechanism]?.contraindications.length ?? 0;
    const inter = b.interventionKey
      ? (INTERVENTION_BY_KEY[b.interventionKey]?.contraindications.length ?? 0)
      : 0;
    return sum + mech + inter;
  }, 0);
  const safetyScore = clamp01(
    1 - blockingClaims.length * 0.4 - (plan.warnings.length > 3 ? 0.15 : 0) +
      (contraindicationCount > 0 ? 0.05 : 0),
  );

  for (const claim of blockingClaims) {
    blockingErrors.push(`Prohibited claim "${claim.match}" — ${claim.pattern.explanation}`);
  }

  const scores = {
    timing: round(timingScore),
    voicePacing: round(pacingScore),
    soundBalance: round(soundScore),
    familiarity: round(familiarityScore),
    scientificQuality: round(scientificScore),
    safety: round(safetyScore),
    overall: 0,
  };
  scores.overall = round(
    scores.timing * 0.2 +
      scores.voicePacing * 0.2 +
      scores.soundBalance * 0.15 +
      scores.familiarity * 0.15 +
      scores.scientificQuality * 0.15 +
      scores.safety * 0.15,
  );

  return { scores, checks, warnings, blockingErrors, suggestions, analysedAt };
}

function intensityOf(kind: string): number {
  const map: Record<string, number> = {
    opening: 0.2,
    orientation: 0.3,
    breath: 0.5,
    body: 0.6,
    main: 0.9,
    silence: 0.4,
    reflection: 0.5,
    sound_only: 0.3,
    closing: 0.15,
    transition: 0.3,
  };
  return map[kind] ?? 0.4;
}

function trackEnd(clips: Array<{ startSeconds: number; durationSeconds: number }>): number {
  return clips.reduce((max, c) => Math.max(max, c.startSeconds + c.durationSeconds), 0);
}

function findOverlaps(project: AudioProject) {
  const overlaps: Array<[string, string]> = [];
  for (const track of project.tracks) {
    const sorted = [...track.clips].sort((a, b) => a.startSeconds - b.startSeconds);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      const previousEnd = previous.startSeconds + previous.durationSeconds;
      // A crossfade is a deliberate overlap; anything more is not.
      const tolerated = Math.max(previous.fadeOutSeconds, current.fadeInSeconds);
      if (current.startSeconds < previousEnd - tolerated - 0.01) {
        overlaps.push([previous.id, current.id]);
      }
    }
  }
  return overlaps;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
function round(value: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
