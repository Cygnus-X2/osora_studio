-- ============================================================================
-- The voice shortlist.
--
-- A provider account can hold hundreds of voices. `approved` is the studio's
-- answer to "which of these may actually carry an Osora session" — and it is
-- what the composer offers, so approving a voice is a production decision
-- rather than a bookmark.
--
-- `words_per_minute` is measured from a generated sample rather than guessed.
-- It matters more than any descriptive label: the timeline planner assumes a
-- rate, and a voice far from it makes every duration estimate wrong before a
-- session has been written.
-- ============================================================================

alter table voices
  add column if not exists words_per_minute int,
  add column if not exists preview_path text,
  add column if not exists notes text,
  add column if not exists measured_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references users(id) on delete set null;

create index if not exists voices_approved_idx on voices (approved) where approved;

comment on column voices.words_per_minute is
  'Measured from a generated Osora sample, not declared by the provider.';
