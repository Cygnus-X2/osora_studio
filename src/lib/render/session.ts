import "server-only";

import { randomUUID } from "node:crypto";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { analyseAudioFile, compareDuration } from "@/providers/audio/ffprobe";
import { assembleProject, renderSilence, type ClipSource } from "@/providers/audio/ffmpeg";
import { getTtsProvider, type TtsProviderId } from "@/providers/tts";
import { reconcileTimeline } from "@/domain/timeline/planner";
import { ensureBucket, storagePathFor } from "@/lib/paths";
import { envValue } from "@/lib/env";
import { saveTimeline, setAudioProject } from "@/lib/db/experiences";
import type { AudioAnalysis, Experience } from "@/domain/types";

/**
 * Renders a planned session into one playable file.
 *
 * The order matters and is the point of the whole system:
 *
 *   1. narrate each section separately, so each can be measured separately
 *   2. measure every clip — no estimate survives this step
 *   3. reconcile the timeline against what the audio actually is
 *   4. lay narration out at its *reconciled* positions
 *   5. put a bed underneath that is at least as long as the narration
 *   6. mix, fade, normalise
 *   7. measure the export too, because the mix can surprise you
 *
 * Nothing here trusts a requested duration at any stage.
 */

export interface RenderProgressStep {
  step: string;
  detail: string;
}

export interface RenderResult {
  ok: boolean;
  error?: string;
  steps: RenderProgressStep[];
  playbackUrl?: string;
  storagePath?: string;
  analysis?: AudioAnalysis;
  targetSeconds?: number;
  deltaSeconds?: number;
  narrationSeconds?: number;
  sectionsRendered?: number;
  costEstimateUsd?: number;
}

