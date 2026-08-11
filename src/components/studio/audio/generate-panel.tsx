"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mic2, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AudioAnalysis } from "@/domain/types";

interface ProviderVoice {
  id: string;
  name: string;
  description: string;
  languages: string[];
}

interface ModelCapabilities {
  id: string;
  label: string;
  textToSpeech: boolean;
  soundEffects: boolean;
  ambientSound: boolean;
  supportsSeed: boolean;
  supportsDurationRequest: boolean;
  maxCharacters: number;
  notes: string | null;
}

interface VoicesResponse {
  ok: boolean;
  provider: string;
  voices?: ProviderVoice[];
  models?: ModelCapabilities[];
  error?: string;
  availability: Array<{ id: string; label: string; configured: boolean }>;
}

interface GenerateResponse {
  ok: boolean;
  status?: string;
  provider?: string;
  model?: string;
  providerRequestId?: string;
  playbackUrl?: string;
  reportedDurationSeconds?: number | null;
  analysis?: AudioAnalysis;
  requestedDurationSeconds?: number | null;
  actualDurationSeconds?: number;
  durationDeltaSeconds?: number | null;
  withinTolerance?: boolean;
  costEstimateUsd?: number;
  error?: string;
}

const SAMPLE_SCRIPT = `Let your attention move to where your feet meet the floor.

And now where you're sitting.

Nothing to change — just noticing that the contact is there.

See if the out-breath can become a little longer than the in-breath. Not forcing it, more like letting it lengthen on its own.`;

/**
 * Live generation.
 *
 * This calls the real provider through the server route, writes the bytes,
 * measures them with ffprobe, and plays back what was measured. Nothing here
 * is simulated — with an ElevenLabs key set, this is the production path.
 */
