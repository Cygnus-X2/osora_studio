-- ============================================================================
-- Osora Studio — initial schema
--
-- Design notes worth reading before changing anything here:
--
--  * Enums are Postgres types, not check constraints on text, so an invalid
--    state is unrepresentable rather than merely discouraged.
--
--  * `audio_assets` carries a CHECK that makes it physically impossible to mark
--    an asset ready without a measured duration. This is the single most
--    important constraint in the schema: everything downstream — timelines,
--    exports, flow validation — assumes measured durations are true.
--
--  * `*_versions` tables are append-only jsonb snapshots. Cheap, complete, and
--    they never fight with the live row.
--
--  * `evidence_links` is polymorphic so one source can back a mechanism, an
--    intervention, a section and a safety rule without four join tables.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type review_status as enum ('draft', 'in_review', 'changes_requested', 'approved', 'retired');

create type evidence_level as enum (
  'strong', 'moderate', 'preliminary', 'expert_consensus',
  'traditional_practice', 'internal_hypothesis', 'unverified'
);

create type knowledge_kind as enum (
  'scientific_evidence', 'expert_opinion', 'traditional_practice',
  'internal_hypothesis', 'ai_suggestion'
);

create type source_type as enum (
  'peer_reviewed_paper', 'systematic_review', 'meta_analysis', 'clinical_guideline',
  'book', 'expert_protocol', 'training_material', 'internal_research_note', 'traditional_source'
);

create type verification_status as enum ('unverified', 'in_verification', 'verified', 'disputed');

create type experience_status as enum (
  'idea', 'research', 'draft', 'composition', 'script_generation', 'audio_generation',
  'internal_review', 'scientific_review', 'safety_review', 'audio_review',
  'changes_requested', 'approved', 'published', 'archived'
);

create type constraint_type as enum ('hard', 'soft');
create type constraint_scope as enum ('always', 'this_session', 'evening', 'sleep_only', 'daytime');

create type rule_severity as enum ('information', 'recommendation', 'warning', 'blocking');
create type rule_scope as enum (
  'global', 'experience', 'mechanism', 'intervention', 'user_profile',
  'experiment', 'session', 'audio_project'
);
create type rule_category as enum (
  'timing', 'safety', 'scientific_integrity', 'audio_quality',
  'consistency', 'process', 'licensing'
);

create type review_kind as enum ('internal', 'scientific', 'safety', 'professional', 'audio', 'sound_design');
create type review_decision as enum ('pending', 'approved', 'changes_requested', 'rejected');

create type audio_asset_status as enum ('pending', 'generating', 'analysing', 'ready', 'failed');
create type audio_asset_origin as enum ('generated', 'uploaded', 'processed');
create type audio_track_kind as enum (
  'narration', 'ambient', 'music', 'sfx', 'breath_cue', 'silence', 'intro', 'outro'
);

create type generation_status as enum ('queued', 'running', 'succeeded', 'failed');
create type generation_capability as enum (
  'outline', 'script', 'improve', 'alternative', 'compose', 'rank', 'perspective',
  'claims', 'sources', 'contraindications', 'flow', 'tts', 'voice_preview',
  'sound_effect', 'ambient'
);

create type experiment_status as enum ('design', 'review', 'running', 'paused', 'stopped', 'analysed');
create type experiment_variable as enum (
  'intervention_sequence', 'pause_duration', 'silence_ratio', 'voice', 'speaking_speed',
  'guidance_density', 'direct_vs_invitational', 'ambient_vs_near_silence',
  'body_first_vs_breath_first', 'opening_duration', 'closing_duration'
);

create type studio_role as enum (
  'admin', 'creator', 'scientific_reviewer', 'professional_reviewer', 'safety_reviewer',
  'sound_designer', 'audio_reviewer', 'experiment_owner', 'publisher', 'viewer'
);

