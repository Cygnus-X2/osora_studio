import { AlertTriangle, Check, Minus } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { VoiceLibrary, type LibraryVoice } from "@/components/studio/voices/voice-library";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { store } from "@/data/store";
import { DEFAULT_WORDS_PER_MINUTE } from "@/domain/timeline/planner";
import { getTtsProvider, ttsProviderAvailability, type TtsProviderId } from "@/providers/tts";
import { envValue } from "@/lib/env";

// The voice list comes from the provider at request time, not from a build.
export const dynamic = "force-dynamic";
export const metadata = { title: "Voices · Osora Studio" };

function Cap({ on }: { on: boolean }) {
  return on ? (
    <Check className="size-3.5 text-sage" />
  ) : (
    <Minus className="size-3.5 text-ink-faint" />
  );
}

export default async function VoicesPage() {
  const availability = ttsProviderAvailability();
  const providerId = (envValue("TTS_PROVIDER") as TtsProviderId | undefined) ?? "mock";
  const configured = availability.find((p) => p.id === providerId)?.configured ?? false;

  let voices: LibraryVoice[] = [];
  let models: Awaited<ReturnType<ReturnType<typeof getTtsProvider>["listModels"]>> = [];
  let error: string | null = null;

  try {
    const provider = getTtsProvider(providerId);
    const [providerVoices, providerModels] = await Promise.all([
      provider.listVoices(),
      provider.listModels(),
    ]);
    models = providerModels;

    // The studio's own approved voices are matched by name so the reference
    // voice stays recognisable in a list of a hundred provider voices.
    const approved = store.voices();
    const referenceName = approved.find((v) => v.id === "voice-aurel")?.name.toLowerCase();

    voices = providerVoices.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
      gender: v.gender,
      accent: v.accent,
      languages: v.languages,
      providerPreviewUrl: v.previewUrl,
      approved: approved.some((a) => a.approved && a.name.toLowerCase() === v.name.toLowerCase()),
      isReference: !!referenceName && v.name.toLowerCase() === referenceName,
    }));
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Could not reach the voice provider.";
  }

  return (
    <>
      <PageHeader
        eyebrow="Voice library"
        title="Voices"
        description="Live from the configured provider. Voice identity is a stable Osora DNA element — it changes only when a hard boundary blocks it, or when an experiment deliberately moves it, and even then acting on the result is a separate decision."
      />

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-rust/25 bg-rust-soft/40 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rust" />
          <div>
            <p className="text-[13px] font-medium text-ink">Could not list voices</p>
            <p className="mt-0.5 text-[12px] leading-5 text-ink-muted">{error}</p>
          </div>
        </div>
      )}

      {voices.length > 0 && (
        <VoiceLibrary
          voices={voices}
          provider={providerId}
          configured={configured}
          plannerWpm={DEFAULT_WORDS_PER_MINUTE}
        />
      )}

      <SectionHeading
        className="mt-10"
        title="Model capabilities"
        description="Declared per model, not per provider, because they genuinely differ. The composer reads these so it never offers a control the selected model ignores."
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-center">Speech</TableHead>
                <TableHead className="text-center">Sound</TableHead>
                <TableHead className="text-center">Ambient</TableHead>
                <TableHead className="text-center">Seed</TableHead>
                <TableHead className="text-center">Duration request</TableHead>
                <TableHead className="text-right">Max chars</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    <p className="font-medium text-ink">{model.label}</p>
                    <p className="font-mono text-[11px] text-ink-faint">{model.id}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Cap on={model.textToSpeech} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Cap on={model.soundEffects} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Cap on={model.ambientSound} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Cap on={model.supportsSeed} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Cap on={model.supportsDurationRequest} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-ink-soft">
                    {model.maxCharacters.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-ink-muted">{model.notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
