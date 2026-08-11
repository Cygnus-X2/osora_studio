import Link from "next/link";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { AssetStatusBadge, DeltaValue, Stat } from "@/components/studio/indicators";
import { AudioGeneratePanel } from "@/components/studio/audio/generate-panel";
import { AudioUploadPanel } from "@/components/studio/audio/upload-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { store } from "@/data/store";
import { checkAudioToolchain } from "@/providers/audio/ffprobe";
import { formatSeconds } from "@/domain/timeline/planner";
import { relativeTime } from "@/lib/format";

// Probes the audio toolchain at request time. Must not be prerendered: the build
// stage has no ffmpeg, so a static render would report it permanently absent.
export const dynamic = "force-dynamic";

export const metadata = { title: "Audio Lab · Osora Studio" };

export default async function AudioLabPage() {
  const projects = store.audioProjects();
  const assets = store.audioAssets();
  const toolchain = await checkAudioToolchain();

  const unmeasured = assets.filter((a) => a.actualDurationSeconds === null);
  const drifted = assets.filter(
    (a) => a.durationDeltaSeconds !== null && Math.abs(a.durationDeltaSeconds) > 5,
  );

  return (
    <>
      <PageHeader
        eyebrow="Audio Lab"
        title="Production"
        description="Every generated or uploaded file is measured server-side before it can be used. Provider metadata is a claim; ffprobe is the answer."
      />

      {/* Toolchain */}
      <div
        className={`mb-8 rounded-lg border px-4 py-3 ${
          toolchain.ffprobe && toolchain.ffmpeg
            ? "border-sage/25 bg-sage-soft/40"
            : "border-rust/25 bg-rust-soft/40"
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`size-1.5 rounded-full ${toolchain.ffprobe ? "bg-sage" : "bg-rust"}`}
            />
            <span className="text-[13px] text-ink-soft">
              ffprobe {toolchain.ffprobe ? "available" : "not found"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${toolchain.ffmpeg ? "bg-sage" : "bg-rust"}`} />
            <span className="text-[13px] text-ink-soft">
              ffmpeg {toolchain.ffmpeg ? "available" : "not found"}
            </span>
          </div>
          {toolchain.ffprobeVersion && (
            <span className="font-mono text-[11px] text-ink-faint">
              {toolchain.ffprobeVersion}
            </span>
          )}
        </div>
        {(!toolchain.ffprobe || !toolchain.ffmpeg) && (
          <p className="mt-1.5 text-[12px] leading-5 text-ink-soft">
            Without the toolchain no asset can be marked ready. Install ffmpeg, or point{" "}
            <code className="font-mono">FFPROBE_PATH</code> and{" "}
            <code className="font-mono">FFMPEG_PATH</code> at an existing install.
          </p>
        )}
      </div>

      <div className="mb-8 grid gap-x-6 gap-y-5 rounded-lg border border-line bg-surface p-5 shadow-quiet sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Projects" value={String(projects.length)} />
        <Stat label="Assets" value={String(assets.length)} />
        <Stat
          label="Unmeasured"
          value={String(unmeasured.length)}
          tone={unmeasured.length > 0 ? "warning" : "good"}
          hint="cannot be marked ready"
        />
        <Stat
          label="Duration drift > 5s"
          value={String(drifted.length)}
          tone={drifted.length > 0 ? "warning" : "good"}
          hint="requested against measured"
        />
      </div>

      <SectionHeading title="Projects" />
      <div className="mb-10 grid gap-4 lg:grid-cols-3">
        {projects.map((project) => {
          const delta = Number((project.arrangedSeconds - project.targetSeconds).toFixed(1));
          const clips = project.tracks.reduce((sum, t) => sum + t.clips.length, 0);

          return (
            <Link key={project.id} href={`/audio-lab/${project.id}`} className="group">
              <Card className="h-full transition-shadow hover:shadow-lift">
                <CardHeader className="pb-3">
                  <CardTitle className="group-hover:text-clay">{project.name}</CardTitle>
                  <p className="text-[12px] text-ink-muted">
                    {project.tracks.length} tracks · {clips} clips · updated{" "}
                    {relativeTime(project.updatedAt)}
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-ink-muted">Arranged</span>
                    <span className="font-mono tabular-nums text-ink-soft">
                      {formatSeconds(project.arrangedSeconds)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-ink-muted">Target</span>
                    <span className="font-mono tabular-nums text-ink-soft">
                      {formatSeconds(project.targetSeconds)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-ink-muted">Difference</span>
                    <DeltaValue seconds={delta} />
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-2 text-[12px]">
                    <span className="text-ink-faint">Loudness target</span>
                    <span className="font-mono text-ink-muted">
                      {project.loudnessTargetLufs} LUFS
                    </span>
                  </div>
                  {project.exports.length > 0 ? (
                    <Badge tone="sage">
                      {project.exports.length} export
                      {project.exports.length === 1 ? "" : "s"} measured
                    </Badge>
                  ) : (
                    <Badge tone="outline">No export yet</Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="mb-8">
        <SectionHeading
          title="Generate and measure"
          description="The live path. Select a provider, generate, and the file is written, measured with ffprobe and played back — with what the provider claimed shown beside what was actually there."
        />
        <Card>
          <CardContent className="p-5">
            <AudioGeneratePanel />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            title="Upload and measure"
            description="This is not a demo path — the file is written server-side and measured with the real ffprobe binary."
          />
          <Card>
            <CardContent className="p-5">
              <AudioUploadPanel />
            </CardContent>
          </Card>
        </div>

        <div>
          <SectionHeading
            title="All assets"
            description="Generated and uploaded audio are stored separately and measured identically."
          />
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-line">
                {assets.map((asset) => (
                  <div key={asset.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
                        {asset.name}
                      </p>
                      <AssetStatusBadge status={asset.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                      <span className="text-ink-faint">{asset.origin}</span>
                      <span className="font-mono text-ink-muted">
                        req{" "}
                        {asset.requestedDurationSeconds !== null
                          ? formatSeconds(asset.requestedDurationSeconds)
                          : "—"}
                      </span>
                      <span className="font-mono text-ink-soft">
                        act{" "}
                        {asset.actualDurationSeconds !== null
                          ? formatSeconds(asset.actualDurationSeconds)
                          : "—"}
                      </span>
                      <DeltaValue seconds={asset.durationDeltaSeconds} tolerance={5} />
                      {asset.analysis && (
                        <span className="font-mono text-ink-faint">
                          {asset.analysis.codec} · {asset.analysis.channels}ch ·{" "}
                          {(asset.analysis.sampleRate / 1000).toFixed(1)}k
                        </span>
                      )}
                    </div>
                    {asset.error && (
                      <p className="mt-1 text-[12px] leading-5 text-rust">{asset.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
