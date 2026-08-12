import "server-only";

import { randomUUID } from "node:crypto";
import { scoreDna } from "@/domain/dna/score";
import { runStateEngine } from "@/domain/engine/state-engine";
import { planTimeline } from "@/domain/timeline/planner";
import type {
  ComposerSettings,
  DesiredStateInput,
  Experience,
  ExperienceStatus,
  ExperienceVersion,
  FamiliarityGroup,
  SectionTimeline,
  SessionPlan,
  StateProfile,
  UserConstraint,
} from "@/domain/types";
import { OSORA_DNA } from "@/data/seed/dna";
import { VOICES } from "@/data/seed/audio-library";
import { isDatabaseConfigured, query } from "./client";

/**
 * The experience repository.
 *
 * This is where sessions actually live. The engine and planner run here on
 * creation and the frozen result is stored — a plan is a decision that was
 * made at a moment, not something to recompute later against a knowledge base
 * that may since have changed.
 */

const PRODUCTION = {
  maxNarrationWords: 1400,
  minSectionSeconds: 20,
  wordsPerMinute: 105,
  availableVoiceIds: VOICES.filter((v) => v.approved).map((v) => v.id),
  availableSoundStyles: ["low_bed", "warm_drone", "soft_air", "near_silence", "slow_pulse"],
};

interface ExperienceRow {
  id: string;
  slug: string | null;
  title: string;
  internal_title: string | null;
  status: ExperienceStatus;
  current_state: StateProfile;
  desired_state: DesiredStateInput;
  target_outcome: string | null;
  duration_seconds: number;
  familiarity_ratio: string | null;
  exploration_ratio: string | null;
  scientific_confidence: string | null;
  settings: ComposerSettings;
  plan: SessionPlan | null;
  timeline: SectionTimeline | null;
  constraints: UserConstraint[];
  dna_score: Experience["dnaScore"];
  required_review_skills: string[];
  contributor_ids: string[];
  audio_project_id: string | null;
  experiment_id: string | null;
  is_example: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  updated_by_name: string | null;
}

function toExperience(row: ExperienceRow): Experience {
  return {
    id: row.slug ?? row.id,
    title: row.title,
    internalTitle: row.internal_title ?? "",
    status: row.status,
    currentState: row.current_state ?? {},
    desired: row.desired_state,
    targetOutcome: row.target_outcome ?? "",
    durationSeconds: row.duration_seconds,
    plan: row.plan,
    timeline: row.timeline,
    settings: row.settings,
    constraints: row.constraints ?? [],
    contributorIds: row.contributor_ids ?? [],
    requiredReviewSkills: (row.required_review_skills ?? []) as Experience["requiredReviewSkills"],
    scientificConfidence: Number(row.scientific_confidence ?? 0),
    dnaProfileId: OSORA_DNA.id,
    dnaScore: row.dna_score,
    audioProjectId: row.audio_project_id,
    experimentId: row.experiment_id,
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by_name ?? "Studio",
    createdAt: row.created_at,
  };
}

const SELECT = `
  select e.*, p.display_name as updated_by_name
  from experiences e
  left join profiles p on p.id = e.updated_by
`;

export async function listExperiences(): Promise<Experience[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await query<ExperienceRow>(`${SELECT} order by e.updated_at desc`);
  return rows.map(toExperience);
}

export async function getExperience(idOrSlug: string): Promise<Experience | null> {
  if (!isDatabaseConfigured()) return null;
  const rows = await query<ExperienceRow>(
    `${SELECT} where e.slug = $1 or e.id::text = $1 limit 1`,
    [idOrSlug],
  );
  return rows[0] ? toExperience(rows[0]) : null;
}

export interface CreateExperienceInput {
  title: string;
  internalTitle?: string;
  currentState: StateProfile;
  desired: DesiredStateInput;
  targetOutcome?: string;
  constraints: UserConstraint[];
  familiarGroups: FamiliarityGroup[];
  settings?: Partial<ComposerSettings>;
  isExample?: boolean;
  slug?: string;
  status?: ExperienceStatus;
  contributorIds?: string[];
}

