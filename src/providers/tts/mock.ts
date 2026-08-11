import "server-only";

import { countWords, DEFAULT_WORDS_PER_MINUTE } from "@/domain/timeline/planner";
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
 * Mock TTS / sound provider.
 *
 * This produces *real* PCM WAV bytes rather than a placeholder, so the whole
 * audio pipeline runs end to end offline: generate → write → ffprobe → store
 * measured duration. That matters because the mock deliberately does not land
 * exactly on the requested duration — which is the entire reason the platform
 * measures instead of trusting what it asked for.
 */

const SAMPLE_RATE = 44_100;

const MODELS: TtsModelCapabilities[] = [
  {
    id: "mock_speech_v2",
    label: "Mock speech v2",
    textToSpeech: true,
    soundEffects: false,
    ambientSound: false,
    supportsSeed: true,
    supportsDurationRequest: false,
    maxCharacters: 5_000,
    languages: ["en", "de"],
    notes: "Speech only. Duration follows the text; a requested duration is ignored.",
  },
  {
    id: "mock_sound_v1",
    label: "Mock sound v1",
    textToSpeech: false,
    soundEffects: true,
    ambientSound: true,
    supportsSeed: true,
    supportsDurationRequest: true,
    maxCharacters: 500,
    languages: [],
    notes: "Sound generation only. Honours a requested duration approximately.",
  },
];

const VOICES: ProviderVoice[] = [
  {
    id: "mock-voice-aurel",
    name: "Aurel",
    description: "Low, unhurried, minimal inflection. The Osora reference voice.",
    gender: "neutral",
    accent: "neutral",
    languages: ["en"],
    previewUrl: null,
  },
  {
    id: "mock-voice-maren",
    name: "Maren",
    description: "Warm mid-range with a slight downward cadence.",
    gender: "female",
    accent: "northern european",
    languages: ["en", "de"],
    previewUrl: null,
  },
  {
    id: "mock-voice-soren",
    name: "Sören",
    description: "Very quiet, close-mic, almost spoken rather than read.",
    gender: "male",
    accent: "neutral",
    languages: ["en"],
    previewUrl: null,
  },
];

/** Minimal 16-bit mono PCM WAV encoder. */
function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped * 0x7fff, true);
  }

  return new Uint8Array(buffer);
}

/** Deterministic pseudo-random source so a seed reproduces a file exactly. */
function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** A quiet, speech-shaped signal — enough for ffprobe to measure honestly. */
function synthesiseSpeech(seconds: number, seed: number): Uint8Array {
  const length = Math.max(1, Math.floor(seconds * SAMPLE_RATE));
  const samples = new Float32Array(length);
  const random = seededRandom(seed);
  let envelope = 0;

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    // Syllable-rate amplitude modulation around 4 Hz.
    const target = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t);
    envelope += (target - envelope) * 0.002;
    const fundamental = 110 + 20 * Math.sin(2 * Math.PI * 0.3 * t);
    const tone =
      Math.sin(2 * Math.PI * fundamental * t) * 0.6 +
      Math.sin(2 * Math.PI * fundamental * 2 * t) * 0.25;
    const breath = (random() - 0.5) * 0.05;
    samples[i] = (tone + breath) * envelope * 0.22;
  }
  return encodeWav(samples);
}

/** A continuous ambient bed with no transients. */
function synthesiseAmbient(seconds: number, seed: number, intensity: number): Uint8Array {
  const length = Math.max(1, Math.floor(seconds * SAMPLE_RATE));
  const samples = new Float32Array(length);
  const random = seededRandom(seed);
  let low = 0;
  let lower = 0;

  for (let i = 0; i < length; i += 1) {
    const white = random() * 2 - 1;
    low += (white - low) * 0.02;
    lower += (low - lower) * 0.02;
    const t = i / SAMPLE_RATE;
    const drift = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.05 * t);
    samples[i] = lower * 3.2 * intensity * drift;
  }

  // Fade in and out so there is never a click at the edges.
  const fade = Math.min(SAMPLE_RATE, Math.floor(length / 8));
  for (let i = 0; i < fade; i += 1) {
    const gain = i / fade;
    samples[i] *= gain;
    samples[length - 1 - i] *= gain;
  }
  return encodeWav(samples);
}

