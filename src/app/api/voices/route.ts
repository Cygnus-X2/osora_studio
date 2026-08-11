import { NextResponse } from "next/server";
import { getTtsProvider, ttsProviderAvailability, type TtsProviderId } from "@/providers/tts";

export const runtime = "nodejs";

/**
 * Voice and model listing.
 *
 * Runs server-side so the provider key stays there. Only the resulting voice
 * and capability metadata crosses the wire — never the credential, and never
 * an indication of what it is beyond "configured".
 */
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("provider");
  const availability = ttsProviderAvailability();

  const id: TtsProviderId =
    requested === "elevenlabs" || requested === "mock"
      ? requested
      : (process.env.TTS_PROVIDER as TtsProviderId) || "mock";

  const entry = availability.find((p) => p.id === id);
  if (!entry?.configured) {
    return NextResponse.json(
      {
        ok: false,
        provider: id,
        error: `${entry?.label ?? id} has no API key set. Add it to .env.local and restart the dev server.`,
        availability,
      },
      { status: 400 },
    );
  }

  try {
    const provider = getTtsProvider(id);
    const [voices, models] = await Promise.all([provider.listVoices(), provider.listModels()]);
    return NextResponse.json({ ok: true, provider: id, voices, models, availability });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        provider: id,
        error: error instanceof Error ? error.message : "Could not list voices.",
        availability,
      },
      { status: 502 },
    );
  }
}