create type section_kind as enum (
  'intention', 'opening', 'orientation', 'main', 'transition', 'breath', 'body',
  'reflection', 'silence', 'sound_only', 'closing', 'aftercare', 'rationale', 'contraindications'
);

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- `users` mirrors auth.users so the rest of the schema has something stable to
-- reference. In a Supabase project auth.users is the source of truth.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references users(id) on delete cascade,
  display_name text not null,
  initials text not null,
  roles studio_role[] not null default '{viewer}',
  professional_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table professional_skills (
  key text primary key,
  label text not null,
  description text
);

create table professional_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  organisation text,
  biography text,
  certifications text[] not null default '{}',
  areas_of_expertise text[] not null default '{}',
  years_of_experience int not null default 0,
  languages text[] not null default '{}',
  contribution_count int not null default 0,
  active boolean not null default true,
  avatar_initials text not null,
  created_at timestamptz not null default now()
);

alter table profiles
  add constraint profiles_professional_profile_fk
  foreign key (professional_profile_id) references professional_profiles(id) on delete set null;

-- A professional's skills, and separately what they may *approve*. Holding a
-- skill and being permitted to sign off on it are different facts.
create table profile_skills (
  professional_profile_id uuid not null references professional_profiles(id) on delete cascade,
  skill_key text not null references professional_skills(key) on delete cascade,
  can_review boolean not null default false,
  primary key (professional_profile_id, skill_key)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  actor_name text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index audit_logs_target_idx on audit_logs (target_type, target_id, created_at desc);

-- ---------------------------------------------------------------------------
-- State model
-- ---------------------------------------------------------------------------

create table state_dimensions (
  key text primary key,
  name text not null,
  description text not null,
  scale text not null default '0-10',
  min_value numeric not null default 0,
  max_value numeric not null default 10,
  higher_is_pleasant boolean not null,
  user_facing_wording text not null,
  internal_interpretation text not null,
  allowed_use_cases text[] not null default '{}',
  safety_notes text,
  version int not null default 1,
  check (max_value > min_value)
);

create table state_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  captured_at timestamptz not null default now(),
  profile jsonb not null,
  note text
);

create index state_check_ins_user_idx on state_check_ins (user_id, captured_at desc);

create table desired_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  directions text[] not null,
  intent text not null,
  environment text not null,
  available_seconds int not null,
  context text,
  created_at timestamptz not null default now(),
  check (available_seconds > 0)
);

-- ---------------------------------------------------------------------------
-- Preferences and boundaries
-- ---------------------------------------------------------------------------

create table user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  key text not null,
  strength numeric not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

-- Hard constraints live here alongside soft ones but are never treated the
-- same: the engine may only *remove* candidates using them, never weigh them.
create table user_constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type constraint_type not null,
  key text not null,
  value text,
  reason text,
  scope constraint_scope not null default 'always',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key, scope)
);

create index user_constraints_hard_idx on user_constraints (user_id) where type = 'hard';

-- ---------------------------------------------------------------------------
-- Knowledge base
-- ---------------------------------------------------------------------------

create table mechanisms (
  key text primary key,
  name text not null,
  description text not null,
  intended_effect text not null,
  suitable_states jsonb not null default '[]',
  unsuitable_states jsonb not null default '[]',
  contraindications jsonb not null default '[]',
  evidence_level evidence_level not null default 'unverified',
  knowledge_kind knowledge_kind not null default 'internal_hypothesis',
  required_skills text[] not null default '{}',
  recommended_seconds int not null,
  min_exposure_seconds int not null,
  max_exposure_seconds int not null,
  compatible_with text[] not null default '{}',
  incompatible_with text[] not null default '{}',
  serves_directions jsonb not null default '{}',
  review_status review_status not null default 'draft',
  version int not null default 1,
  tags text[] not null default '{}',
  updated_at timestamptz not null default now(),
  check (min_exposure_seconds > 0),
  check (max_exposure_seconds >= min_exposure_seconds)
);

