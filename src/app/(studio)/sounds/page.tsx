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

export const metadata = { title: "Sounds · Osora Studio" };

export default function SoundsPage() {
  const sounds = store.sounds();
  const assets = store.audioAssets().filter((a) => a.kind === "ambient");
  const missingLicence = sounds.filter((s) => !s.approved);

  return (
    <>
      <PageHeader
        eyebrow="Sound library"
        title="Sounds"
        description="Continuous beds with no identifiable events. Anything a listener can name — a wave, a bird, a bell — pulls attention, which is the opposite of what the bed is for."
        actions={<Button variant="outline">Generate sound</Button>}
      />

      {missingLicence.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber/25 bg-amber-soft/50 px-4 py-3">
          <p className="text-[13px] leading-6 text-ink-soft">
            <span className="font-medium text-ink">
              {missingLicence.length} sound awaiting approval.
            </span>{" "}
            A generated sound cannot ship without complete licence metadata — the rule is blocking,
            not advisory.
          </p>
        </div>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sounds.map((sound) => {
          const asset = sound.assetId
            ? store.audioAssets().find((a) => a.id === sound.assetId)
            : null;

          return (
            <Card key={sound.id} className={sound.approved ? "" : "opacity-75"}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{sound.name}</CardTitle>
                  <div className="flex shrink-0 gap-1.5">
                    {sound.loopable && <Badge tone="stone">Loopable</Badge>}
                    {sound.approved ? (
                      <Badge tone="sage">Approved</Badge>
                    ) : (
                      <Badge tone="amber">Pending</Badge>
                    )}
                  </div>
                </div>
                <p className="text-[13px] leading-6 text-ink-muted">{sound.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* A quiet, deterministic waveform impression rather than a real render. */}
                <div className="flex h-10 items-center gap-[2px] overflow-hidden rounded-md bg-canvas-sunk px-2">
                  {Array.from({ length: 56 }).map((_, i) => {
                    const wave =
                      0.35 +
                      0.3 * Math.sin(i * 0.32 + sound.name.length) +
                      0.15 * Math.sin(i * 0.11);
                    const height = Math.max(8, wave * sound.intensity * 190);
                    return (
                      <span
                        key={i}
                        className="flex-1 rounded-full bg-stone/45"
                        style={{ height: `${Math.min(32, height)}px` }}
                      />
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <p className="label-eyebrow">Style</p>
                    <p className="font-mono text-ink-soft">{sound.style}</p>
                  </div>
                  <div>
                    <p className="label-eyebrow">Intensity</p>
                    <p className="font-mono text-ink-soft">{sound.intensity.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="label-eyebrow">Measured</p>
                    <p className="font-mono text-ink-soft">
                      {asset?.actualDurationSeconds
                        ? formatSeconds(asset.actualDurationSeconds)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="label-eyebrow">Loudness</p>
                    <p className="font-mono text-ink-soft">
                      {asset?.analysis?.loudnessLufs ? `${asset.analysis.loudnessLufs} LUFS` : "—"}
                    </p>
                  </div>
                </div>

                <div className="border-t border-line pt-2">
                  <p className="label-eyebrow">Licence</p>
                  <p
                    className={`text-[12px] leading-5 ${
                      sound.approved ? "text-ink-muted" : "text-amber"
                    }`}
                  >
                    {sound.licence}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SectionHeading
        title="Generated sound assets"
        description="Requested duration is a wish. The measured column is the only one anything downstream may use."
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
                <TableHead>Codec</TableHead>
                <TableHead className="text-right">Sample rate</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Licence</TableHead>
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
                  <TableCell className="font-mono text-[12px] text-ink-muted">
                    {asset.analysis?.codec ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-ink-muted">
                    {asset.analysis ? `${(asset.analysis.sampleRate / 1000).toFixed(1)}k` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-ink-muted">
                    {asset.analysis ? formatBytes(asset.analysis.fileSizeBytes) : "—"}
                  </TableCell>
                  <TableCell className="text-[12px] text-ink-muted">
                    {asset.licence ?? <span className="text-amber">Missing</span>}
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
    </>
  );
}
