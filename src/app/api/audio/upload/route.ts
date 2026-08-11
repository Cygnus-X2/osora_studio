import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { analyseAudioFile, AudioAnalysisError, compareDuration } from "@/providers/audio/ffprobe";
import { ensureBucket, isPersistentStorage, sanitiseFileName, storagePathFor } from "@/lib/paths";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 200 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac", ".aiff"];

/**
 * Upload and measure.
 *
 * The measurement is mandatory and it happens here, on the server, against the
 * bytes that were actually written. A file that cannot be measured is reported
 * as failed and removed — the requested duration is never used as a stand-in,
 * because a plausible wrong number is worse than a missing one.
 */
export async function POST(request: Request) {
  let filePath: string | null = null;
  let succeeded = false;

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file was uploaded." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ ok: false, error: "The uploaded file is empty." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `File is larger than the ${MAX_BYTES / 1024 / 1024} MB limit.` },
        { status: 413 },
      );
    }

    const extension = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unsupported file type "${extension || "unknown"}". Accepted: ${ALLOWED_EXTENSIONS.join(", ")}.`,
        },
        { status: 415 },
      );
    }

    const requestedRaw = form.get("requestedDurationSeconds");
    const requestedDurationSeconds =
      typeof requestedRaw === "string" && requestedRaw.trim() !== ""
        ? Number(requestedRaw)
        : null;
    if (requestedDurationSeconds !== null && !Number.isFinite(requestedDurationSeconds)) {
      return NextResponse.json(
        { ok: false, error: "Requested duration must be a number." },
        { status: 400 },
      );
    }

    // Uploads are kept apart from generated audio: regenerating a narration
    // must never overwrite something a person supplied.
    const directory = await ensureBucket("uploads");
    const fileName = `${Date.now()}-${sanitiseFileName(file.name)}`;
    filePath = path.join(directory, fileName);
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

    const analysis = await analyseAudioFile(filePath, { measureLevels: true });
    const comparison = compareDuration(requestedDurationSeconds, analysis);
    succeeded = true;

    return NextResponse.json({
      ok: true,
      status: "ready",
      storagePath: storagePathFor("uploads", fileName),
      persistent: isPersistentStorage(),
      playbackUrl: `/api/audio/file/${encodeURIComponent(fileName)}`,
      analysis,
      requestedDurationSeconds: comparison.requestedSeconds,
      actualDurationSeconds: comparison.actualSeconds,
      durationDeltaSeconds: comparison.deltaSeconds,
      withinTolerance: comparison.withinTolerance,
    });
  } catch (error) {
    if (error instanceof AudioAnalysisError) {
      return NextResponse.json({ ok: false, status: "failed", error: error.message }, { status: 422 });
    }
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Upload failed.",
      },
      { status: 500 },
    );
  } finally {
    if (filePath && !succeeded) {
      await unlink(filePath).catch(() => undefined);
    }
  }
}