create table mechanism_versions (
  id uuid primary key default gen_random_uuid(),
  mechanism_key text not null references mechanisms(key) on delete cascade,
  version int not null,
  payload jsonb not null,
  author_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (mechanism_key, version)
);

create table interventions (
  key text primary key,
  name text not null,
  description text not null,
  target_outcome text not null,
  instructions text not null,
  script_template text not null,
  min_duration_seconds int not null,
  preferred_duration_seconds int not null,
  max_duration_seconds int not null,
  guidance_density text not null,
  pause_pattern jsonb not null,
  voice_requirements text,
  sound_requirements text,
  silence_compatible boolean not null default true,
  suitable_states jsonb not null default '[]',
  excluded_states jsonb not null default '[]',
  contraindications jsonb not null default '[]',
  evidence_level evidence_level not null default 'unverified',
  knowledge_kind knowledge_kind not null default 'internal_hypothesis',
  required_skills text[] not null default '{}',
  review_status review_status not null default 'draft',
  familiarity_group text not null,
  -- Internal provenance only. Never surfaced in the consumer experience.
  source_tradition text not null default 'osora_original',
  -- The join key hard user boundaries match against.
  boundary_tags text[] not null default '{}',
  major boolean not null default false,
  tags text[] not null default '{}',
  version int not null default 1,
  updated_at timestamptz not null default now(),
  check (min_duration_seconds > 0),
  check (preferred_duration_seconds between min_duration_seconds and max_duration_seconds)
);

create index interventions_boundary_tags_idx on interventions using gin (boundary_tags);

create table intervention_versions (
  id uuid primary key default gen_random_uuid(),
  intervention_key text not null references interventions(key) on delete cascade,
  version int not null,
  payload jsonb not null,
  author_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (intervention_key, version)
);

create table mechanism_intervention_links (
  mechanism_key text not null references mechanisms(key) on delete cascade,
  intervention_key text not null references interventions(key) on delete cascade,
  weight numeric not null default 1,
  primary key (mechanism_key, intervention_key),
  check (weight > 0 and weight <= 1)
);

-- ---------------------------------------------------------------------------
-- Evidence
-- ---------------------------------------------------------------------------

create table scientific_sources (
  id text primary key,
  title text not null,
  authors text[] not null default '{}',
  year int,
  publisher text,
  doi_or_url text,
  source_type source_type not null,
  abstract text,
  summary text,
  relevant_findings text[] not null default '{}',
  limitations text[] not null default '{}',
  evidence_quality evidence_level not null default 'unverified',
  target_populations text[] not null default '{}',
  contraindication_notes text[] not null default '{}',
  reviewer_notes text,
  document_path text,
  citation text not null,
  verification_status verification_status not null default 'unverified',
  verified_by uuid references professional_profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  -- A source cannot be marked verified without a named verifier.
  check (verification_status <> 'verified' or verified_by is not null)
);

create table evidence_links (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references scientific_sources(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  knowledge_kind knowledge_kind not null,
  note text,
  created_at timestamptz not null default now(),
  unique (source_id, target_type, target_id)
);

create index evidence_links_target_idx on evidence_links (target_type, target_id);

-- ---------------------------------------------------------------------------
-- Osora DNA
-- ---------------------------------------------------------------------------

create table osora_dna_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null default 1,
  stable jsonb not null,
  adaptive jsonb not null,
  rules jsonb not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Experiments
-- ---------------------------------------------------------------------------

create table experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hypothesis text not null,
  eligible_population text,
  exclusion_criteria text[] not null default '{}',
  variable experiment_variable not null,
  primary_outcome text not null,
  secondary_outcomes text[] not null default '{}',
  safety_guardrails text[] not null default '{}',
  minimum_sample int not null,
  stop_condition text not null,
  owner_id uuid references users(id) on delete set null,
  required_review review_kind not null default 'internal',
  status experiment_status not null default 'design',
  results text,
  interpretation text,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  check (minimum_sample > 0)
);

