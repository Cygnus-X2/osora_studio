import "server-only";

import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { envOr } from "@/lib/env";
import type { AudioAnalysis } from "@/domain/types";

const run = promisify(execFile);

/**
 * Server-side audio measurement.
 *
 * Provider metadata and requested durations are treated as claims, never as
 * facts. Nothing in this system may be marked ready until ffprobe has measured
 * the file that actually exists on disk.
 */

const FFPROBE = envOr("FFPROBE_PATH", "ffprobe");
const FFMPEG = envOr("FFMPEG_PATH", "ffmpeg");

export class AudioAnalysisError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AudioAnalysisError";
  }
}

interface FfprobeOutput {
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    sample_rate?: string;
    channels?: number;
    bit_rate?: string;
    duration?: string;
  }>;
  format?: {
    duration?: string;
    bit_rate?: string;
    size?: string;
    format_name?: string;
  };
}

/** Peak level in dBFS, via ffmpeg's volumedetect. Returns null if unavailable. */
async function measurePeakDb(filePath: string): Promise<number | null> {
  try {
    const { stderr } = await run(
      FFMPEG,
      ["-hide_banner", "-nostats", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    const match = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/** Integrated loudness in LUFS, via ffmpeg's ebur128 filter. */
async function measureLoudnessLufs(filePath: string): Promise<number | null> {
  try {
    const { stderr } = await run(
      FFMPEG,
      [
        "-hide_banner",
        "-nostats",
        "-i",
        filePath,
        "-af",
        "ebur128=framelog=verbose",
        "-f",
        "null",
        "-",
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const match = stderr.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
    if (!match || match.length === 0) return null;
    const last = match[match.length - 1].match(/(-?\d+(?:\.\d+)?)/);
    return last ? Number(last[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Measures a file with ffprobe. Throws rather than guessing — a failed
 * measurement must leave the asset in `failed`, never in `ready`.
 */
export async function analyseAudioFile(
  filePath: string,
  options: { measureLevels?: boolean } = {},
): Promise<AudioAnalysis> {
  let probe: FfprobeOutput;
  try {
    const { stdout } = await run(
      FFPROBE,
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        "-select_streams",
        "a",
        filePath,
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    probe = JSON.parse(stdout) as FfprobeOutput;
  } catch (error) {
    throw new AudioAnalysisError(
      `ffprobe could not read "${filePath}". The asset stays unmeasured and cannot be marked ready.`,
      error,
    );
  }

  const stream = probe.streams?.find((s) => s.codec_type === "audio");
  if (!stream) {
    throw new AudioAnalysisError(`No audio stream found in "${filePath}".`);
  }

  const duration = Number(probe.format?.duration ?? stream.duration ?? Number.NaN);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new AudioAnalysisError(
      `ffprobe returned no usable duration for "${filePath}". Refusing to fall back to the requested duration.`,
    );
  }

  const fileStat = await stat(filePath);
  const bitRateRaw = probe.format?.bit_rate ?? stream.bit_rate;
  const bitrateKbps = bitRateRaw ? Math.round(Number(bitRateRaw) / 1000) : null;

  const [peakDb, loudnessLufs] = options.measureLevels
    ? await Promise.all([measurePeakDb(filePath), measureLoudnessLufs(filePath)])
    : [null, null];

  return {
    durationSeconds: Number(duration.toFixed(2)),
    codec: stream.codec_name ?? probe.format?.format_name ?? "unknown",
    bitrateKbps: Number.isFinite(bitrateKbps) ? bitrateKbps : null,
    sampleRate: Number(stream.sample_rate ?? 0),
    channels: stream.channels ?? 0,
    fileSizeBytes: fileStat.size,
    peakDb,
    loudnessLufs,
    analysedAt: new Date().toISOString(),
    tool: "ffprobe",
  };
}

export interface DurationComparison {
  requestedSeconds: number | null;
  actualSeconds: number;
  deltaSeconds: number | null;
  withinTolerance: boolean;
}

/** Compares what was asked for against what actually exists. */
export function compareDuration(
  requestedSeconds: number | null,
  analysis: AudioAnalysis,
  toleranceSeconds = 5,
): DurationComparison {
  if (requestedSeconds === null) {
    return {
      requestedSeconds: null,
      actualSeconds: analysis.durationSeconds,
      deltaSeconds: null,
      withinTolerance: true,
    };
  }
  const delta = Number((analysis.durationSeconds - requestedSeconds).toFixed(2));
  return {
    requestedSeconds,
    actualSeconds: analysis.durationSeconds,
    deltaSeconds: delta,
    withinTolerance: Math.abs(delta) <= toleranceSeconds,
  };
}

/** Verifies the toolchain is present so failures surface at startup, not mid-export. */
export async function checkAudioToolchain(): Promise<{
  ffprobe: boolean;
  ffmpeg: boolean;
  ffprobeVersion: string | null;
}> {
  let ffprobeVersion: string | null = null;
  let ffprobeOk = false;
  let ffmpegOk = false;

  try {
    const { stdout } = await run(FFPROBE, ["-version"]);
    ffprobeVersion = stdout.split("\n")[0]?.trim() ?? null;
    ffprobeOk = true;
  } catch {
    ffprobeOk = false;
  }
  try {
    await run(FFMPEG, ["-version"]);
    ffmpegOk = true;
  } catch {
    ffmpegOk = false;
  }

  return { ffprobe: ffprobeOk, ffmpeg: ffmpegOk, ffprobeVersion };
}
