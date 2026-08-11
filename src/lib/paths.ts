import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { envValue } from "./env";

/**
 * Where audio lives on disk.
 *
 * Generated and processed audio are kept separate, as are uploads — a
 * regenerated narration must never quietly overwrite something a person
 * supplied, and an export must be distinguishable from its sources.
 *
 * On a container this points at a mounted volume via `AUDIO_STORAGE_DIR`. With
 * nothing set it falls back to the system temp directory, which is right for
 * local development and wrong for anything that needs to survive a restart.
 */
export type AudioBucket = "generated" | "uploads" | "processed" | "exports";

const ROOT = envValue("AUDIO_STORAGE_DIR") ?? path.join(tmpdir(), "osora-audio");

export function isPersistentStorage(): boolean {
  return envValue("AUDIO_STORAGE_DIR") !== undefined;
}

export function bucketDir(bucket: AudioBucket): string {
  return path.join(ROOT, bucket);
}

export async function ensureBucket(bucket: AudioBucket): Promise<string> {
  const directory = bucketDir(bucket);
  await mkdir(directory, { recursive: true });
  return directory;
}

/**
 * Resolves a file inside a bucket, rejecting anything that escapes it.
 *
 * The name is reduced to its basename first, then the *resolved* path is
 * checked against the bucket — so a traversal attempt fails on where it lands
 * rather than on what it looked like going in.
 */
export function resolveInBucket(bucket: AudioBucket, name: string): string | null {
  const safeName = path.basename(name);
  if (!safeName || safeName === "." || safeName === "..") return null;

  const directory = path.resolve(bucketDir(bucket));
  const resolved = path.resolve(path.join(directory, safeName));
  return resolved.startsWith(directory + path.sep) ? resolved : null;
}

/** A storage path as recorded on the asset row, e.g. `generated/foo.mp3`. */
export function storagePathFor(bucket: AudioBucket, fileName: string): string {
  return `${bucket}/${path.basename(fileName)}`;
}

export function sanitiseFileName(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "audio";
}
