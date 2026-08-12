"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { createSessionAction } from "@/app/(studio)/composer/actions";
import type { StateDimension } from "@/domain/types";

interface Option {
  key: string;
  label: string;
  description?: string;
}

interface NewSessionFormProps {
  dimensions: StateDimension[];
  directions: Option[];
  boundaries: Option[];
  preferences: Option[];
  familiarityGroups: Option[];
  intents: Option[];
  environments: Option[];
  databaseReady: boolean;
}

/**
 * Session intake.
 *
 * Note what is absent: there is no prompt box, and nothing here names a
 * technique. The person describes where they are and where they want to get
 * to; the State Engine decides the rest. Adding a "what should it contain"
 * field would quietly invert the product.
 */
export function NewSessionForm({
  dimensions,
  directions,
  boundaries,
  preferences,
  familiarityGroups,
  intents,
  environments,
  databaseReady,
}: NewSessionFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, number>>(() =>
    Object.fromEntries(dimensions.map((d) => [d.key, 5])),
  );
  const [minutes, setMinutes] = useState(12);

  function onSubmit(formData: FormData) {
    setError(null);
    for (const [key, value] of Object.entries(state)) {
      formData.set(`state.${key}`, String(value));
    }
    formData.set("minutes", String(minutes));

    startTransition(async () => {
      const result = await createSessionAction(formData);
      // A successful create redirects, so anything returned here is a failure.
      if (result && !result.ok) setError(result.error ?? "Could not create the session.");
    });
  }

  return (
    <form action={onSubmit} className="space-y-6">
      {!databaseReady && (
        <div className="flex items-start gap-3 rounded-lg border border-amber/25 bg-amber-soft/50 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-[13px] leading-6 text-ink-soft">
            No database is configured, so a session created here cannot be saved. Set{" "}
            <code className="font-mono">DATABASE_URL</code> and restart.
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>What is this session for</CardTitle>
          <p className="text-[13px] leading-6 text-ink-muted">
            An internal name. The listener never sees it.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="Evening reset" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="intent">Session intent</Label>
              <Select name="intent" defaultValue="wind_down">
                <SelectTrigger id="intent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intents.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="environment">Environment</Label>
              <Select name="environment" defaultValue="quiet_room">
                <SelectTrigger id="environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {environments.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="minutes">Available time</Label>
                <span className="font-mono text-[12px] text-ink-muted">{minutes} min</span>
              </div>
              <Slider
                id="minutes"
                value={[minutes]}
                onValueChange={([v]) => setMinutes(v)}
                min={3}
                max={30}
                step={1}
                aria-label="Available minutes"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="context">Context (optional)</Label>
            <Textarea
              id="context"
              name="context"
              rows={2}
              placeholder="End of a long stretch of work. Not tired enough for sleep yet."
            />
            <p className="text-[11px] leading-4 text-ink-faint">
              Free text for a reviewer. It is never parsed for clinical meaning and never reaches
              the engine as an instruction.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Current state</CardTitle>
          <p className="text-[13px] leading-6 text-ink-muted">
            Self-reported, 0–10. Leave anything you do not know at the midpoint — the engine treats
            an unanswered dimension as neutral rather than refusing to run.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {dimensions.map((dimension) => {
              const value = state[dimension.key];
              const unpleasant = dimension.higherIsPleasant ? value <= 3 : value >= 7;
              return (
                <div key={dimension.key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor={`dim-${dimension.key}`} className="truncate">
                      {dimension.name}
                    </Label>
                    <span
                      className={`font-mono text-[12px] tabular-nums ${
                        unpleasant ? "text-rust" : "text-ink-muted"
                      }`}
                    >
                      {value}
                    </span>
                  </div>
                  <Slider
                    id={`dim-${dimension.key}`}
                    value={[value]}
                    onValueChange={([v]) =>
                      setState((prev) => ({ ...prev, [dimension.key]: v }))
                    }
                    min={0}
                    max={10}
                    step={1}
                    aria-label={dimension.name}
                  />
                  <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                    {dimension.userFacingWording}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Desired direction</CardTitle>
          <p className="text-[13px] leading-6 text-ink-muted">
            Where to move toward — not which method to use. Choose one or two; more than that and
            the engine has to split its time.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {directions.map((option) => (
              <label
                key={option.key}
                className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-surface-muted/60 p-2.5 transition-colors hover:bg-surface-muted"
              >
                <Checkbox name="directions" value={option.key} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink-soft">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="block text-[11px] leading-4 text-ink-faint">
                      {option.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              Hard boundaries
              <Badge tone="rust">Never overridden</Badge>
            </CardTitle>
            <p className="text-[13px] leading-6 text-ink-muted">
              Applied at gating, before scoring. Whatever these remove cannot be reintroduced by a
              score, a preference or a model.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {boundaries.map((option) => (
              <label key={option.key} className="flex cursor-pointer items-start gap-2.5 py-1">
                <Checkbox name="boundaries" value={option.key} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-[13px] text-ink-soft">{option.label}</span>
                  {option.description && (
                    <span className="block text-[11px] leading-4 text-ink-faint">
                      {option.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                Preferences
                <Badge tone="stone">Scored</Badge>
              </CardTitle>
              <p className="text-[13px] leading-6 text-ink-muted">
                These bias the ranking. They never remove a candidate outright.
              </p>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {preferences.map((option) => (
                <label key={option.key} className="flex cursor-pointer items-center gap-2.5 py-0.5">
                  <Checkbox name="preferences" value={option.key} />
                  <span className="text-[13px] text-ink-soft">{option.label}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Already familiar with</CardTitle>
              <p className="text-[13px] leading-6 text-ink-muted">
                Drives the 80/20 familiarity split. With nothing selected the engine treats every
                block as new and stays conservative.
              </p>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {familiarityGroups.map((option) => (
                <label key={option.key} className="flex cursor-pointer items-center gap-2.5 py-0.5">
                  <Checkbox name="familiarGroups" value={option.key} />
                  <span className="text-[13px] text-ink-soft">{option.label}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-rust/25 bg-rust-soft/40 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rust" />
          <p className="text-[13px] leading-6 text-ink-soft">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="clay" size="lg" disabled={pending || !databaseReady}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {pending ? "Running the engine…" : "Create session"}
        </Button>
        <p className="text-[12px] leading-5 text-ink-muted">
          The engine gates, scores, allocates and sequences — then you land in the composer with a
          full decision trace.
        </p>
      </div>
    </form>
  );
}
