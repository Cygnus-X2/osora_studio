"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Play, Sparkles, Star } from "lucide-react";
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
  /** On the studio shortlist — the composer offers approved voices only. */
  approved: boolean;
  isReference: boolean;
  /** Measured from a previous Osora sample, if one has been generated. */
  wordsPerMinute: number | null;
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
  databaseReady,
}: {
  voices: LibraryVoice[];
  provider: string;
  configured: boolean;
  plannerWpm: number;
  databaseReady: boolean;
}) {
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [filter, setFilter] = useState("");
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [approved, setApproved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(voices.map((v) => [v.id, v.approved])),
  );
  const [saving, setSaving] = useState<string | null>(null);

  async function toggleApproval(voice: LibraryVoice) {
    const next = !approved[voice.id];
    // Optimistic: a shortlist toggle that lags feels broken, and the failure
    // path below puts it back if the write does not land.
    setApproved((a) => ({ ...a, [voice.id]: next }));
    setSaving(voice.id);
    try {
      const response = await fetch("/api/voices/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          providerVoiceId: voice.id,
          name: voice.name,
          description: voice.description,
          gender: voice.gender,
          accent: voice.accent,
          languages: voice.languages,
          approved: next,
        }),
      });
      const data = await response.json();
      if (!data.ok) setApproved((a) => ({ ...a, [voice.id]: !next }));
    } catch {
      setApproved((a) => ({ ...a, [voice.id]: !next }));
    } finally {
      setSaving(null);
    }
  }

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

  const visible = voices
    .filter((v) => (onlyApproved ? approved[v.id] : true))
    .filter((v) =>
      filter.trim()
        ? `${v.name} ${v.description} ${v.accent} ${v.gender}`
            .toLowerCase()
            .includes(filter.toLowerCase())
        : true,
    );

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
        <Button
          variant={onlyApproved ? "clay" : "outline"}
          size="sm"
          onClick={() => setOnlyApproved((v) => !v)}
        >
          <Star className={onlyApproved ? "fill-current" : ""} />
          Shortlist ({Object.values(approved).filter(Boolean).length})
        </Button>
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
                  <div className="flex shrink-0 items-center gap-1.5">
                    {voice.isReference && <Badge tone="clay">Reference</Badge>}
                    <button
                      type="button"
                      onClick={() => toggleApproval(voice)}
                      disabled={!databaseReady || saving === voice.id}
                      aria-pressed={approved[voice.id]}
                      aria-label={
                        approved[voice.id]
                          ? `Remove ${voice.name} from the shortlist`
                          : `Add ${voice.name} to the shortlist`
                      }
                      title={
                        databaseReady
                          ? "Approved voices are the ones the composer offers"
                          : "No database configured"
                      }
                      className={`flex size-7 items-center justify-center rounded-md transition-colors ${
                        approved[voice.id]
                          ? "bg-sand-soft text-[#8a6f42]"
                          : "text-ink-faint hover:bg-surface-muted hover:text-ink-muted"
                      } disabled:opacity-40`}
                    >
                      {saving === voice.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Star className={`size-3.5 ${approved[voice.id] ? "fill-current" : ""}`} />
                      )}
                    </button>
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

                <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                  <p className="truncate font-mono text-[10px] text-ink-faint">{voice.id}</p>
                  {voice.wordsPerMinute !== null && !state?.playbackUrl && (
                    <span
                      className={`shrink-0 font-mono text-[10px] ${
                        Math.abs(voice.wordsPerMinute - plannerWpm) > 25
                          ? "text-amber"
                          : "text-ink-muted"
                      }`}
                      title="Measured previously"
                    >
                      {voice.wordsPerMinute} wpm
                    </span>
                  )}
                </div>
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
