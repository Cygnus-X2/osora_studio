import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { AudioTimeline } from "@/components/studio/audio/timeline";
import { DeltaValue, ScoreBar, Stat } from "@/components/studio/indicators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { flowAnalysisFor, store } from "@/data/store";
import { buildFilterGraph } from "@/providers/audio/ffmpeg";
import { formatSeconds } from "@/domain/timeline/planner";
import { formatBytes } from "@/lib/format";

export function generateStaticParams() {
  return store.audioProjects().map((project) => ({ id: project.id }));
}

export default async function AudioProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = store.audioProject(id);
  if (!project) notFound();

  const experience = project.experienceId ? store.experience(project.experienceId) : undefined;
  const flow = experience ? flowAnalysisFor(experience) : null;
  const delta = Number((project.arrangedSeconds - project.targetSeconds).toFixed(1));

  const clips = project.tracks.flatMap((track) =>
    track.clips.map((clip) => ({ clip, track, asset: clip.assetId ? store.audioAssets().find((a) => a.id === clip.assetId) : undefined })),
  );

  // The filter graph is shown rather than hidden — an export a reviewer cannot
  // read is an export nobody can argue with.
  const graph = buildFilterGraph({
    project,
    sources: clips
      .filter((entry) => entry.asset)
      .map((entry) => ({
        clipId: entry.clip.id,
        filePath: entry.asset?.storagePath ?? "",
        startSeconds: entry.clip.startSeconds,
        offsetSeconds: entry.clip.offsetSeconds,
        durationSeconds: entry.clip.durationSeconds,
        gainDb: entry.clip.gainDb + entry.track.volumeDb,
        fadeInSeconds: entry.clip.fadeInSeconds,
        fadeOutSeconds: entry.clip.fadeOutSeconds,
      })),
    outputPath: `exports/${project.id}.mp3`,
    format: "mp3",
    loudnessTargetLufs: project.loudnessTargetLufs,
    fadeOutSeconds: experience?.settings.fadeOutSeconds ?? 15,
    totalSeconds: project.arrangedSeconds,
  });

  return (
    <>
      <Link
        href="/audio-lab"
        className="mb-3 inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-3" /> Audio Lab
      </Link>

      <PageHeader
        eyebrow={experience ? experience.title : "Audio project"}
        title={project.name}
        actions={
          <>
            <Button variant="outline">
              <Download /> Export WAV
            </Button>
            <Button variant="clay">
              <Download /> Export MP3
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-x-6 gap-y-5 rounded-lg border border-line bg-surface p-5 shadow-quiet sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Arranged" value={formatSeconds(project.arrangedSeconds)} />
        <Stat label="Target" value={formatSeconds(project.targetSeconds)} />
        <Stat
          label="Difference"
          value={`${delta >= 0 ? "+" : ""}${delta.toFixed(1)}s`}
          tone={Math.abs(delta) <= 30 ? "good" : "danger"}
          hint="tolerance ±30s"
        />
        <Stat label="Tracks" value={String(project.tracks.length)} hint={`${clips.length} clips`} />
        <Stat label="Loudness target" value={`${project.loudnessTargetLufs} LUFS`} />
      </div>

      <SectionHeading
        title="Arrangement"
        description="Clip widths come from measured durations. The dashed line is the target."
      />
      <div className="mb-8">
        <AudioTimeline project={project} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeading title="Clip sources" description="Every placed clip resolves to a measured asset." />
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-line">
                {clips.map(({ clip, track, asset }) => (
                  <div key={clip.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] font-medium text-ink">{clip.name}</p>
                      <Badge tone="stone">{track.kind.replace(/_/g, " ")}</Badge>
                    </div>
                    {asset ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                        <span className="font-mono text-ink-faint">{asset.storagePath}</span>
                        <span className="font-mono text-ink-muted">
                          asset {formatSeconds(asset.actualDurationSeconds ?? 0)}
                        </span>
                        <span className="font-mono text-ink-soft">
                          placed {formatSeconds(clip.durationSeconds)}
                        </span>
                        <DeltaValue seconds={asset.durationDeltaSeconds} tolerance={5} />
                        {asset.analysis && (
                          <span className="font-mono text-ink-faint">
                            {formatBytes(asset.analysis.fileSizeBytes)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-[12px] text-ink-faint">
                        No asset — this is a marker placed by the timeline planner.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {project.exports.length > 0 && (
            <>
              <SectionHeading className="mt-6" title="Exports" />
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y divide-line">
                    {project.exports.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div>
                          <p className="font-mono text-[12px] text-ink">{entry.assetId}</p>
                          <p className="text-[12px] text-ink-muted">{entry.format.toUpperCase()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-[13px] tabular-nums text-ink-soft">
                            {entry.measuredSeconds !== null
                              ? formatSeconds(entry.measuredSeconds)
                              : "unmeasured"}
                          </p>
                          <p className="text-[11px] text-ink-faint">measured after export</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-6">
          {flow && (
            <div>
              <SectionHeading
                title="Flow validation"
                description="Editorial support. These scores describe the arrangement, not its therapeutic value."
              />
              <Card>
                <CardContent className="space-y-3 p-5">
                  <ScoreBar label="Overall" value={flow.scores.overall} />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <ScoreBar label="Timing" value={flow.scores.timing} />
                    <ScoreBar label="Voice pacing" value={flow.scores.voicePacing} />
                    <ScoreBar label="Sound balance" value={flow.scores.soundBalance} />
                    <ScoreBar label="Safety" value={flow.scores.safety} />
                  </div>
                  <div className="space-y-1 border-t border-line pt-3">
                    {flow.checks
                      .filter((c) => c.status !== "ok")
                      .map((check) => (
                        <div key={check.key} className="flex items-start gap-2">
                          <span
                            className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                              check.status === "blocking"
                                ? "bg-rust"
                                : check.status === "warning"
                                  ? "bg-amber"
                                  : "bg-stone"
                            }`}
                          />
                          <p className="text-[12px] leading-5 text-ink-soft">
                            <span className="font-medium">{check.label}</span> — {check.value}.{" "}
                            {check.detail}
                          </p>
                        </div>
                      ))}
                    {flow.checks.every((c) => c.status === "ok") && (
                      <p className="text-[12px] text-sage">Every check passes.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div>
            <SectionHeading
              title="Export filter graph"
              description="What ffmpeg will actually be asked to do. Deterministic, and readable before it runs."
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-[12px]">
                  ffmpeg {graph.inputs.length / 2} input
                  {graph.inputs.length / 2 === 1 ? "" : "s"} → loudnorm{" "}
                  {project.loudnessTargetLufs} LUFS
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="scroll-quiet overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-canvas-sunk p-3 font-mono text-[11px] leading-5 text-ink-muted">
                  {graph.filterComplex.split(";").join(";\n") || "No clips placed yet."}
                </pre>
              </CardContent>
            </Card>
          </div>

          {experience && (
            <Button asChild variant="outline">
              <Link href={`/composer/${experience.id}`}>Open in Session Composer</Link>
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