create table experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  label text not null,
  is_control boolean not null default false,
  description text,
  settings_delta jsonb not null default '{}'
);

create unique index experiment_single_control_idx
  on experiment_variants (experiment_id) where is_control;

-- ---------------------------------------------------------------------------
-- Experiences
-- ---------------------------------------------------------------------------

create table experiences (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  internal_title text,
  status experience_status not null default 'idea',
  current_state jsonb not null default '{}',
  desired_state jsonb not null default '{}',
  target_outcome text,
  duration_seconds int not null,
  familiarity_ratio numeric,
  exploration_ratio numeric,
  scientific_confidence numeric,
  settings jsonb not null default '{}',
  dna_profile_id uuid references osora_dna_profiles(id) on delete set null,
  dna_score jsonb,
  experiment_id uuid references experiments(id) on delete set null,
  required_review_skills text[] not null default '{}',
  version int not null default 1,
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (duration_seconds > 0),
  check (familiarity_ratio is null or (familiarity_ratio between 0 and 1))
);

create index experiences_status_idx on experiences (status, updated_at desc);

create table experience_versions (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences(id) on delete cascade,
  version int not null,
  label text not null,
  summary text,
  payload jsonb not null,
  author_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (experience_id, version)
);

-- The frozen engine output. Stored whole because reproducing a decision later
-- matters more than normalising it.
create table session_plans (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences(id) on delete cascade,
  target text not null,
  duration_seconds int not null,
  familiarity_ratio numeric not null,
  exploration_ratio numeric not null,
  silence_ratio numeric not null,
  composition jsonb not null,
  sequence jsonb not null,
  ranked_interventions jsonb not null default '[]',
  voice_recommendation jsonb,
  sound_recommendation jsonb,
  required_reviews text[] not null default '{}',
  confidence numeric not null,
  warnings text[] not null default '{}',
  trace jsonb not null default '[]',
  engine_version text not null,
  created_at timestamptz not null default now()
);

create table session_sections (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences(id) on delete cascade,
  section_key text not null,
  ordinal int not null,
  kind section_kind not null,
  title text not null,
  mechanism_key text references mechanisms(key) on delete set null,
  intervention_key text references interventions(key) on delete set null,
  review_status review_status not null default 'draft',
  body text not null default '',
  word_count int not null default 0,
  word_budget int not null default 0,
  estimated_speech_seconds numeric not null default 0,
  actual_speech_seconds numeric,
  pause_seconds numeric not null default 0,
  sound_only_seconds numeric not null default 0,
  transition_seconds numeric not null default 0,
  start_seconds numeric not null default 0,
  end_seconds numeric not null default 0,
  evidence_source_ids text[] not null default '{}',
  unique (experience_id, section_key),
  check (end_seconds >= start_seconds)
);

create index session_sections_experience_idx on session_sections (experience_id, ordinal);

