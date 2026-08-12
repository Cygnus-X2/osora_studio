import "server-only";

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { analyseAudioFile } from "@/providers/audio/ffprobe";
import { bucketDir, type AudioBucket } from "@/lib/paths";
import type { AudioAnalysis } from "@/domain/types";

/**
 * What is actually on disk.
 *
 * The seeded asset list is illustrative fixtures — useful for showing the
 * shape of requested-versus-measured drift, but the files do not exist. This
 * reads the storage volume and measures what it finds, so the studio can show
 * the two apart instead of presenting invented measurements next to real ones.
 */

export interface StoredAudioFile {
  fileName: string;
  bucket: AudioBucket;
  storagePath: string;
  playbackUrl: string;
  sizeBytes: number;
  createdAt: string;
  analysis: AudioAnalysis | null;
  /** Non-null when the file is present but ffprobe could not read it. */
  error: string | null;
}

const BUCKETS: AudioBucket[] = ["generated", "uploads", "processed", "exports", "previews"];
const AUDIO_EXTENSIONS = [".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac", ".aiff"];

/** Newest first, capped so a large volume cannot stall a page render. */
export async function listStoredAudio(limit = 40): Promise<StoredAudioFile[]> {
  const found: Array<{ bucket: AudioBucket; fileName: string; filePath: string }> = [];

  for (const bucket of BUCKETS) {
    let entries: string[];
    try {
      entries = await readdir(bucketDir(bucket));
    } catch {
      continue; // Bucket not created yet.
    }
    for (const fileName of entries) {
      if (!AUDIO_EXTENSIONS.includes(path.extname(fileName).toLowerCase())) continue;
      found.push({ bucket, fileName, filePath: path.join(bucketDir(bucket), fileName) });
    }
  }

  const withTimes = await Promise.all(
    found.map(async (entry) => {
      const info = await stat(entry.filePath);
      return { ...entry, sizeBytes: info.size, createdAt: info.mtime.toISOString() };
    }),
  );

  withTimes.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return Promise.all(
    withTimes.slice(0, limit).map(async (entry) => {
      // Measured on read rather than trusted from a stored row — the same
      // discipline the pipeline applies when the file is first written.
      let analysis: AudioAnalysis | null = null;
      let error: string | null = null;
      try {
        analysis = await analyseAudioFile(entry.filePath);
      } catch (cause) {
        error = cause instanceof Error ? cause.message : "Could not measure this file.";
      }

      return {
        fileName: entry.fileName,
        bucket: entry.bucket,
        storagePath: `${entry.bucket}/${entry.fileName}`,
        playbackUrl: `/api/audio/file/${encodeURIComponent(entry.fileName)}`,
        sizeBytes: entry.sizeBytes,
        createdAt: entry.createdAt,
        analysis,
        error,
      };
    }),
  );
}
