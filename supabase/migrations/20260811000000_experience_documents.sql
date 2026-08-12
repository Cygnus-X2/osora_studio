-- ============================================================================
-- Whole-document columns on experiences.
--
-- `session_plans` and `session_sections` remain the queryable, normalised
-- record — they are what you join against when asking "which sessions use
-- extended exhalation". But the studio reads a whole experience on nearly
-- every page, and reassembling a plan from six tables on each render is both
-- slow and a source of drift.
--
-- So the plan and the timeline are also stored whole, as jsonb. The engine
-- output is immutable once produced, which is exactly the case where a
-- document beats a join.
-- ============================================================================

alter table experiences
  add column if not exists plan jsonb,
  add column if not exists timeline jsonb,
  add column if not exists constraints jsonb not null default '[]'::jsonb,
  add column if not exists audio_project_id uuid,
  add column if not exists contributor_ids text[] not null default '{}',
  -- Distinguishes what the team created from the examples shipped with the
  -- studio, so a demo session is never mistaken for real work.
  add column if not exists is_example boolean not null default false;

create index if not exists experiences_updated_idx on experiences (updated_at desc);
create index if not exists experiences_example_idx on experiences (is_example);

-- Sessions are addressed by a human-readable key in URLs, not a raw uuid.
alter table experiences
  add column if not exists slug text;

create unique index if not exists experiences_slug_idx on experiences (slug) where slug is not null;
