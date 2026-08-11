/**
 * Text-to-speech and sound-generation provider contract.
 *
 * Capabilities are declared per model rather than per provider, because they
 * genuinely differ: a speech model cannot generate a soundscape, and not every
 * model accepts a seed or a requested duration. The UI reads these flags so it
 * never offers a control the selected model does not honour.
 */

export interface TtsModelCapabilities {
  id: string;
  label: string;
  textToSpeech: boolean;
  soundEffects: boolean;
  ambientSound: boolean;
  /** Whether generation is reproducible with a seed. */
  supportsSeed: boolean;
  /** Whether a requested duration is honoured at all (still never trusted). */
  supportsDurationRequest: boolean;
  maxCharacters: number;
  languages: string[];
  notes: string | null;
}

export interface ProviderVoice {
  id: string;
  name: string;
  description: string;
  gender: string;
  accent: string;
  languages: string[];
  previewUrl: string | null;
}

export interface SpeechSettings {
  voiceId: string;
  modelId: string;
  /** 0–1; higher is more consistent, lower is more expressive. */
  stability: number;
  similarityBoost: number;
  /** 0.9–1.1 in Osora; outside that range flow suffers more than it gains. */
  speakingRate: number;
  language: string;
  seed: number | null;
}

export interface SoundSettings {
  modelId: string;
  prompt: string;
  /** What we ask for. The measured duration is what gets stored as truth. */
  requestedDurationSeconds: number;
  intensity: number;
  loopable: boolean;
  seed: number | null;
}

export interface GeneratedAudio {
  /** Raw bytes. The caller writes them to storage and then measures them. */
  bytes: Uint8Array;
  format: string;
  /** Whatever the provider claims. Never stored as the actual duration. */
  reportedDurationSeconds: number | null;
  providerRequestId: string;
  model: string;
  seed: number | null;
  costEstimateUsd: number;
}

export type ProviderGenerationStatus = "queued" | "processing" | "complete" | "failed";

export interface TtsProvider {
  readonly id: string;
  readonly label: string;

  listModels(): Promise<TtsModelCapabilities[]>;
  listVoices(): Promise<ProviderVoice[]>;
  getVoice(voiceId: string): Promise<ProviderVoice | null>;

  generateSpeech(text: string, settings: SpeechSettings): Promise<GeneratedAudio>;
  generateVoicePreview(voiceId: string, sampleText: string): Promise<GeneratedAudio>;
  generateSoundEffect(settings: SoundSettings): Promise<GeneratedAudio>;
  generateAmbientSound(settings: SoundSettings): Promise<GeneratedAudio>;

  getGenerationStatus(providerRequestId: string): Promise<ProviderGenerationStatus>;
  downloadGeneratedAudio(providerRequestId: string): Promise<Uint8Array | null>;
}
