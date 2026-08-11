import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { analyseAudioFile, AudioAnalysisError, compareDuration } from "@/providers/audio/ffprobe";
import { getTtsProvider, type TtsProviderId } from "@/providers/tts";
import { ensureBucket, isPersistentStorage, storagePathFor } from "@/lib/paths";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Generate audio, then measure it.
 *
 * The mock provider produces real PCM bytes, so this whole path — generate,
 * write, ffprobe, compare — runs offline exactly as it will in production.
 * That is deliberate: the requested/actual gap is a property of the pipeline,
 * not something that only appears once a real vendor is wired up.
 */
const bodySchema = z.discriminatedUnion("capability", [
  z.object({
    capability: z.literal("speech"),
    provider: z.enum(["mock", "elevenlabs"]).default("mock"),
    text: z.string().min(1).max(40_000),
    voiceId: z.string().min(1),
    modelId: z.string().min(1),
    speakingRate: z.number().min(0.9).max(1.1).default(1),
    stability: z.number().min(0).max(1).default(0.7),
    similarityBoost: z.number().min(0).max(1).default(0.7),
    language: z.string().default("en"),
    seed: z.number().int().nullable().default(null),
  }),
  z.object({
    capability: z.literal("ambient"),
    provider: z.enum(["mock", "elevenlabs"]).default("mock"),
    prompt: z.string().min(1).max(450),
    modelId: z.string().min(1),
    requestedDurationSeconds: z.number().min(1).max(1800),
    intensity: z.number().min(0).max(1).default(0.3),
    loopable: z.boolean().default(true),
    seed: z.number().int().nullable().default(null),
  }),
]);

export async function POST(request: Request) {
  let filePath: string | null = null;
  let succeeded = false;

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid request.", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const provider = getTtsProvider(body.provider as TtsProviderId);

    // Capabilities differ per model. Fail before spending a request rather
    // than after.
    const models = await provider.listModels();
    const model = models.find((m) => m.id === body.modelId);
    if (!model) {
      return NextResponse.json(
        { ok: false, error: `Unknown model "${body.modelId}" for provider "${provider.id}".` },
        { status: 400 },
      );
    }
    if (body.capability === "speech" && !model.textToSpeech) {
      return NextResponse.json(
        { ok: false, error: `Model "${model.label}" does not support text to speech.` },
        { status: 400 },
      );
    }
    if (body.capability === "ambient" && !model.ambientSound) {
      return NextResponse.json(
        { ok: false, error: `Model "${model.label}" does not support ambient generation.` },
        { status: 400 },
      );
    }

    const generated =
      body.capability === "speech"
        ? await provider.generateSpeech(body.text, {
            voiceId: body.voiceId,
            modelId: body.modelId,
            stability: body.stability,
            similarityBoost: body.similarityBoost,
            speakingRate: body.speakingRate,
            language: body.language,
            seed: body.seed,
          })
        : await provider.generateAmbientSound({
            modelId: body.modelId,
            prompt: body.prompt,
            requestedDurationSeconds: body.requestedDurationSeconds,
            intensity: body.intensity,
            loopable: body.loopable,
            seed: body.seed,
          });

    const directory = await ensureBucket("generated");
    const fileName = `${generated.providerRequestId}.${generated.format}`;
    filePath = path.join(directory, fileName);
    await writeFile(filePath, generated.bytes);

    const analysis = await analyseAudioFile(filePath, { measureLevels: true });

    // What we asked for, not what the provider claims it delivered.
    const requested =
      body.capability === "ambient" ? body.requestedDurationSeconds : generated.reportedDurationSeconds;
    const comparison = compareDuration(requested, analysis);
    succeeded = true;

    return NextResponse.json({
      ok: true,
      status: "ready",
      provider: provider.id,
      capability: body.capability,
      model: generated.model,
      providerRequestId: generated.providerRequestId,
      seed: generated.seed,
      format: generated.format,
      storagePath: storagePathFor("generated", fileName),
      persistent: isPersistentStorage(),
      // Kept on disk so the studio can audition what it just measured.
      playbackUrl: `/api/audio/file/${encodeURIComponent(fileName)}`,
      costEstimateUsd: generated.costEstimateUsd,
      reportedDurationSeconds: generated.reportedDurationSeconds,
      analysis,
      requestedDurationSeconds: comparison.requestedSeconds,
      actualDurationSeconds: comparison.actualSeconds,
      durationDeltaSeconds: comparison.deltaSeconds,
      withinTolerance: comparison.withinTolerance,
    });
  } catch (error) {
    if (error instanceof AudioAnalysisError) {
      return NextResponse.json(
        { ok: false, status: "failed", error: error.message },
        { status: 422 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Generation failed.",
      },
      { status: 500 },
    );
  } finally {
    // A measured file is kept so it can be auditioned; anything that failed on
    // the way through is removed rather than left lying around unmeasured.
    if (filePath && !succeeded) {
      await unlink(filePath).catch(() => undefined);
    }
  }
}
