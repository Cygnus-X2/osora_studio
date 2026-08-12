"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AudioAnalysis } from "@/domain/types";

export interface LibraryVoice {
  id: string;
  name: string;
  description: string;
  gender: string;
  accent: string;
  languages: string[];
  /** The provider's own hosted sample, if it publishes one. */
  providerPreviewUrl: string | null;
  /** Set when this voice is already the Osora reference or is approved. */
  approved: boolean;
  isReference: boolean;
}

interface PreviewState {
  loading: boolean;
  error?: string;
  playbackUrl?: string;
  analysis?: AudioAnalysis;
  wordsPerMinute?: number | null;
  cached?: boolean;
  costEstimateUsd?: number;
}

/**
 * The voice library.
 *
 * Two kinds of preview, because they answer different questions. The
 * provider's hosted sample is free and instant and tells you the timbre. The
 * Osora sample costs a fraction of a cent and tells you the thing that
 * actually decides whether a voice is usable: how it handles an unhurried line
 * with a pause in the middle, and how many words a minute it really speaks.
 */
export function VoiceLibrary({
  voices,
  provider,
  configured,
  plannerWpm,
}: {
  voices: LibraryVoice[];
  provider: string;
  configured: boolean;
  plannerWpm: number;
}) {
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [filter, setFilter] = useState("");

  async function preview(voiceId: string, force = false) {
    setPreviews((p) => ({ ...p, [voiceId]: { loading: true } }));
    try {
      const response = await fetch("/api/voices/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId, provider, force }),
      });
      const data = await response.json();
      setPreviews((p) => ({
        ...p,
        [voiceId]: data.ok
          ? {
              loading: false,
              playbackUrl: data.playbackUrl,
              analysis: data.analysis,
              wordsPerMinute: data.wordsPerMinute,
              cached: data.cached,
              costEstimateUsd: data.costEstimateUsd,
            }
          : { loading: false, error: data.error ?? "Preview failed." },
      }));
    } catch (error) {
      setPreviews((p) => ({
        ...p,
        [voiceId]: {
          loading: false,
          error: error instanceof Error ? error.message : "Preview failed.",
        },
      }));
    }
  }

  const visible = filter.trim()
    ? voices.filter((v) =>
        `${v.name} ${v.description} ${v.accent} ${v.gender}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      )
    : voices;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Filter ${voices.length} voices…`}
          className="max-w-xs"
          aria-label="Filter voices"
        />
        <Badge tone={configured ? "sage" : "amber"}>
          {configured ? `${provider} · live` : `${provider} · no key set`}
        </Badge>
        <span className="text-[12px] text-ink-muted">
          The planner assumes {plannerWpm} words per minute. A voice far from that makes every
          duration estimate wrong before a session is written.
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((voice) => {
          const state = previews[voice.id];
          const wpm = state?.wordsPerMinute;
          const wpmOff = typeof wpm === "number" ? Math.abs(wpm - plannerWpm) : null;

          return (
            <Card key={voice.id} className={voice.isReference ? "border-clay/40" : undefined}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="truncate">{voice.name}</CardTitle>
                  <div className="flex shrink-0 gap-1.5">
                    {voice.isReference && <Badge tone="clay">Osora reference</Badge>}
                    {voice.approved && !voice.isReference && <Badge tone="sage">Approved</Badge>}
                  </div>
                </div>
                {voice.description && (
                  <p className="line-clamp-2 text-[13px] leading-6 text-ink-muted">
                    {voice.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {voice.gender !== "unspecified" && <Badge tone="stone">{voice.gender}</Badge>}
                  {voice.accent !== "unspecified" && <Badge tone="stone">{voice.accent}</Badge>}
                  {voice.languages.map((l) => (
                    <Badge key={l} tone="outline">
                      {l}
                    </Badge>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {voice.providerPreviewUrl && (
                  <div>
                    <p className="label-eyebrow mb-1">Provider sample</p>
                    <audio
                      controls
                      preload="none"
                      src={voice.providerPreviewUrl}
                      className="h-8 w-full"
                      aria-label={`Provider sample for ${voice.name}`}
                    />
                  </div>
                )}

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="label-eyebrow">Osora sample</p>
                    {state?.cached && <span className="text-[10px] text-ink-faint">cached</span>}
                  </div>

                  {state?.playbackUrl ? (
                    <>
                      <audio
                        controls
                        src={state.playbackUrl}
                        className="h-8 w-full"
                        aria-label={`Osora sample for ${voice.name}`}
                      />
                      <dl className="mt-2 grid grid-cols-3 gap-2">
                        <div>
                          <dt className="label-eyebrow">Length</dt>
                          <dd className="font-mono text-[12px] tabular-nums text-ink-soft">
                            {state.analysis?.durationSeconds.toFixed(1)}s
                          </dd>
                        </div>
                        <div>
                          <dt className="label-eyebrow">Words / min</dt>
                          <dd
                            className={`font-mono text-[12px] tabular-nums ${
                              wpmOff !== null && wpmOff > 25 ? "text-amber" : "text-ink-soft"
                            }`}
                          >
                            {wpm ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="label-eyebrow">Loudness</dt>
                          <dd className="font-mono text-[12px] tabular-nums text-ink-soft">
                            {state.analysis?.loudnessLufs ?? "—"}
                          </dd>
                        </div>
                      </dl>
                      {wpmOff !== null && wpmOff > 25 && (
                        <p className="mt-1 text-[11px] leading-4 text-amber">
                          {wpm} wpm against a {plannerWpm} planning rate. Sessions using this voice
                          will drift and the render will absorb it into silence.
                        </p>
                      )}
                      <Button
                        variant="ghost"
                        size="xs"
                        className="mt-1"
                        onClick={() => preview(voice.id, true)}
                        disabled={state.loading}
                      >
                        Regenerate
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={state?.loading || !configured}
                      onClick={() => preview(voice.id)}
                    >
                      {state?.loading ? (
                        <Loader2 className="animate-spin" />
                      ) : voice.providerPreviewUrl ? (
                        <Sparkles />
                      ) : (
                        <Play />
                      )}
                      {state?.loading ? "Generating and measuring…" : "Hear it read Osora copy"}
                    </Button>
                  )}

                  {state?.error && (
                    <p className="mt-1.5 flex gap-1.5 text-[11px] leading-4 text-rust">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                      {state.error}
                    </p>
                  )}
                </div>

                <p className="truncate border-t border-line pt-2 font-mono text-[10px] text-ink-faint">
                  {voice.id}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface-muted/50 px-4 py-8 text-center text-[13px] text-ink-muted">
          No voice matches “{filter}”.
        </p>
      )}
    </div>
  );
}
