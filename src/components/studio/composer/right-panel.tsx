"use client";

import { useState } from "react";
import {
  AudioLines,
  CheckCircle2,
  Gauge,
  Loader2,
  Split,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionActions } from "./session-actions";
import type { ComposerSettings, Voice } from "@/domain/types";

interface RightPanelProps {
  experienceId: string;
  hasScript: boolean;
  canEdit: boolean;
  settings: ComposerSettings;
  voices: Voice[];
  soundStyles: string[];
  llmProviders: Array<{ id: string; label: string; configured: boolean }>;
  ttsProviders: Array<{ id: string; label: string; configured: boolean }>;
  perspectives: Array<{ key: string; label: string }>;
  /** Voice ids removed by a hard user boundary — shown, but not selectable. */
  blockedVoiceIds: string[];
}

const ADVISORY_ACTIONS = [
  { key: "improve", label: "Improve selected section", icon: Wand2 },
  { key: "alternative", label: "Create alternative", icon: Split },
  { key: "claims", label: "Check scientific claims", icon: CheckCircle2 },
  { key: "flow", label: "Re-run flow validation", icon: Gauge },
  { key: "assemble", label: "Open in Audio Lab", icon: AudioLines },
] as const;



export function ComposerRightPanel({
  experienceId,
  hasScript,
  canEdit,
  settings,
  voices,
  soundStyles,
  llmProviders,
  ttsProviders,
  perspectives,
  blockedVoiceIds,
}: RightPanelProps) {
  const [running, setRunning] = useState<string | null>(null);
  const [silenceRatio, setSilenceRatio] = useState(settings.silenceRatio);
  const [speakingRate, setSpeakingRate] = useState(settings.speakingRate);
  const [soundIntensity, setSoundIntensity] = useState(settings.soundIntensity);
  const [voiceId, setVoiceId] = useState(settings.voiceId);
  const [provider, setProvider] = useState(settings.llmProvider);

  // The prototype does not persist; running an action shows the state machine
  // the real handler drives, without pretending work happened.
  function run(key: string) {
    setRunning(key);
    window.setTimeout(() => setRunning(null), 900);
  }

  return (
    <Tabs defaultValue="actions" className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-2">
        <TabsList className="w-full">
          <TabsTrigger value="actions" className="flex-1">
            Actions
          </TabsTrigger>
          <TabsTrigger value="generation" className="flex-1">
            Generation
          </TabsTrigger>
          <TabsTrigger value="audio" className="flex-1">
            Audio
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="scroll-quiet flex-1 overflow-y-auto px-4 py-4">
        <TabsContent value="actions" className="mt-0 space-y-5">
          <section>
            <p className="label-eyebrow mb-2">Pipeline</p>
            <SessionActions
              experienceId={experienceId}
              hasScript={hasScript}
              canEdit={canEdit}
            />
          </section>

          <section>
            <p className="label-eyebrow mb-2">
              Not yet wired
              <span className="ml-1.5 normal-case tracking-normal text-ink-faint">
                shown so the gap is visible
              </span>
            </p>
            <div className="space-y-1">
              {ADVISORY_ACTIONS.map((action) => {
                const Icon = action.icon;
                const isRunning = running === action.key;
                return (
                  <Button
                    key={action.key}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start opacity-60"
                    disabled={isRunning}
                    onClick={() => run(action.key)}
                  >
                    {isRunning ? <Loader2 className="animate-spin" /> : <Icon />}
                    {action.label}
                  </Button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-ink-faint">
              These have implementations behind them but no handler yet. They do nothing when
              pressed, and say so rather than pretending.
            </p>
          </section>
        </TabsContent>

        <TabsContent value="generation" className="mt-0 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="llm-provider">LLM provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger id="llm-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {llmProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id} disabled={!p.configured}>
                    {p.label}
                    {!p.configured && " — no key set"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="llm-model">Model</Label>
            <Select defaultValue={settings.llmModel}>
              <SelectTrigger id="llm-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock-composer-1">Mock composer (deterministic)</SelectItem>
                <SelectItem value="mock-editor-1">Mock editor (deterministic)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="temperature">Temperature</Label>
              <span className="font-mono text-[11px] text-ink-muted">{settings.temperature}</span>
            </div>
            <Slider
              id="temperature"
              defaultValue={[settings.temperature]}
              min={0}
              max={1}
              step={0.05}
              aria-label="Temperature"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prompt-template">Prompt template</Label>
            <Select defaultValue={settings.promptTemplate}>
              <SelectTrigger id="prompt-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="osora-compose-v3">osora-compose-v3</SelectItem>
                <SelectItem value="osora-compose-v2">osora-compose-v2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="perspective">Professional perspective</Label>
            <Select defaultValue={settings.professionalPerspective ?? "none"}>
              <SelectTrigger id="perspective">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {perspectives.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-4 text-ink-faint">
              An editorial lens for drafting. It does not satisfy a review requirement.
            </p>
          </div>

          <div className="rounded-md border border-line bg-surface-muted px-2.5 py-2">
            <p className="text-[11px] leading-4 text-ink-muted">
              The model receives the frozen plan and a hard-constraint block. It cannot add
              sections, exceed a word budget, or reintroduce anything gating removed.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="audio" className="mt-0 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tts-provider">Voice provider</Label>
            <Select defaultValue="mock">
              <SelectTrigger id="tts-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ttsProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id} disabled={!p.configured}>
                    {p.label}
                    {!p.configured && " — no key set"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="voice">Voice</Label>
            <Select value={voiceId} onValueChange={setVoiceId}>
              <SelectTrigger id="voice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {voices.map((voice) => {
                  const blocked = blockedVoiceIds.includes(voice.id);
                  return (
                    <SelectItem key={voice.id} value={voice.id} disabled={blocked || !voice.approved}>
                      {voice.name}
                      {blocked && " — blocked by boundary"}
                      {!blocked && !voice.approved && " — not approved"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="voice-style">Style</Label>
              <Select defaultValue={settings.voiceStyle}>
                <SelectTrigger id="voice-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unhurried">Unhurried</SelectItem>
                  <SelectItem value="close">Close</SelectItem>
                  <SelectItem value="warm">Warm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="language">Language</Label>
              <Select defaultValue={settings.language}>
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="rate">Speaking rate</Label>
              <span className="font-mono text-[11px] text-ink-muted">{speakingRate.toFixed(2)}×</span>
            </div>
            <Slider
              id="rate"
              value={[speakingRate]}
              onValueChange={([v]) => setSpeakingRate(v)}
              min={0.9}
              max={1.1}
              step={0.01}
              aria-label="Speaking rate"
            />
            <p className="text-[11px] leading-4 text-ink-faint">
              Bounded to 0.90–1.10×. Compressing narration to hit a duration damages the pacing the
              plan was built for.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="stability">Voice stability</Label>
              <span className="font-mono text-[11px] text-ink-muted">{settings.voiceStability}</span>
            </div>
            <Slider
              id="stability"
              defaultValue={[settings.voiceStability]}
              min={0}
              max={1}
              step={0.01}
              aria-label="Voice stability"
            />
          </div>

          <div className="space-y-1.5 border-t border-line pt-4">
            <Label htmlFor="sound-style">Sound style</Label>
            <Select defaultValue={settings.soundStyle}>
              <SelectTrigger id="sound-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {soundStyles.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="intensity">Sound intensity</Label>
              <span className="font-mono text-[11px] text-ink-muted">
                {soundIntensity.toFixed(2)}
              </span>
            </div>
            <Slider
              id="intensity"
              value={[soundIntensity]}
              onValueChange={([v]) => setSoundIntensity(v)}
              min={0}
              max={1}
              step={0.01}
              aria-label="Sound intensity"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="silence">Silence ratio</Label>
              <span className="font-mono text-[11px] text-ink-muted">
                {Math.round(silenceRatio * 100)}%
              </span>
            </div>
            <Slider
              id="silence"
              value={[silenceRatio]}
              onValueChange={([v]) => setSilenceRatio(v)}
              min={0}
              max={1}
              step={0.01}
              aria-label="Silence ratio"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="label-eyebrow">Fade in</p>
              <p className="font-mono text-[13px] text-ink-soft">{settings.fadeInSeconds}s</p>
            </div>
            <div>
              <p className="label-eyebrow">Fade out</p>
              <p className="font-mono text-[13px] text-ink-soft">{settings.fadeOutSeconds}s</p>
            </div>
            <div>
              <p className="label-eyebrow">Loudness target</p>
              <p className="font-mono text-[13px] text-ink-soft">{settings.loudnessTargetLufs} LUFS</p>
            </div>
            <div>
              <p className="label-eyebrow">Target</p>
              <p className="font-mono text-[13px] text-ink-soft">
                {Math.round(settings.targetSeconds / 60)} min
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-3">
            <div>
              <p className="label-eyebrow">Familiarity</p>
              <p className="font-mono text-[13px] text-ink-soft">
                {Math.round(settings.familiarityRatio * 100)}%
              </p>
            </div>
            <div className="text-right">
              <p className="label-eyebrow">Exploration</p>
              <p className="font-mono text-[13px] text-ink-soft">
                {Math.round(settings.explorationRatio * 100)}%
              </p>
            </div>
            <Badge tone={settings.familiarityRatio >= 0.7 ? "sage" : "amber"}>
              {settings.familiarityRatio >= 0.7 ? "In band" : "Below DNA target"}
            </Badge>
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );
}
