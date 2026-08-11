import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { envOr } from "@/lib/env";
import type { AudioProject } from "@/domain/types";

const run = promisify(execFile);
const FFMPEG = envOr("FFMPEG_PATH", "ffmpeg");

/**
 * Audio assembly.
 *
 * Builds a deterministic ffmpeg filter graph from the Audio Lab arrangement:
 * each clip is delayed to its start, trimmed, faded, gain-staged, then mixed
 * per track and finally loudness-normalised to the project target.
 *
 * `buildFilterGraph` is pure so it can be inspected and tested without
 * touching the filesystem — the studio shows it in the export panel, which
 * makes an export reviewable rather than magic.
 */

export interface ClipSource {
  clipId: string;
  filePath: string;
  startSeconds: number;
  offsetSeconds: number;
  durationSeconds: number;
  gainDb: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export interface AssembleOptions {
  project: AudioProject;
  sources: ClipSource[];
  outputPath: string;
  format: "mp3" | "wav";
  loudnessTargetLufs: number;
  fadeOutSeconds: number;
  totalSeconds: number;
}

export function buildFilterGraph(options: AssembleOptions): {
  inputs: string[];
  filterComplex: string;
} {
  const inputs: string[] = [];
  const chains: string[] = [];
  const labels: string[] = [];

  options.sources.forEach((source, index) => {
    inputs.push("-i", source.filePath);
    const label = `c${index}`;
    const parts = [
      `atrim=start=${source.offsetSeconds}:duration=${source.durationSeconds}`,
      "asetpts=PTS-STARTPTS",
      `adelay=${Math.round(source.startSeconds * 1000)}:all=1`,
      `volume=${source.gainDb}dB`,
    ];
    if (source.fadeInSeconds > 0) {
      parts.push(`afade=t=in:st=${source.startSeconds}:d=${source.fadeInSeconds}`);
    }
    if (source.fadeOutSeconds > 0) {
      const fadeStart = source.startSeconds + source.durationSeconds - source.fadeOutSeconds;
      parts.push(`afade=t=out:st=${Math.max(0, fadeStart)}:d=${source.fadeOutSeconds}`);
    }
    chains.push(`[${index}:a]${parts.join(",")}[${label}]`);
    labels.push(`[${label}]`);
  });

  const masterFade =
    options.fadeOutSeconds > 0
      ? `,afade=t=out:st=${Math.max(0, options.totalSeconds - options.fadeOutSeconds)}:d=${options.fadeOutSeconds}`
      : "";

  const mix =
    labels.length > 0
      ? `${labels.join("")}amix=inputs=${labels.length}:normalize=0:dropout_transition=0` +
        `${masterFade},loudnorm=I=${options.loudnessTargetLufs}:TP=-1.5:LRA=11[out]`
      : "";

  return { inputs, filterComplex: [...chains, mix].filter(Boolean).join(";") };
}

export async function assembleProject(options: AssembleOptions): Promise<string> {
  if (options.sources.length === 0) {
    throw new Error("Nothing to assemble — the project has no placed clips.");
  }

  const { inputs, filterComplex } = buildFilterGraph(options);
  const codec =
    options.format === "mp3"
      ? ["-codec:a", "libmp3lame", "-b:a", "192k"]
      : ["-codec:a", "pcm_s16le"];

  await run(
    FFMPEG,
    [
      "-hide_banner",
      "-y",
      ...inputs,
      "-filter_complex",
      filterComplex,
      "-map",
      "[out]",
      ...codec,
      options.outputPath,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );

  return options.outputPath;
}

/** Renders exactly `seconds` of digital silence — used for silence clips. */
export async function renderSilence(
  seconds: number,
  outputPath: string,
  sampleRate = 44_100,
): Promise<string> {
  await run(FFMPEG, [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `anullsrc=channel_layout=mono:sample_rate=${sampleRate}`,
    "-t",
    String(seconds),
    "-codec:a",
    "pcm_s16le",
    outputPath,
  ]);
  return outputPath;
}
