import { access, constants } from "node:fs/promises";
import { NextResponse } from "next/server";
import { checkAudioToolchain } from "@/providers/audio/ffprobe";
import { bucketDir, ensureBucket, isPersistentStorage } from "@/lib/paths";
import { databaseStatus } from "@/lib/db/client";
import { llmProviderAvailability } from "@/providers/llm";
import { ttsProviderAvailability } from "@/providers/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check.
 *
 * Deliberately strict about the audio toolchain: without ffprobe no asset can
 * ever be marked ready, so a container missing it is not degraded, it is
 * broken. That returns 503 so an orchestrator restarts or refuses to route to
 * it rather than quietly serving a studio that cannot finish anything.
 */
export async function GET() {
  const toolchain = await checkAudioToolchain();

  let storageWritable = false;
  try {
    await ensureBucket("generated");
    await access(bucketDir("generated"), constants.W_OK);
    storageWritable = true;
  } catch {
    storageWritable = false;
  }

  const database = await databaseStatus();

  // A configured-but-unreachable database is unhealthy. An unconfigured one is
  // not — the studio runs on seeded data by design in this milestone.
  const databaseHealthy = !database.configured || database.reachable;
  const healthy = toolchain.ffprobe && toolchain.ffmpeg && storageWritable && databaseHealthy;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: {
        ffprobe: toolchain.ffprobe,
        ffmpeg: toolchain.ffmpeg,
        ffprobeVersion: toolchain.ffprobeVersion,
        storageWritable,
        storagePersistent: isPersistentStorage(),
        database: {
          configured: database.configured,
          reachable: database.reachable,
          version: database.version,
          migrationsApplied: database.migrationsApplied,
          tables: database.tables,
          error: database.error,
        },
      },
      providers: {
        llm: llmProviderAvailability(),
        tts: ttsProviderAvailability(),
      },
      // Never report which keys are set beyond a boolean, and never their value.
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
