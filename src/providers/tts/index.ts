import "server-only";

import { ElevenLabsProvider } from "./elevenlabs";
import { MockTtsProvider } from "./mock";
import { envIsSet, envValue } from "@/lib/env";
import type { TtsProvider } from "./types";

export type TtsProviderId = "mock" | "elevenlabs";

export const TTS_PROVIDER_LABELS: Record<TtsProviderId, string> = {
  mock: "Mock voice & sound",
  elevenlabs: "ElevenLabs",
};

const cache = new Map<TtsProviderId, TtsProvider>();

export function getTtsProvider(id: TtsProviderId = defaultTtsProviderId()): TtsProvider {
  const cached = cache.get(id);
  if (cached) return cached;
  const provider: TtsProvider = id === "mock" ? new MockTtsProvider() : new ElevenLabsProvider();
  cache.set(id, provider);
  return provider;
}

export function defaultTtsProviderId(): TtsProviderId {
  const configured = envValue("TTS_PROVIDER") as TtsProviderId | undefined;
  if (configured && configured in TTS_PROVIDER_LABELS) return configured;
  return "mock";
}

export function ttsProviderAvailability(): Array<{
  id: TtsProviderId;
  label: string;
  configured: boolean;
}> {
  return [
    { id: "mock", label: TTS_PROVIDER_LABELS.mock, configured: true },
    {
      id: "elevenlabs",
      label: TTS_PROVIDER_LABELS.elevenlabs,
      configured: envIsSet("ELEVENLABS_API_KEY"),
    },
  ];
}

export * from "./types";