let requestCounter = 0;
const generated = new Map<string, { bytes: Uint8Array; status: ProviderGenerationStatus }>();

function nextRequestId(prefix: string) {
  requestCounter += 1;
  return `${prefix}_${requestCounter.toString().padStart(6, "0")}`;
}

export class MockTtsProvider implements TtsProvider {
  readonly id = "mock";
  readonly label = "Mock voice & sound";

  async listModels(): Promise<TtsModelCapabilities[]> {
    return MODELS;
  }

  async listVoices(): Promise<ProviderVoice[]> {
    return VOICES;
  }

  async getVoice(voiceId: string): Promise<ProviderVoice | null> {
    return VOICES.find((v) => v.id === voiceId) ?? null;
  }

  async generateSpeech(text: string, settings: SpeechSettings): Promise<GeneratedAudio> {
    const words = countWords(text);
    const baseSeconds = (words / (DEFAULT_WORDS_PER_MINUTE * settings.speakingRate)) * 60;

    // Real TTS never lands exactly on an estimate. The wobble here is
    // deterministic per seed and small — just enough that the measured
    // duration genuinely differs from the estimate, as it does in production.
    const seed = settings.seed ?? hash(text + settings.voiceId);
    const wobble = 1 + (seededRandom(seed)() - 0.5) * 0.12;
    const seconds = Math.max(0.4, baseSeconds * wobble);

    const bytes = synthesiseSpeech(seconds, seed);
    const requestId = nextRequestId("mockspeech");
    generated.set(requestId, { bytes, status: "complete" });

    return {
      bytes,
      format: "wav",
      // Deliberately the *estimate*, not the truth — mirroring providers that
      // report an approximation. ffprobe is what settles the real duration.
      reportedDurationSeconds: Number(baseSeconds.toFixed(1)),
      providerRequestId: requestId,
      model: settings.modelId,
      seed,
      costEstimateUsd: 0,
    };
  }

  async generateVoicePreview(voiceId: string, sampleText: string): Promise<GeneratedAudio> {
    return this.generateSpeech(sampleText, {
      voiceId,
      modelId: "mock_speech_v2",
      stability: 0.7,
      similarityBoost: 0.7,
      speakingRate: 1,
      language: "en",
      seed: hash(voiceId),
    });
  }

  async generateSoundEffect(settings: SoundSettings): Promise<GeneratedAudio> {
    return this.generateAmbientSound(settings);
  }

  async generateAmbientSound(settings: SoundSettings): Promise<GeneratedAudio> {
    const seed = settings.seed ?? hash(settings.prompt);
    // Providers approximate requested durations; this one does too.
    const wobble = 1 + (seededRandom(seed)() - 0.5) * 0.06;
    const seconds = Math.max(1, settings.requestedDurationSeconds * wobble);
    const bytes = synthesiseAmbient(seconds, seed, Math.max(0.05, settings.intensity));
    const requestId = nextRequestId("mocksound");
    generated.set(requestId, { bytes, status: "complete" });

    return {
      bytes,
      format: "wav",
      reportedDurationSeconds: settings.requestedDurationSeconds,
      providerRequestId: requestId,
      model: settings.modelId,
      seed,
      costEstimateUsd: 0,
    };
  }

  async getGenerationStatus(providerRequestId: string): Promise<ProviderGenerationStatus> {
    return generated.get(providerRequestId)?.status ?? "failed";
  }

  async downloadGeneratedAudio(providerRequestId: string): Promise<Uint8Array | null> {
    return generated.get(providerRequestId)?.bytes ?? null;
  }
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
