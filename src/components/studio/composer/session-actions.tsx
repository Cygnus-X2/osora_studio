"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, Send, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateScriptAction, submitForReviewAction } from "@/app/(studio)/composer/actions";
import type { AudioAnalysis } from "@/domain/types";

interface RenderResponse {
  ok: boolean;
  error?: string;
  steps: Array<{ step: string; detail: string }>;
  playbackUrl?: string;
  analysis?: AudioAnalysis;
  targetSeconds?: number;
  deltaSeconds?: number;
  sectionsRendered?: number;
  costEstimateUsd?: number;
}

/**
 * The three actions that actually change something.
 *
 * They are ordered because the pipeline is: there is nothing to render until
 * there is a script, and nothing to review until there is something to listen
 * to. The buttons disable themselves accordingly rather than failing later.
 */
export function SessionActions({
  experienceId,
  hasScript,
  canEdit,
}: {
  experienceId: string;
  hasScript: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"script" | "render" | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [render, setRender] = useState<RenderResponse | null>(null);

  function runScript() {
    setError(null);
    setBusy("script");
    startTransition(async () => {
      const result = await generateScriptAction(experienceId);
      if (!result.ok) setError(result.error ?? "Script generation failed.");
      setBusy(null);
      router.refresh();
    });
  }

  function submit() {
    setError(null);
    setBusy("review");
    startTransition(async () => {
      const result = await submitForReviewAction(experienceId);
      if (!result.ok) setError(result.error ?? "Could not submit.");
      setBusy(null);
      router.refresh();
    });
  }

  async function renderAudio() {
    setError(null);
    setBusy("render");
    setRender(null);
    try {
      const response = await fetch(`/api/sessions/${experienceId}/render`, { method: "POST" });
      const data = (await response.json()) as RenderResponse;
      setRender(data);
      if (!data.ok) setError(data.error ?? "Render failed.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Render failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          disabled={!canEdit || busy !== null || pending}
          onClick={runScript}
        >
          {busy === "script" ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {hasScript ? "Regenerate script" : "Generate script"}
        </Button>

        <Button
          variant="clay"
          size="sm"
          className="w-full justify-start"
          disabled={!hasScript || busy !== null}
          onClick={renderAudio}
          title={hasScript ? undefined : "Generate the script first"}
        >
          {busy === "render" ? <Loader2 className="animate-spin" /> : <PlayCircle />}
          {busy === "render" ? "Narrating and mixing…" : "Render session"}
        </Button>

        <Button
          variant="subtle"
          size="sm"
          className="w-full justify-start"
          disabled={!canEdit || busy !== null || pending}
          onClick={submit}
        >
          {busy === "review" ? <Loader2 className="animate-spin" /> : <Send />}
          Submit for review
        </Button>
      </div>

      {busy === "render" && (
        <p className="text-[11px] leading-4 text-ink-faint">
          Each section is narrated and measured separately, then the timeline is re-derived from
          what the audio actually is. A twelve-minute session takes a minute or two.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-rust/25 bg-rust-soft/40 p-2.5">
          <p className="flex gap-2 text-[12px] leading-5 text-ink-soft">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-rust" />
            {error}
          </p>
        </div>
      )}

      {render?.ok && render.analysis && (
        <div className="rounded-md border border-sage/25 bg-sage-soft/40 p-3">
          <p className="flex items-center gap-2 text-[12px] font-medium text-ink">
            <CheckCircle2 className="size-3.5 text-sage" />
            Rendered and measured
          </p>

          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div>
              <dt className="label-eyebrow">Length</dt>
              <dd className="font-mono text-[12px] tabular-nums text-ink">
                {formatSpan(render.analysis.durationSeconds)}
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">Against target</dt>
              <dd
                className={`font-mono text-[12px] tabular-nums ${
                  Math.abs(render.deltaSeconds ?? 0) <= 30 ? "text-sage" : "text-amber"
                }`}
              >
                {render.deltaSeconds === undefined
                  ? "—"
                  : `${render.deltaSeconds >= 0 ? "+" : ""}${render.deltaSeconds.toFixed(1)}s`}
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">Loudness</dt>
              <dd className="font-mono text-[12px] tabular-nums text-ink-soft">
                {render.analysis.loudnessLufs ?? "—"} LUFS
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">Cost</dt>
              <dd className="font-mono text-[12px] tabular-nums text-ink-soft">
                ${(render.costEstimateUsd ?? 0).toFixed(3)}
              </dd>
            </div>
          </dl>

          {render.playbackUrl && (
            <audio
              controls
              src={render.playbackUrl}
              className="mt-2 w-full"
              aria-label="Rendered session"
            />
          )}

          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-ink-muted">
              {render.steps.length} steps
            </summary>
            <div className="mt-1 space-y-1">
              {render.steps.map((entry, i) => (
                <p key={i} className="text-[11px] leading-4 text-ink-muted">
                  <span className="text-ink-soft">{entry.step}</span> — {entry.detail}
                </p>
              ))}
            </div>
          </details>
        </div>
      )}

      {render && !render.ok && render.steps.length > 0 && (
        <details className="rounded-md border border-line bg-surface-muted/60 p-2.5">
          <summary className="cursor-pointer text-[11px] text-ink-muted">
            Got through {render.steps.length} step(s) before failing
          </summary>
          <div className="mt-1 space-y-1">
            {render.steps.map((entry, i) => (
              <p key={i} className="text-[11px] leading-4 text-ink-muted">
                <span className="text-ink-soft">{entry.step}</span> — {entry.detail}
              </p>
            ))}
          </div>
        </details>
      )}

      {!hasScript && (
        <Badge tone="outline" className="w-full justify-center">
          No script yet — render is unavailable
        </Badge>
      )}
    </div>
  );
}

function formatSpan(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
