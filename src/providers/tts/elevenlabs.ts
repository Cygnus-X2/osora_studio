import "server-only";

import { envValue } from "@/lib/env";
import type {
  GeneratedAudio,
  ProviderGenerationStatus,
  ProviderVoice,
  SoundSettings,
  SpeechSettings,
  TtsModelCapabilities,
  TtsProvider,
} from "./types";

/**
 * ElevenLabs adapter.
 *
 * Two things worth noting.
 *
 * First, capabilities differ per model — the speech models cannot generate
 * soundscapes and the sound model cannot speak. `listModels()` exposes that so
 * the UI can grey out controls rather than fail at request time.
 *
 * Second, `reportedDurationSeconds` is left null wherever the API does not
 * return one, and is never written to `audio_assets.actual_duration_seconds`.
 * The only thing allowed to set that column is a completed ffprobe run.
 */

const BASE_URL = "https://api.elevenlabs.io/v1";

const MODELS: TtsModelCapabilities[] = [
  {
    id: "eleven_multilingual_v2",
    label: "Multilingual v2",
    textToSpeech: true,
    soundEffects: false,
    ambientSound: false,
    supportsSeed: true,
    supportsDurationRequest: false,
    maxCharacters: 10_000,
    languages: ["en", "de", "fr", "es", "it", "pt", "nl", "pl"],
    notes: "Speech only. Duration follows the text and cannot be requested.",
  },
  {
    id: "eleven_turbo_v2_5",
    label: "Turbo v2.5",
    textToSpeech: true,
    soundEffects: false,
    ambientSound: false,
    supportsSeed: true,
    supportsDurationRequest: false,
    maxCharacters: 40_000,
    languages: ["en", "de", "fr", "es"],
    notes: "Faster and cheaper; slightly less stable on long unhurried delivery.",
  },
  {
    id: "eleven_text_to_sound_v2",
    label: "Text to sound v2",
    textToSpeech: false,
    soundEffects: true,
    ambientSound: true,
    supportsSeed: false,
    supportsDurationRequest: true,
    maxCharacters: 450,
    languages: [],
    notes: "Sound only. Accepts a requested duration but frequently returns a different one.",
  },
];

export class ElevenLabsProvider implements TtsProvider {
  readonly id = "elevenlabs";
  readonly label = "ElevenLabs";

  private apiKey(): string {
    const key = envValue("ELEVENLABS_API_KEY");
    if (!key) {
      throw new Error(
        "ELEVENLABS_API_KEY is not set. Set it in the server environment, or use the mock provider for local development.",
      );
    }
    return key;
  }

  private headers(extra: Record<string, string> = {}) {
    return { "xi-api-key": this.apiKey(), ...extra };
  }

  private capability(modelId: string) {
    const model = MODELS.find((m) => m.id === modelId);
    if (!model) throw new Error(`Unknown ElevenLabs model "${modelId}".`);
    return model;
  }

  async listModels(): Promise<TtsModelCapabilities[]> {
    return MODELS;
  }

