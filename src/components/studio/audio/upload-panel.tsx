"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBytes } from "@/lib/format";
import type { AudioAnalysis } from "@/domain/types";

interface MeasureResponse {
  ok: boolean;
  analysis?: AudioAnalysis;
  requestedDurationSeconds?: number | null;
  durationDeltaSeconds?: number | null;
  withinTolerance?: boolean;
  status?: string;
  error?: string;
}

/**
 * Upload and measure.
 *
 * The file is written server-side and measured with ffprobe before anything is
 * reported back. Nothing here trusts the browser's idea of how long the audio
 * is — that number is exactly the kind of claim this platform exists to check.
 */
export function AudioUploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [requested, setRequested] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<MeasureResponse | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;

    setState("uploading");
    setResult(null);

    const body = new FormData();
    body.append("file", file);
    if (requested.trim()) body.append("requestedDurationSeconds", requested.trim());

    try {
      const response = await fetch("/api/audio/upload", { method: "POST", body });
      const json = (await response.json()) as MeasureResponse;
      setResult(json);
      setState(json.ok ? "done" : "error");
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Upload failed." });
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="audio-file">Audio file</Label>
        <Input
          id="audio-file"
          ref={inputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setState("idle");
            setResult(null);
          }}
        />
        {file && (
          <p className="text-[12px] text-ink-muted">
            {file.name} · {formatBytes(file.size)}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="requested-duration">Requested duration in seconds (optional)</Label>
        <Input
          id="requested-duration"
          inputMode="decimal"
          placeholder="600"
          value={requested}
          onChange={(e) => setRequested(e.target.value)}
        />
        <p className="text-[11px] leading-4 text-ink-faint">
          Recorded alongside the measurement so the difference is stored, not inferred later.
        </p>
      </div>

      <Button type="submit" variant="clay" disabled={!file || state === "uploading"}>
        {state === "uploading" ? <Loader2 className="animate-spin" /> : <Upload />}
        {state === "uploading" ? "Measuring with ffprobe…" : "Upload and measure"}
      </Button>

      {result && result.ok && result.analysis && (
        <div className="rounded-lg border border-sage/25 bg-sage-soft/40 p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <CheckCircle2 className="size-4 text-sage" />
            Measured — asset is eligible to be marked ready
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="label-eyebrow">Requested</dt>
              <dd className="font-mono text-[13px] tabular-nums text-ink-soft">
                {result.requestedDurationSeconds !== null &&
                result.requestedDurationSeconds !== undefined
                  ? `${result.requestedDurationSeconds.toFixed(1)}s`
                  : "not stated"}
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">Actual</dt>
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
              <dt className="label-eyebrow">Channels</dt>
              <dd className="font-mono text-[13px] tabular-nums text-ink-soft">
                {result.analysis.channels}
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">Bitrate</dt>
              <dd className="font-mono text-[13px] tabular-nums text-ink-soft">
                {result.analysis.bitrateKbps ? `${result.analysis.bitrateKbps} kbps` : "—"}
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
            <div>
              <dt className="label-eyebrow">Size</dt>
              <dd className="font-mono text-[13px] tabular-nums text-ink-soft">
                {formatBytes(result.analysis.fileSizeBytes)}
              </dd>
            </div>
            <div>
              <dt className="label-eyebrow">Tool</dt>
              <dd className="font-mono text-[13px] text-ink-soft">{result.analysis.tool}</dd>
            </div>
          </dl>
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-lg border border-rust/25 bg-rust-soft/40 p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <AlertTriangle className="size-4 text-rust" />
            Measurement failed — asset held at{" "}
            <code className="font-mono">{result.status ?? "failed"}</code>
          </p>
          <p className="mt-1 text-[12px] leading-5 text-ink-muted">{result.error}</p>
          <p className="mt-2 text-[12px] leading-5 text-ink-soft">
            The requested duration is not used as a fallback. An unmeasured asset cannot be marked
            ready and cannot be placed in an arrangement.
          </p>
        </div>
      )}
    </form>
  );
}