export function AudioGeneratePanel() {
  const [provider, setProvider] = useState("mock");
  const [catalogue, setCatalogue] = useState<VoicesResponse | null>(null);
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);

  const [voiceId, setVoiceId] = useState("");
  const [speechModel, setSpeechModel] = useState("");
  const [soundModel, setSoundModel] = useState("");
  const [text, setText] = useState(SAMPLE_SCRIPT);
  const [prompt, setPrompt] = useState(
    "Continuous low ambient bed. No transients, no identifiable events. Very quiet.",
  );
  const [seconds, setSeconds] = useState("30");
  const [rate, setRate] = useState("1");

  const [running, setRunning] = useState<"speech" | "ambient" | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingCatalogue(true);
    fetch(`/api/voices?provider=${provider}`)
      .then((r) => r.json() as Promise<VoicesResponse>)
      .then((data) => {
        if (cancelled) return;
        setCatalogue(data);
        setVoiceId(data.voices?.[0]?.id ?? "");
        setSpeechModel(data.models?.find((m) => m.textToSpeech)?.id ?? "");
        setSoundModel(data.models?.find((m) => m.ambientSound)?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) setCatalogue(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalogue(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const availability = catalogue?.availability ?? [
    { id: "mock", label: "Mock voice & sound", configured: true },
    { id: "elevenlabs", label: "ElevenLabs", configured: false },
  ];
  const models = catalogue?.models ?? [];
  const speechModels = models.filter((m) => m.textToSpeech);
  const soundModels = models.filter((m) => m.ambientSound);
  const activeSpeechModel = models.find((m) => m.id === speechModel);

  async function generate(capability: "speech" | "ambient") {
    setRunning(capability);
    setResult(null);

    const body =
      capability === "speech"
        ? {
            capability,
            provider,
            modelId: speechModel,
            voiceId,
            text,
            speakingRate: Number(rate) || 1,
            seed: null,
          }
        : {
            capability,
            provider,
            modelId: soundModel,
            prompt,
            requestedDurationSeconds: Number(seconds) || 30,
            intensity: 0.3,
            loopable: true,
            seed: null,
          };

    try {
      const response = await fetch("/api/audio/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setResult((await response.json()) as GenerateResponse);
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="gen-provider">Provider</Label>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger id="gen-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availability.map((entry) => (
              <SelectItem key={entry.id} value={entry.id} disabled={!entry.configured}>
                {entry.label}
                {!entry.configured && " — no key set"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {catalogue && !catalogue.ok && (
          <p className="text-[12px] leading-5 text-amber">{catalogue.error}</p>
        )}
        {provider === "elevenlabs" && catalogue?.ok && (
          <p className="text-[12px] leading-5 text-sage">
            Connected — {catalogue.voices?.length ?? 0} voices available on this account.
          </p>
        )}
      </div>

      <Tabs defaultValue="speech">
        <TabsList className="w-full">
          <TabsTrigger value="speech" className="flex-1">
            <Mic2 /> Narration
          </TabsTrigger>
          <TabsTrigger value="ambient" className="flex-1">
            <Waves /> Ambient
          </TabsTrigger>
        </TabsList>

        <TabsContent value="speech" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gen-voice">Voice</Label>
              <Select value={voiceId} onValueChange={setVoiceId} disabled={loadingCatalogue}>
                <SelectTrigger id="gen-voice">
                  <SelectValue placeholder={loadingCatalogue ? "Loading…" : "No voices"} />
                </SelectTrigger>
                <SelectContent>
                  {(catalogue?.voices ?? []).map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-speech-model">Model</Label>
              <Select value={speechModel} onValueChange={setSpeechModel} disabled={loadingCatalogue}>
                <SelectTrigger id="gen-speech-model">
                  <SelectValue placeholder={loadingCatalogue ? "Loading…" : "No models"} />
                </SelectTrigger>
                <SelectContent>
                  {speechModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {activeSpeechModel && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={activeSpeechModel.supportsSeed ? "sage" : "outline"}>
                {activeSpeechModel.supportsSeed ? "seed supported" : "no seed"}
              </Badge>
              <Badge tone={activeSpeechModel.supportsDurationRequest ? "sage" : "outline"}>
                {activeSpeechModel.supportsDurationRequest
                  ? "duration request honoured"
                  : "duration follows the text"}
              </Badge>
              <Badge tone="outline">
                max {activeSpeechModel.maxCharacters.toLocaleString()} chars
              </Badge>
              <span
                className={`font-mono text-[11px] ${
                  text.length > activeSpeechModel.maxCharacters ? "text-rust" : "text-ink-faint"
                }`}
              >
                {text.length} chars
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="gen-text">Script</Label>
            <Textarea
              id="gen-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              className="font-serif leading-7"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gen-rate">Speaking rate</Label>
            <Input
              id="gen-rate"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              className="max-w-32"
            />
            <p className="text-[11px] leading-4 text-ink-faint">
              Bounded to 0.90–1.10×. Outside that range the request is rejected rather than quietly
              clamped.
            </p>
          </div>

          <Button
            variant="clay"
            disabled={running !== null || !voiceId || !speechModel}
            onClick={() => generate("speech")}
          >
            {running === "speech" ? <Loader2 className="animate-spin" /> : <Mic2 />}
            {running === "speech" ? "Generating and measuring…" : "Generate narration"}
          </Button>
        </TabsContent>

        <TabsContent value="ambient" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gen-sound-model">Model</Label>
              <Select value={soundModel} onValueChange={setSoundModel} disabled={loadingCatalogue}>
                <SelectTrigger id="gen-sound-model">
                  <SelectValue placeholder={loadingCatalogue ? "Loading…" : "No models"} />
                </SelectTrigger>
                <SelectContent>
                  {soundModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-seconds">Requested duration (s)</Label>
              <Input
                id="gen-seconds"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gen-prompt">Prompt</Label>
            <Textarea
              id="gen-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
            />
          </div>

          {soundModels.length === 0 && !loadingCatalogue && (
            <p className="text-[12px] leading-5 text-amber">
              This provider exposes no sound-generation model. Capabilities differ per model, so the
              control is disabled rather than failing at request time.
            </p>
          )}

          <Button
            variant="clay"
            disabled={running !== null || !soundModel}
            onClick={() => generate("ambient")}
          >
            {running === "ambient" ? <Loader2 className="animate-spin" /> : <Waves />}
            {running === "ambient" ? "Generating and measuring…" : "Generate ambient"}
          </Button>
        </TabsContent>
      </Tabs>

      {result?.ok && result.analysis && (
        <div className="rounded-lg border border-sage/25 bg-sage-soft/40 p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <CheckCircle2 className="size-4 text-sage" />
            Generated by {result.provider} · {result.model} · measured with ffprobe
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <div>
              <dt className="label-eyebrow">Provider said</dt>
              <dd className="font-mono text-[13px] tabular-nums text-ink-muted">
                {result.reportedDurationSeconds !== null &&
                result.reportedDurationSeconds !== undefined
                  ? `${result.reportedDurationSeconds.toFixed(1)}s`
                  : "nothing"}
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">ffprobe measured</dt>
              <dd className="font-mono text-[13px] tabular-nums text-ink">
                {result.analysis.durationSeconds.toFixed(2)}s
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">Difference</dt>
              <dd
                className={`font-mono text-[13px] tabular-nums ${
                  result.withinTolerance ? "text-ink-soft" : "text-amber"
                }`}
              >
                {result.durationDeltaSeconds === null || result.durationDeltaSeconds === undefined
                  ? "—"
                  : `${result.durationDeltaSeconds >= 0 ? "+" : ""}${result.durationDeltaSeconds.toFixed(2)}s`}
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">Cost estimate</dt>
              <dd className="font-mono text-[13px] tabular-nums text-ink-soft">
                ${(result.costEstimateUsd ?? 0).toFixed(4)}
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">Codec</dt>
              <dd className="font-mono text-[13px] text-ink-soft">{result.analysis.codec}</dd>
            </div>
            <div>
              <dt className="label-eyebrow">Sample rate</dt>
              <dd className="font-mono text-[13px] tabular-nums text-ink-soft">
                {result.analysis.sampleRate.toLocaleString()} Hz
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">Peak</dt>
              <dd className="font-mono text-[13px] tabular-nums text-ink-soft">
                {result.analysis.peakDb !== null ? `${result.analysis.peakDb} dB` : "—"}
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">Loudness</dt>
              <dd className="font-mono text-[13px] tabular-nums text-ink-soft">
                {result.analysis.loudnessLufs !== null
                  ? `${result.analysis.loudnessLufs} LUFS`
                  : "—"}
              </dd>
            </div>
          </dl>

          {result.playbackUrl && (
            <audio
              controls
              src={result.playbackUrl}
              className="mt-3 w-full"
              aria-label="Generated audio preview"
            />
          )}

          <p className="mt-2 text-[11px] leading-4 text-ink-faint">
            The measured value is the only one stored as true. What the provider claimed is kept
            beside it so the gap stays visible.
          </p>
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-lg border border-rust/25 bg-rust-soft/40 p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <AlertTriangle className="size-4 text-rust" />
            Generation failed
          </p>
          <p className="mt-1 text-[12px] leading-5 text-ink-muted">{result.error}</p>
        </div>
      )}
    </div>
  );
}