export async function renderSession(experience: Experience): Promise<RenderResult> {
  const steps: RenderProgressStep[] = [];
  const timeline = experience.timeline;
  if (!timeline) return { ok: false, error: "This session has no timeline yet.", steps };

  const spoken = timeline.sections.filter((s) => s.text.trim().length > 0);
  if (spoken.length === 0) {
    return {
      ok: false,
      error: "No section has any text. Generate the script before rendering.",
      steps,
    };
  }

  const ttsProvider = getTtsProvider(envValue("TTS_PROVIDER") as TtsProviderId | undefined);

  const generatedDir = await ensureBucket("generated");
  const processedDir = await ensureBucket("processed");
  const runId = randomUUID().slice(0, 8);

  let costEstimateUsd = 0;
  const measured: Record<string, number> = {};
  const clipFiles: Array<{ sectionId: string; filePath: string; seconds: number }> = [];

  // 1–2. Narrate and measure, section by section.
  const models = await ttsProvider.listModels();
  const speechModel = models.find((m) => m.textToSpeech);
  if (!speechModel) {
    return { ok: false, error: `Provider "${ttsProvider.id}" exposes no speech model.`, steps };
  }

  const voiceId = await resolveVoiceId(experience, ttsProvider);

  for (const section of spoken) {
    // Bracketed production directives are for the planner, not the voice.
    const spokenText = section.text.replace(/\[[^\]]*\]/g, " ").replace(/\s{2,}/g, " ").trim();
    if (!spokenText) continue;

    try {
      const generated = await ttsProvider.generateSpeech(spokenText, {
        voiceId,
        modelId: speechModel.id,
        stability: experience.settings.voiceStability,
        similarityBoost: 0.7,
        speakingRate: experience.settings.speakingRate,
        language: experience.settings.language,
        seed: null,
      });

      const filePath = path.join(
        generatedDir,
        `${runId}-${section.order.toString().padStart(2, "0")}.${generated.format}`,
      );
      await writeFile(filePath, generated.bytes);

      const analysis = await analyseAudioFile(filePath);
      measured[section.id] = analysis.durationSeconds;
      clipFiles.push({ sectionId: section.id, filePath, seconds: analysis.durationSeconds });
      costEstimateUsd += generated.costEstimateUsd;

      const drift = analysis.durationSeconds - section.estimatedSpeechSeconds;
      steps.push({
        step: `Narrated "${section.title}"`,
        detail: `estimated ${section.estimatedSpeechSeconds.toFixed(1)}s · measured ${analysis.durationSeconds.toFixed(1)}s (${drift >= 0 ? "+" : ""}${drift.toFixed(1)}s)`,
      });
    } catch (error) {
      return {
        ok: false,
        error: `Narration failed on "${section.title}": ${error instanceof Error ? error.message : "unknown error"}`,
        steps,
      };
    }
  }

  // 3. Reconcile — every estimate is replaced by a measurement.
  const reconciled = reconcileTimeline(timeline, measured);
  steps.push({
    step: "Timeline reconciled",
    detail: `planned ${formatSpan(timeline.totalSeconds)} → measured ${formatSpan(reconciled.totalSeconds)} against a ${formatSpan(reconciled.targetSeconds)} target`,
  });

  await saveTimeline(
    experience.id,
    reconciled,
    "Narration measured",
    `Every section re-timed from its rendered audio. ${clipFiles.length} clips.`,
  ).catch(() => undefined);

  // 4. Position each clip where the reconciled timeline puts it.
  const sources: ClipSource[] = [];
  for (const clip of clipFiles) {
    const section = reconciled.sections.find((s) => s.id === clip.sectionId);
    if (!section) continue;
    sources.push({
      clipId: clip.sectionId,
      filePath: clip.filePath,
      startSeconds: section.startSeconds,
      offsetSeconds: 0,
      durationSeconds: clip.seconds,
      gainDb: 0,
      fadeInSeconds: 0.3,
      fadeOutSeconds: 0.6,
    });
  }

  const totalSeconds = reconciled.totalSeconds;

  // 5. A bed at least as long as the narration. Short beds are a blocking
  //    flow-validation failure, so it is generated to the reconciled length
  //    rather than to what was originally planned.
  try {
    const soundModel = models.find((m) => m.ambientSound);
    let bedPath: string;
    let bedSeconds: number;

    if (soundModel) {
      const bed = await ttsProvider.generateAmbientSound({
        modelId: soundModel.id,
        prompt: `Continuous ${experience.settings.soundStyle.replace(/_/g, " ")} bed. No transients, no identifiable events.`,
        requestedDurationSeconds: Math.ceil(totalSeconds),
        intensity: experience.settings.soundIntensity,
        loopable: true,
        seed: null,
      });
      bedPath = path.join(generatedDir, `${runId}-bed.${bed.format}`);
      await writeFile(bedPath, bed.bytes);
      costEstimateUsd += bed.costEstimateUsd;

      const bedAnalysis = await analyseAudioFile(bedPath);
      bedSeconds = bedAnalysis.durationSeconds;
      steps.push({
        step: "Ambient bed generated",
        detail: `requested ${Math.ceil(totalSeconds)}s · measured ${bedSeconds.toFixed(1)}s`,
      });
    } else {
      // No sound model — lay down measured silence so the mix still has a
      // continuous floor and the narration is not sitting on nothing.
      bedPath = await renderSilence(Math.ceil(totalSeconds), path.join(generatedDir, `${runId}-bed.wav`));
      bedSeconds = (await analyseAudioFile(bedPath)).durationSeconds;
      steps.push({
        step: "Silent bed rendered",
        detail: `${bedSeconds.toFixed(1)}s — this provider has no ambient model`,
      });
    }

    sources.unshift({
      clipId: "bed",
      filePath: bedPath,
      startSeconds: 0,
      offsetSeconds: 0,
      durationSeconds: Math.min(bedSeconds, totalSeconds),
      // Well below the voice; the 12 dB gap is a validation rule.
      gainDb: -16,
      fadeInSeconds: experience.settings.fadeInSeconds,
      fadeOutSeconds: experience.settings.fadeOutSeconds,
    });
  } catch (error) {
    steps.push({
      step: "Ambient bed skipped",
      detail: error instanceof Error ? error.message : "generation failed",
    });
  }

  // 6. Mix.
  const outputPath = path.join(processedDir, `${experience.id}-${runId}.mp3`);
  try {
    await assembleProject({
      project: {
        id: runId,
        experienceId: experience.id,
        name: experience.title,
        targetSeconds: Math.round(reconciled.targetSeconds),
        arrangedSeconds: totalSeconds,
        loudnessTargetLufs: experience.settings.loudnessTargetLufs,
        tracks: [],
        exports: [],
        updatedAt: new Date().toISOString(),
      },
      sources,
      outputPath,
      format: "mp3",
      loudnessTargetLufs: experience.settings.loudnessTargetLufs,
      fadeOutSeconds: experience.settings.fadeOutSeconds,
      totalSeconds,
    });
    steps.push({
      step: "Mixed",
      detail: `${sources.length} sources · loudness normalised to ${experience.settings.loudnessTargetLufs} LUFS`,
    });
  } catch (error) {
    return {
      ok: false,
      error: `Assembly failed: ${error instanceof Error ? error.message : "unknown error"}`,
      steps,
    };
  }

  // 7. Measure the export. The mix can differ from the sum of its parts.
  let analysis: AudioAnalysis;
  try {
    analysis = await analyseAudioFile(outputPath, { measureLevels: true });
  } catch (error) {
    return {
      ok: false,
      error: `The mix was produced but could not be measured, so it is not usable: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      steps,
    };
  }

  const comparison = compareDuration(Math.round(reconciled.targetSeconds), analysis, 30);
  steps.push({
    step: "Export measured",
    detail: `${analysis.durationSeconds.toFixed(1)}s · ${analysis.loudnessLufs ?? "?"} LUFS · peak ${analysis.peakDb ?? "?"} dB`,
  });

  const fileName = path.basename(outputPath);
  await setAudioProject(experience.id, runId).catch(() => undefined);

  return {
    ok: true,
    steps,
    playbackUrl: `/api/audio/file/${encodeURIComponent(fileName)}`,
    storagePath: storagePathFor("processed", fileName),
    analysis,
    targetSeconds: Math.round(reconciled.targetSeconds),
    deltaSeconds: comparison.deltaSeconds ?? undefined,
    narrationSeconds: Object.values(measured).reduce((a, b) => a + b, 0),
    sectionsRendered: clipFiles.length,
    costEstimateUsd: Number(costEstimateUsd.toFixed(4)),
  };
}

/**
 * The studio's voice ids are internal names, not provider ids. Ask the provider
 * what it actually has rather than sending it something it cannot resolve and
 * discovering that halfway through a render.
 */
async function resolveVoiceId(
  experience: Experience,
  provider: ReturnType<typeof getTtsProvider>,
): Promise<string> {
  const configured = envValue("TTS_DEFAULT_VOICE_ID") ?? experience.settings.voiceId;
  try {
    const voices = await provider.listVoices();
    if (voices.some((v) => v.id === configured)) return configured;
    const mapped = voices.find(
      (v) => v.name.toLowerCase() === experience.settings.voiceId.replace("voice-", ""),
    );
    return mapped?.id ?? voices[0]?.id ?? configured;
  } catch {
    return configured;
  }
}

function formatSpan(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