function defaultSettings(overrides: Partial<ComposerSettings> = {}): ComposerSettings {
  return {
    llmProvider: "mock",
    llmModel: "mock-composer-1",
    temperature: 0.4,
    promptTemplate: "osora-compose-v3",
    professionalPerspective: null,
    voiceId: "voice-aurel",
    voiceStyle: "unhurried",
    language: "en",
    speakingRate: 1,
    voiceStability: 0.72,
    soundModel: "mock_sound_v1",
    soundStyle: "low_bed",
    soundIntensity: 0.28,
    targetSeconds: 720,
    silenceRatio: 0.45,
    fadeInSeconds: 4,
    fadeOutSeconds: 18,
    loudnessTargetLufs: -19,
    familiarityRatio: 0.8,
    explorationRatio: 0.2,
    ...overrides,
  };
}

/**
 * Runs the engine, plans the timeline, and stores the result.
 *
 * Everything after this point edits a decision that has already been made and
 * recorded — which is what makes the trace worth keeping.
 */
export async function createExperience(input: CreateExperienceInput): Promise<Experience> {
  const plan = runStateEngine({
    currentState: input.currentState,
    desired: input.desired,
    constraints: input.constraints,
    dna: OSORA_DNA,
    familiarGroups: input.familiarGroups,
    recentInterventionKeys: [],
    outcomeBias: {},
    production: PRODUCTION,
  });

  const settings = defaultSettings({
    ...input.settings,
    targetSeconds: input.desired.availableSeconds,
    familiarityRatio: plan.familiarityRatio,
    explorationRatio: plan.explorationRatio,
    silenceRatio: plan.silenceRatio,
    voiceId: plan.voiceRecommendation?.voiceId ?? input.settings?.voiceId ?? "voice-aurel",
    soundStyle: plan.soundRecommendation?.style ?? input.settings?.soundStyle ?? "low_bed",
  });

  const timeline = planTimeline(plan, OSORA_DNA, {
    wordsPerMinute: PRODUCTION.wordsPerMinute,
    speakingRate: settings.speakingRate,
  });

  const dnaScore = scoreDna(plan, timeline, OSORA_DNA);
  const id = randomUUID();

  const rows = await query<ExperienceRow>(
    `insert into experiences
       (id, slug, title, internal_title, status, current_state, desired_state, target_outcome,
        duration_seconds, familiarity_ratio, exploration_ratio, scientific_confidence,
        settings, plan, timeline, constraints, dna_score, required_review_skills,
        contributor_ids, is_example, version)
     values ($1,$2,$3,$4,$5::experience_status,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,1)
     returning *, null::text as updated_by_name`,
    [
      id,
      input.slug ?? null,
      input.title,
      input.internalTitle ?? describeInternally(input),
      input.status ?? "composition",
      JSON.stringify(input.currentState),
      JSON.stringify(input.desired),
      input.targetOutcome ?? plan.target,
      input.desired.availableSeconds,
      plan.familiarityRatio,
      plan.explorationRatio,
      plan.confidence,
      JSON.stringify(settings),
      JSON.stringify(plan),
      JSON.stringify(timeline),
      JSON.stringify(input.constraints),
      JSON.stringify(dnaScore),
      plan.requiredReviews,
      input.contributorIds ?? [],
      input.isExample ?? false,
    ],
  );

  await writeSections(rows[0].id, timeline);
  await recordVersion(rows[0].id, 1, "Created", "Engine run at intake.", plan, timeline);
  return toExperience(rows[0]);
}

