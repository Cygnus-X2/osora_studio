import { Check, Minus } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { AssetStatusBadge, DeltaValue } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { store } from "@/data/store";
import { formatSeconds } from "@/domain/timeline/planner";
import { formatBytes, relativeTime } from "@/lib/format";

export const metadata = { title: "Voices · Osora Studio" };

/**
 * Model capabilities differ per model, not per provider. Showing them here is
 * what stops the composer from offering a control the selected model ignores.
 */
const MODEL_CAPABILITIES = [
  {
    provider: "Mock",
    id: "mock_speech_v2",
    label: "Mock speech v2",
    tts: true,
    sfx: false,
    ambient: false,
    seed: true,
    duration: false,
    maxChars: 5_000,
    note: "Duration follows the text. A requested duration is ignored.",
  },
  {
    provider: "ElevenLabs",
    id: "eleven_multilingual_v2",
    label: "Multilingual v2",
    tts: true,
    sfx: false,
    ambient: false,
    seed: true,
    duration: false,
    maxChars: 10_000,
    note: "Returns no duration at all — the file must be measured.",
  },
  {
    provider: "ElevenLabs",
    id: "eleven_turbo_v2_5",
    label: "Turbo v2.5",
    tts: true,
    sfx: false,
    ambient: false,
    seed: true,
    duration: false,
    maxChars: 40_000,
    note: "Cheaper, slightly less stable on long unhurried delivery.",
  },
  {
    provider: "ElevenLabs",
    id: "eleven_text_to_sound_v2",
    label: "Text to sound v2",
    tts: false,
    sfx: true,
    ambient: true,
    seed: false,
    duration: true,
    maxChars: 450,
    note: "Accepts a requested duration and frequently returns a different one.",
  },
];

function Cap({ on }: { on: boolean }) {
  return on ? (
    <Check className="size-3.5 text-sage" />
  ) : (
    <Minus className="size-3.5 text-ink-faint" />
  );
}

export default function VoicesPage() {
  const voices = store.voices();
  const assets = store.audioAssets().filter((a) => a.kind === "narration");

  return (
    <>
      <PageHeader
        eyebrow="Voice library"
        title="Voices"
        description="Voice identity is a stable DNA element. It changes only when a hard boundary blocks it, or when an experiment deliberately moves it — and even then, moving it is a separate decision from acting on the result."
        actions={<Button variant="outline">Generate preview</Button>}
      />

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {voices.map((voice) => {
          const preview = voice.previewAssetId
            ? store.audioAssets().find((a) => a.id === voice.previewAssetId)
            : null;

          return (
            <Card key={voice.id} className={voice.approved ? "" : "opacity-75"}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{voice.name}</CardTitle>
                  {voice.approved ? (
                    <Badge tone="sage">Approved</Badge>
                  ) : (
                    <Badge tone="amber">Evaluating</Badge>
                  )}
                </div>
                <p className="text-[13px] leading-6 text-ink-muted">{voice.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div>
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span className="text-ink-muted">Warmth</span>
                      <span className="font-mono text-ink-faint">{voice.warmth.toFixed(2)}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-canvas-sunk">
                      <div className="h-full bg-clay" style={{ width: `${voice.warmth * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span className="text-ink-muted">Pace</span>
                      <span className="font-mono text-ink-faint">{voice.pace.toFixed(2)}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-canvas-sunk">
                      <div className="h-full bg-stone" style={{ width: `${voice.pace * 100}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {voice.suitableFor.map((tag) => (
                    <Badge key={tag} tone="stone">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-line pt-2 text-[11px]">
                  <span className="font-mono text-ink-faint">{voice.providerVoiceId}</span>
                  <span className="text-ink-muted">{voice.languages.join(", ")}</span>
                </div>

                {preview ? (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-ink-muted">Preview</span>
                    <span className="font-mono text-ink-soft">
                      {formatSeconds(preview.actualDurationSeconds ?? 0)} measured
                    </span>
                  </div>
                ) : (
                  <Button variant="subtle" size="xs" className="w-full">
                    Generate preview
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SectionHeading
        title="Model capabilities"
        description="Never assume every model in a provider does the same things."
      />
      <Card className="mb-8">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-center">Speech</TableHead>
                <TableHead className="text-center">Sound FX</TableHead>
                <TableHead className="text-center">Ambient</TableHead>
                <TableHead className="text-center">Seed</TableHead>
                <TableHead className="text-center">Duration request</TableHead>
                <TableHead className="text-right">Max chars</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MODEL_CAPABILITIES.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    <p className="font-medium text-ink">{model.label}</p>
                    <p className="font-mono text-[11px] text-ink-faint">
                      {model.provider} · {model.id}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Cap on={model.tts} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Cap on={model.sfx} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Cap on={model.ambient} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Cap on={model.seed} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Cap on={model.duration} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-ink-soft">
                    {model.maxChars.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-ink-muted">{model.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SectionHeading
        title="Generated narration"
        description="Requested against measured. The two rarely agree, which is why only one of them is stored as true."
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Requested</TableHead>
                <TableHead className="text-right">Measured</TableHead>
                <TableHead className="text-right">Delta</TableHead>
                <TableHead className="text-right">Peak</TableHead>
                <TableHead className="text-right">Loudness</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-mono text-[12px] text-ink">{asset.name}</TableCell>
                  <TableCell>
                    <AssetStatusBadge status={asset.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-ink-muted">
                    {asset.requestedDurationSeconds !== null
                      ? formatSeconds(asset.requestedDurationSeconds)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-ink-soft">
                    {asset.actualDurationSeconds !== null
                      ? formatSeconds(asset.actualDurationSeconds)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeltaValue seconds={asset.durationDeltaSeconds} tolerance={5} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-ink-muted">
                    {asset.analysis?.peakDb !== null && asset.analysis?.peakDb !== undefined
                      ? `${asset.analysis.peakDb} dB`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-ink-muted">
                    {asset.analysis?.loudnessLufs !== null && asset.analysis?.loudnessLufs !== undefined
                      ? `${asset.analysis.loudnessLufs} LUFS`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-ink-muted">
                    {asset.analysis ? formatBytes(asset.analysis.fileSizeBytes) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-ink-muted">
                    {relativeTime(asset.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {assets.some((a) => a.status === "failed") && (
        <p className="mt-3 text-[12px] leading-5 text-rust">
          One asset failed measurement. It stays at <code className="font-mono">failed</code> rather
          than falling back to the requested duration — an unmeasured file can never be marked
          ready.
        </p>
      )}
    </>
  );
}
