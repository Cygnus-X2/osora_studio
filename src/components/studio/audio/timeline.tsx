"use client";

import { useState } from "react";
import { Lock, Volume2, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatSeconds } from "@/domain/timeline/planner";
import type { AudioProject, AudioTrackKind } from "@/domain/types";

const TRACK_COLOUR: Record<AudioTrackKind, string> = {
  narration: "bg-clay/70 border-clay",
  ambient: "bg-stone/50 border-stone",
  music: "bg-slate/45 border-slate",
  sfx: "bg-sand/60 border-sand",
  breath_cue: "bg-sage/50 border-sage",
  silence: "bg-line-strong/60 border-line-strong",
  intro: "bg-amber/40 border-amber",
  outro: "bg-amber/40 border-amber",
};

/**
 * A simplified multitrack view.
 *
 * Clip positions are drawn from measured durations, so what is on screen is the
 * arrangement as it actually is rather than as it was requested. The ruler ends
 * at the target duration, which makes an overrun visible as clips crossing the
 * target line rather than as a number in a table.
 */
export function AudioTimeline({ project }: { project: AudioProject }) {
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [soloTrack, setSoloTrack] = useState<string | null>(null);
  const [muted, setMuted] = useState<Set<string>>(
    () => new Set(project.tracks.filter((t) => t.muted).map((t) => t.id)),
  );

  const span = Math.max(project.targetSeconds, project.arrangedSeconds) * 1.02;
  const ticks = Math.ceil(span / 60);

  function toggleMute(trackId: string) {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }

  const selected = project.tracks
    .flatMap((t) => t.clips.map((c) => ({ clip: c, track: t })))
    .find((entry) => entry.clip.id === selectedClip);

  return (
    <div className="space-y-4">
      <div className="scroll-quiet overflow-x-auto rounded-lg border border-line bg-surface">
        <div className="min-w-[720px]">
          {/* Ruler */}
          <div className="flex border-b border-line">
            <div className="w-44 shrink-0 border-r border-line px-3 py-2">
              <p className="label-eyebrow">Tracks</p>
            </div>
            <div className="relative flex-1 py-2">
              {Array.from({ length: ticks + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full border-l border-line/70"
                  style={{ left: `${((i * 60) / span) * 100}%` }}
                >
                  <span className="ml-1 font-mono text-[10px] text-ink-faint">{i}:00</span>
                </div>
              ))}
              {/* The target line — clips crossing it are the overrun. */}
              <div
                className="absolute top-0 h-full border-l-2 border-dashed border-clay/60"
                style={{ left: `${(project.targetSeconds / span) * 100}%` }}
                title={`Target ${formatSeconds(project.targetSeconds)}`}
              />
            </div>
          </div>

          {/* Tracks */}
          {project.tracks.map((track) => {
            const isMuted = muted.has(track.id) || (soloTrack !== null && soloTrack !== track.id);
            return (
              <div key={track.id} className="flex border-b border-line last:border-0">
                <div className="flex w-44 shrink-0 flex-col justify-center gap-1 border-r border-line px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-soft">
                      {track.name}
                    </p>
                    {track.locked && <Lock className="size-3 shrink-0 text-ink-faint" />}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleMute(track.id)}
                      aria-label={muted.has(track.id) ? `Unmute ${track.name}` : `Mute ${track.name}`}
                      aria-pressed={muted.has(track.id)}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-xs transition-colors",
                        muted.has(track.id)
                          ? "bg-rust-soft text-rust"
                          : "text-ink-faint hover:bg-surface-muted",
                      )}
                    >
                      {muted.has(track.id) ? (
                        <VolumeX className="size-3" />
                      ) : (
                        <Volume2 className="size-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSoloTrack(soloTrack === track.id ? null : track.id)}
                      aria-label={`Solo ${track.name}`}
                      aria-pressed={soloTrack === track.id}
                      className={cn(
                        "flex h-5 items-center rounded-xs px-1.5 text-[10px] font-medium transition-colors",
                        soloTrack === track.id
                          ? "bg-clay text-white"
                          : "text-ink-faint hover:bg-surface-muted",
                      )}
                    >
                      S
                    </button>
                    <span className="ml-auto font-mono text-[10px] text-ink-faint">
                      {track.volumeDb > 0 ? "+" : ""}
                      {track.volumeDb} dB
                    </span>
                  </div>
                </div>

                <div className={cn("relative h-14 flex-1", isMuted && "opacity-35")}>
                  {track.clips.map((clip) => (
                    <button
                      key={clip.id}
                      type="button"
                      onClick={() => setSelectedClip(clip.id === selectedClip ? null : clip.id)}
                      title={`${clip.name} · ${formatSeconds(clip.durationSeconds)}`}
                      className={cn(
                        "absolute top-2 flex h-10 items-center overflow-hidden rounded-sm border px-2 text-left transition-shadow",
                        TRACK_COLOUR[track.kind],
                        selectedClip === clip.id && "ring-2 ring-ink/30",
                      )}
                      style={{
                        left: `${(clip.startSeconds / span) * 100}%`,
                        width: `${Math.max(1.5, (clip.durationSeconds / span) * 100)}%`,
                      }}
                    >
                      <span className="truncate text-[10px] font-medium text-ink">{clip.name}</span>
                      {clip.loop && (
                        <span className="ml-1 shrink-0 font-mono text-[9px] text-ink/60">loop</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Clip inspector */}
      {selected ? (
        <div className="rounded-lg border border-line bg-surface p-4 shadow-quiet">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-ink">{selected.clip.name}</p>
              <p className="text-[12px] text-ink-muted">{selected.track.name}</p>
            </div>
            <Badge tone="stone">{selected.track.kind.replace(/_/g, " ")}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { label: "Start", value: formatSeconds(selected.clip.startSeconds) },
              { label: "Duration", value: formatSeconds(selected.clip.durationSeconds) },
              { label: "End", value: formatSeconds(selected.clip.startSeconds + selected.clip.durationSeconds) },
              { label: "Trim offset", value: `${selected.clip.offsetSeconds}s` },
              { label: "Gain", value: `${selected.clip.gainDb > 0 ? "+" : ""}${selected.clip.gainDb} dB` },
              { label: "Fade in", value: `${selected.clip.fadeInSeconds}s` },
              { label: "Fade out", value: `${selected.clip.fadeOutSeconds}s` },
            ].map((entry) => (
              <div key={entry.label}>
                <dt className="label-eyebrow">{entry.label}</dt>
                <dd className="font-mono text-[13px] tabular-nums text-ink-soft">{entry.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            {["Trim", "Move", "Loop", "Add fade", "Crossfade", "Replace asset", "Add silence"].map(
              (action) => (
                <Button key={action} variant="subtle" size="xs" disabled={selected.track.locked}>
                  {action}
                </Button>
              ),
            )}
          </div>
          {selected.track.locked && (
            <p className="mt-2 text-[11px] text-ink-faint">
              This track is locked — silence markers are placed by the timeline planner, not by hand.
            </p>
          )}
        </div>
      ) : (
        <p className="text-[12px] text-ink-faint">
          Select a clip to inspect it. The dashed line marks the target duration.
        </p>
      )}
    </div>
  );
}