/** Mirrors the timeline into the normalised table so it stays queryable. */
async function writeSections(experienceId: string, timeline: SectionTimeline) {
  await query("delete from session_sections where experience_id = $1", [experienceId]);
  for (const section of timeline.sections) {
    await query(
      `insert into session_sections
         (experience_id, section_key, ordinal, kind, title, mechanism_key, intervention_key,
          body, word_count, word_budget, estimated_speech_seconds, actual_speech_seconds,
          pause_seconds, sound_only_seconds, transition_seconds, start_seconds, end_seconds,
          evidence_source_ids)
       values ($1,$2,$3,$4::section_kind,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        experienceId, section.id, section.order, section.kind, section.title,
        section.mechanism, section.interventionKey, section.text, section.wordCount,
        section.wordBudget, section.estimatedSpeechSeconds, section.actualSpeechSeconds,
        section.pauseSeconds, section.soundOnlySeconds, section.transitionSeconds,
        section.startSeconds, section.endSeconds, section.evidenceSourceIds,
      ],
    );
  }
}

async function recordVersion(
  experienceId: string,
  version: number,
  label: string,
  summary: string,
  plan: SessionPlan | null,
  timeline: SectionTimeline | null,
) {
  await query(
    `insert into experience_versions (experience_id, version, label, summary, payload)
     values ($1,$2,$3,$4,$5)
     on conflict (experience_id, version) do nothing`,
    [experienceId, version, label, summary, JSON.stringify({ plan, timeline })],
  );
}

/** Persists edited section text and re-derives the arrangement. */
export async function saveTimeline(
  idOrSlug: string,
  timeline: SectionTimeline,
  label: string,
  summary: string,
): Promise<Experience | null> {
  const existing = await getExperienceRow(idOrSlug);
  if (!existing) return null;

  const dnaScore = existing.plan ? scoreDna(existing.plan, timeline, OSORA_DNA) : null;
  const rows = await query<ExperienceRow>(
    `update experiences
        set timeline = $2, dna_score = $3, version = version + 1, updated_at = now()
      where id = $1
      returning *, null::text as updated_by_name`,
    [existing.id, JSON.stringify(timeline), JSON.stringify(dnaScore)],
  );

  await writeSections(existing.id, timeline);
  await recordVersion(existing.id, rows[0].version, label, summary, existing.plan, timeline);
  return toExperience(rows[0]);
}

export async function updateStatus(
  idOrSlug: string,
  status: ExperienceStatus,
): Promise<Experience | null> {
  const existing = await getExperienceRow(idOrSlug);
  if (!existing) return null;
  const rows = await query<ExperienceRow>(
    `update experiences set status = $2::experience_status, updated_at = now()
      where id = $1 returning *, null::text as updated_by_name`,
    [existing.id, status],
  );
  return toExperience(rows[0]);
}

export async function setAudioProject(idOrSlug: string, projectId: string): Promise<void> {
  const existing = await getExperienceRow(idOrSlug);
  if (!existing) return;
  await query("update experiences set audio_project_id = $2, updated_at = now() where id = $1", [
    existing.id,
    projectId,
  ]);
}

export async function listVersions(idOrSlug: string): Promise<ExperienceVersion[]> {
  const existing = await getExperienceRow(idOrSlug);
  if (!existing) return [];
  const rows = await query<{
    id: string;
    version: number;
    label: string;
    summary: string | null;
    created_at: string;
  }>(
    `select id, version, label, summary, created_at
       from experience_versions where experience_id = $1 order by version desc`,
    [existing.id],
  );
  return rows.map((r) => ({
    id: r.id,
    experienceId: idOrSlug,
    version: r.version,
    label: r.label,
    authorName: "Studio",
    createdAt: r.created_at,
    summary: r.summary ?? "",
  }));
}

async function getExperienceRow(idOrSlug: string): Promise<ExperienceRow | null> {
  const rows = await query<ExperienceRow>(
    "select *, null::text as updated_by_name from experiences where slug = $1 or id::text = $1 limit 1",
    [idOrSlug],
  );
  return rows[0] ?? null;
}

export async function experienceUuid(idOrSlug: string): Promise<string | null> {
  const row = await getExperienceRow(idOrSlug);
  return row?.id ?? null;
}

function describeInternally(input: CreateExperienceInput): string {
  const minutes = Math.round(input.desired.availableSeconds / 60);
  const notable = (Object.entries(input.currentState) as Array<[string, number]>)
    .filter(([, value]) => value >= 7 || value <= 3)
    .slice(0, 2)
    .map(([key, value]) => `${key.replace(/_/g, " ")} ${value}`)
    .join(" · ");
  return `${minutes}min${notable ? ` · ${notable}` : ""} · → ${input.desired.directions.join(", ").replace(/_/g, " ")}`;
}
