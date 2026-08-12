import { access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { analyseAudioFile } from "@/providers/audio/ffprobe";
import { getTtsProvider, type TtsProviderId } from "@/providers/tts";
import { ensureBucket } from "@/lib/paths";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Generates a voice reading real Osora copy.
 *
 * A provider's own sample tells you the timbre but nothing about whether the
 * voice can hold an unhurried line with a pause in the middle of it, which is
 * the only thing that matters here. So the sample is a genuine opening.
 *
 * Previews are cached on disk per voice. Auditioning a library of thirty
 * voices should cost the price of thirty clips once, not once per visit.
 */
const SAMPLE_TEXT =
  "Let your attention move to where your feet meet the floor. Nothing to change — just noticing that the contact is there. See if the out-breath can become a little longer than the in-breath.";

const schema = z.object({
  voiceId: z.string().min(1),
  provider: z.enum(["mock", "elevenlabs"]).optional(),
  modelId: z.string().optional(),
  force: z.boolean().default(false),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { voiceId, force } = parsed.data;

  try {
    const provider = getTtsProvider(parsed.data.provider as TtsProviderId | undefined);
    const models = await provider.listModels();
    const model =
      models.find((m) => m.id === parsed.data.modelId) ?? models.find((m) => m.textToSpeech);
    if (!model) {
      return NextResponse.json(
        { ok: false, error: `Provider "${provider.id}" exposes no speech model.` },
        { status: 400 },
      );
    }

    const directory = await ensureBucket("previews");
    const safeVoice = voiceId.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `preview-${provider.id}-${safeVoice}.mp3`;
    const filePath = path.join(directory, fileName);

    // Serve the cached clip unless a fresh one was explicitly asked for.
    if (!force) {
      try {
        await access(filePath, constants.R_OK);
        const analysis = await analyseAudioFile(filePath);
        return NextResponse.json({
          ok: true,
          cached: true,
          voiceId,
          provider: provider.id,
          playbackUrl: `/api/audio/file/${encodeURIComponent(fileName)}`,
          analysis,
          sampleText: SAMPLE_TEXT,
          costEstimateUsd: 0,
        });
      } catch {
        // Not cached yet — generate it.
      }
    }

    const generated = await provider.generateSpeech(SAMPLE_TEXT, {
      voiceId,
      modelId: model.id,
      stability: 0.72,
      similarityBoost: 0.7,
      speakingRate: 1,
      language: "en",
      seed: null,
    });

    await writeFile(filePath, generated.bytes);
    const analysis = await analyseAudioFile(filePath, { measureLevels: true });

    return NextResponse.json({
      ok: true,
      cached: false,
      voiceId,
      provider: provider.id,
      model: generated.model,
      playbackUrl: `/api/audio/file/${encodeURIComponent(fileName)}`,
      analysis,
      sampleText: SAMPLE_TEXT,
      // Words per minute is the number that decides whether a voice can carry
      // an Osora session: the planner assumes 105, and a voice far from that
      // makes every duration estimate wrong before a session is even written.
      wordsPerMinute:
        analysis.durationSeconds > 0
          ? Math.round((SAMPLE_TEXT.split(/\s+/).length / analysis.durationSeconds) * 60)
          : null,
      costEstimateUsd: generated.costEstimateUsd,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Preview failed." },
      { status: 502 },
    );
  }
}