create table experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  variant_id uuid not null references experiment_variants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  experience_id uuid references experiences(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (experiment_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Outcomes
-- ---------------------------------------------------------------------------

create table session_outcomes (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  experiment_variant_id uuid references experiment_variants(id) on delete set null,
  pre jsonb not null,
  post jsonb not null,
  completed boolean not null default false,
  completion_ratio numeric not null default 0,
  skip_points int[] not null default '{}',
  replays int not null default 0,
  helpfulness int,
  felt_safe boolean,
  would_repeat boolean,
  free_text text,
  dislikes text[] not null default '{}',
  audio_problems text[] not null default '{}',
  context jsonb not null default '{}',
  recorded_at timestamptz not null default now(),
  check (completion_ratio between 0 and 1),
  check (helpfulness is null or helpfulness between 1 and 5)
);

create index session_outcomes_experience_idx on session_outcomes (experience_id, recorded_at desc);
create index session_outcomes_variant_idx on session_outcomes (experiment_variant_id);

-- ---------------------------------------------------------------------------
-- Audio
-- ---------------------------------------------------------------------------

create table voices (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_voice_id text not null,
  name text not null,
  description text,
  gender text,
  accent text,
  languages text[] not null default '{}',
  warmth numeric,
  pace numeric,
  suitable_for text[] not null default '{}',
  preview_asset_id uuid,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, provider_voice_id)
);

-- The most important table in the schema.
--
-- `actual_duration_seconds` is set only by a completed ffprobe run. The CHECK
-- below makes it impossible to mark an asset ready without one, which is what
-- stops a requested duration from silently becoming the truth downstream.
create table audio_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  origin audio_asset_origin not null,
  kind audio_track_kind not null,
  storage_path text not null,
  format text not null,
  status audio_asset_status not null default 'pending',
  requested_duration_seconds numeric,
  actual_duration_seconds numeric,
  duration_delta_seconds numeric generated always as (
    case
      when actual_duration_seconds is not null and requested_duration_seconds is not null
      then actual_duration_seconds - requested_duration_seconds
    end
  ) stored,
  codec text,
  bitrate_kbps int,
  sample_rate int,
  channels int,
  file_size_bytes bigint,
  peak_db numeric,
  loudness_lufs numeric,
  licence text,
  generation_run_id uuid,
  error text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint audio_assets_ready_requires_measurement check (
    status <> 'ready' or (actual_duration_seconds is not null and actual_duration_seconds > 0)
  )
);

create index audio_assets_status_idx on audio_assets (status, created_at desc);

alter table voices
  add constraint voices_preview_asset_fk
  foreign key (preview_asset_id) references audio_assets(id) on delete set null;

create table sound_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  style text not null,
  description text,
  intensity numeric not null default 0.3,
  loopable boolean not null default true,
  asset_id uuid references audio_assets(id) on delete set null,
  licence text,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  -- A sound cannot be approved without licence metadata.
  check (not approved or licence is not null)
);

create table audio_projects (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid references experiences(id) on delete set null,
  name text not null,
  target_seconds int not null,
  arranged_seconds numeric not null default 0,
  loudness_target_lufs numeric not null default -19,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table audio_tracks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references audio_projects(id) on delete cascade,
  kind audio_track_kind not null,
  name text not null,
  ordinal int not null default 0,
  volume_db numeric not null default 0,
  muted boolean not null default false,
  solo boolean not null default false,
  locked boolean not null default false
);

create table audio_clips (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references audio_tracks(id) on delete cascade,
  asset_id uuid references audio_assets(id) on delete set null,
  name text not null,
  start_seconds numeric not null default 0,
  duration_seconds numeric not null,
  offset_seconds numeric not null default 0,
  gain_db numeric not null default 0,
  fade_in_seconds numeric not null default 0,
  fade_out_seconds numeric not null default 0,
  loop boolean not null default false,
  check (duration_seconds > 0),
  check (start_seconds >= 0)
);

create index audio_clips_track_idx on audio_clips (track_id, start_seconds);

-- ---------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------

create table generation_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  capability generation_capability not null,
  model text not null,
  prompt_version text,
  input text,
  structured_constraints jsonb not null default '{}',
  selected_mechanisms text[] not null default '{}',
  selected_intervention_keys text[] not null default '{}',
  professional_perspective text,
  output text,
  settings jsonb not null default '{}',
  status generation_status not null default 'queued',
  error text,
  input_tokens int,
  output_tokens int,
  requested_audio_seconds numeric,
  actual_audio_seconds numeric,
  cost_estimate_usd numeric,
  experience_id uuid references experiences(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index generation_runs_created_idx on generation_runs (created_at desc);

alter table audio_assets
  add constraint audio_assets_generation_run_fk
  foreign key (generation_run_id) references generation_runs(id) on delete set null;

create table audio_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references audio_assets(id) on delete cascade,
  tool text not null default 'ffprobe',
  succeeded boolean not null,
  duration_seconds numeric,
  codec text,
  bitrate_kbps int,
  sample_rate int,
  channels int,
  file_size_bytes bigint,
  peak_db numeric,
  loudness_lufs numeric,
  raw_output jsonb,
  error text,
  created_at timestamptz not null default now(),
  -- A successful analysis must have produced a duration. Anything else is a
  -- failure, however cleanly the process exited.
  check (not succeeded or duration_seconds is not null)
);