  async listVoices(): Promise<ProviderVoice[]> {
    const response = await fetch(`${BASE_URL}/voices`, { headers: this.headers() });
    if (!response.ok) throw new Error(`ElevenLabs voice listing failed: ${response.status}`);
    const json = (await response.json()) as {
      voices: Array<{
        voice_id: string;
        name: string;
        description: string | null;
        labels?: Record<string, string>;
        preview_url: string | null;
      }>;
    };
    return json.voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      description: v.description ?? "",
      gender: v.labels?.gender ?? "unspecified",
      accent: v.labels?.accent ?? "unspecified",
      languages: v.labels?.language ? [v.labels.language] : [],
      previewUrl: v.preview_url,
    }));
  }

  async getVoice(voiceId: string): Promise<ProviderVoice | null> {
    const response = await fetch(`${BASE_URL}/voices/${voiceId}`, { headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`ElevenLabs voice lookup failed: ${response.status}`);
    const v = (await response.json()) as {
      voice_id: string;
      name: string;
      description: string | null;
      labels?: Record<string, string>;
      preview_url: string | null;
    };
    return {
      id: v.voice_id,
      name: v.name,
      description: v.description ?? "",
      gender: v.labels?.gender ?? "unspecified",
      accent: v.labels?.accent ?? "unspecified",
      languages: v.labels?.language ? [v.labels.language] : [],
      previewUrl: v.preview_url,
    };
  }

  async generateSpeech(text: string, settings: SpeechSettings): Promise<GeneratedAudio> {
    const model = this.capability(settings.modelId);
    if (!model.textToSpeech) {
      throw new Error(`Model "${model.label}" does not support text to speech.`);
    }
    if (text.length > model.maxCharacters) {
      throw new Error(
        `Text is ${text.length} characters; "${model.label}" accepts at most ${model.maxCharacters}.`,
      );
    }

    const response = await fetch(`${BASE_URL}/text-to-speech/${settings.voiceId}`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json", accept: "audio/mpeg" }),
      body: JSON.stringify({
        text,
        model_id: settings.modelId,
        language_code: settings.language,
        seed: model.supportsSeed ? settings.seed : undefined,
        voice_settings: {
          stability: settings.stability,
          similarity_boost: settings.similarityBoost,
          speed: settings.speakingRate,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`ElevenLabs speech generation failed: ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      bytes,
      format: "mp3",
      // The API returns no duration. Anything we guessed here would be a lie
      // the rest of the system might believe, so it stays null until measured.
      reportedDurationSeconds: null,
      providerRequestId: response.headers.get("request-id") ?? `el_${Date.now()}`,
      model: settings.modelId,
      seed: model.supportsSeed ? settings.seed : null,
      costEstimateUsd: Number(((text.length / 1000) * 0.15).toFixed(4)),
    };
  }

  async generateVoicePreview(voiceId: string, sampleText: string): Promise<GeneratedAudio> {
    return this.generateSpeech(sampleText, {
      voiceId,
      modelId: "eleven_multilingual_v2",
      stability: 0.75,
      similarityBoost: 0.75,
      speakingRate: 1,
      language: "en",
      seed: null,
    });
  }

  async generateSoundEffect(settings: SoundSettings): Promise<GeneratedAudio> {
    const model = this.capability(settings.modelId);
    if (!model.soundEffects) {
      throw new Error(`Model "${model.label}" does not support sound generation.`);
    }

    const response = await fetch(`${BASE_URL}/sound-generation`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json", accept: "audio/mpeg" }),
      body: JSON.stringify({
        text: settings.prompt,
        model_id: settings.modelId,
        duration_seconds: model.supportsDurationRequest
          ? settings.requestedDurationSeconds
          : undefined,
        loop: settings.loopable,
        prompt_influence: settings.intensity,
      }),
    });
    if (!response.ok) {
      throw new Error(`ElevenLabs sound generation failed: ${response.status}`);
    }

    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      format: "mp3",
      // Requested is not actual. This field records what we asked for; the
      // measured value is written separately after ffprobe runs.
      reportedDurationSeconds: settings.requestedDurationSeconds,
      providerRequestId: response.headers.get("request-id") ?? `el_${Date.now()}`,
      model: settings.modelId,
      seed: null,
      costEstimateUsd: Number((settings.requestedDurationSeconds * 0.008).toFixed(4)),
    };
  }

  async generateAmbientSound(settings: SoundSettings): Promise<GeneratedAudio> {
    const model = this.capability(settings.modelId);
    if (!model.ambientSound) {
      throw new Error(`Model "${model.label}" does not support ambient generation.`);
    }
    return this.generateSoundEffect({
      ...settings,
      prompt: `Continuous ambient bed, no transients, no identifiable events. ${settings.prompt}`,
      loopable: true,
    });
  }

  async getGenerationStatus(): Promise<ProviderGenerationStatus> {
    // ElevenLabs generation is synchronous: a returned body is a finished job.
    return "complete";
  }

  async downloadGeneratedAudio(): Promise<Uint8Array | null> {
    // Bytes arrive with the original response and are written to storage there.
    return null;
  }
}
