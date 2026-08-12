import "server-only";

import { isDatabaseConfigured, query } from "./client";

/**
 * The voice shortlist.
 *
 * A provider row only becomes an Osora voice when somebody approves it. The
 * composer offers approved voices and nothing else, so this table is the line
 * between "exists on the account" and "may carry a session".
 */

export interface StudioVoice {
  id: string;
  provider: string;
  providerVoiceId: string;
  name: string;
  description: string | null;
  gender: string | null;
  accent: string | null;
  languages: string[];
  approved: boolean;
  wordsPerMinute: number | null;
  previewPath: string | null;
  notes: string | null;
  measuredAt: string | null;
}

interface VoiceRow {
  id: string;
  provider: string;
  provider_voice_id: string;
  name: string;
  description: string | null;
  gender: string | null;
  accent: string | null;
  languages: string[];
  approved: boolean;
  words_per_minute: number | null;
  preview_path: string | null;
  notes: string | null;
  measured_at: string | null;
}

function toVoice(row: VoiceRow): StudioVoice {
  return {
    id: row.id,
    provider: row.provider,
    providerVoiceId: row.provider_voice_id,
    name: row.name,
    description: row.description,
    gender: row.gender,
    accent: row.accent,
    languages: row.languages ?? [],
    approved: row.approved,
    wordsPerMinute: row.words_per_minute,
    previewPath: row.preview_path,
    notes: row.notes,
    measuredAt: row.measured_at,
  };
}

export async function listStudioVoices(approvedOnly = false): Promise<StudioVoice[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await query<VoiceRow>(
    `select * from voices ${approvedOnly ? "where approved" : ""} order by approved desc, name`,
  );
  return rows.map(toVoice);
}

export interface UpsertVoiceInput {
  provider: string;
  providerVoiceId: string;
  name: string;
  description?: string | null;
  gender?: string | null;
  accent?: string | null;
  languages?: string[];
}

/** Records a provider voice without changing whether it is approved. */
export async function upsertVoice(input: UpsertVoiceInput): Promise<StudioVoice> {
  const rows = await query<VoiceRow>(
    `insert into voices (provider, provider_voice_id, name, description, gender, accent, languages, approved)
     values ($1,$2,$3,$4,$5,$6,$7,false)
     on conflict (provider, provider_voice_id) do update set
       name = excluded.name,
       description = excluded.description,
       gender = excluded.gender,
       accent = excluded.accent,
       languages = excluded.languages
     returning *`,
    [
      input.provider,
      input.providerVoiceId,
      input.name,
      input.description ?? null,
      input.gender ?? null,
      input.accent ?? null,
      input.languages ?? [],
    ],
  );
  return toVoice(rows[0]);
}

/** Stores what a generated sample actually measured. */
export async function recordVoiceMeasurement(
  provider: string,
  providerVoiceId: string,
  wordsPerMinute: number | null,
  previewPath: string,
): Promise<void> {
  await query(
    `update voices
        set words_per_minute = $3, preview_path = $4, measured_at = now()
      where provider = $1 and provider_voice_id = $2`,
    [provider, providerVoiceId, wordsPerMinute, previewPath],
  );
}

export async function setVoiceApproval(
  provider: string,
  providerVoiceId: string,
  approved: boolean,
): Promise<StudioVoice | null> {
  const rows = await query<VoiceRow>(
    `update voices
        set approved = $3, approved_at = case when $3 then now() else null end
      where provider = $1 and provider_voice_id = $2
      returning *`,
    [provider, providerVoiceId, approved],
  );
  return rows[0] ? toVoice(rows[0]) : null;
}

export async function setVoiceNotes(
  provider: string,
  providerVoiceId: string,
  notes: string | null,
): Promise<void> {
  await query("update voices set notes = $3 where provider = $1 and provider_voice_id = $2", [
    provider,
    providerVoiceId,
    notes,
  ]);
}