create index audio_analysis_runs_asset_idx on audio_analysis_runs (asset_id, created_at desc);

create table flow_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences(id) on delete cascade,
  audio_project_id uuid references audio_projects(id) on delete set null,
  scores jsonb not null,
  checks jsonb not null default '[]',
  warnings text[] not null default '{}',
  blocking_errors text[] not null default '{}',
  suggestions text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Rules, reviews, comments
-- ---------------------------------------------------------------------------

create table rules (
  key text primary key,
  name text not null,
  description text not null,
  category rule_category not null,
  scope rule_scope not null,
  severity rule_severity not null,
  logic_summary text not null,
  error_message text not null,
  suggested_correction text,
  active boolean not null default true,
  version int not null default 1,
  owner text,
  updated_at timestamptz not null default now()
);

create table rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null references rules(key) on delete cascade,
  version int not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (rule_key, version)
);

create table rule_results (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null references rules(key) on delete cascade,
  experience_id uuid references experiences(id) on delete cascade,
  audio_project_id uuid references audio_projects(id) on delete cascade,
  severity rule_severity not null,
  passed boolean not null,
  message text not null,
  suggestion text,
  subject text,
  evaluated_at timestamptz not null default now()
);

create index rule_results_experience_idx on rule_results (experience_id, evaluated_at desc);
create index rule_results_failing_idx on rule_results (experience_id) where not passed;

create table review_requirements (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences(id) on delete cascade,
  kind review_kind not null,
  required_skill text not null references professional_skills(key),
  reason text not null,
  satisfied_by_review_id uuid,
  blocking boolean not null default true,
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences(id) on delete cascade,
  kind review_kind not null,
  reviewer_id uuid references professional_profiles(id) on delete set null,
  skill_used text not null references professional_skills(key),
  decision review_decision not null default 'pending',
  comment text,
  created_at timestamptz not null default now()
);

alter table review_requirements
  add constraint review_requirements_review_fk
  foreign key (satisfied_by_review_id) references reviews(id) on delete set null;

create index reviews_experience_idx on reviews (experience_id, created_at desc);

create table comments (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences(id) on delete cascade,
  section_id uuid references session_sections(id) on delete cascade,
  author_id uuid references users(id) on delete set null,
  body text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index comments_experience_idx on comments (experience_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Studio data is internal, so the baseline is: authenticated staff read, and
-- writes go through the service role or a policy added per table as the team
-- grows. Listener-owned rows are restricted to their owner.
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table state_check_ins enable row level security;
alter table desired_states enable row level security;
alter table user_preferences enable row level security;
alter table user_constraints enable row level security;
alter table session_outcomes enable row level security;
alter table experiences enable row level security;
alter table session_sections enable row level security;
alter table audio_assets enable row level security;
alter table audio_projects enable row level security;

create policy "own profile" on profiles
  for select using (auth.uid() = id);

create policy "own check-ins" on state_check_ins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own desired states" on desired_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own preferences" on user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own constraints" on user_constraints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own outcomes" on session_outcomes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "staff read experiences" on experiences
  for select using (auth.role() = 'authenticated');

create policy "staff read sections" on session_sections
  for select using (auth.role() = 'authenticated');

create policy "staff read audio assets" on audio_assets
  for select using (auth.role() = 'authenticated');

create policy "staff read audio projects" on audio_projects
  for select using (auth.role() = 'authenticated');
