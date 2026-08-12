-- ============================================================================
-- Give professional profiles a natural key.
--
-- Without one the seed had no way to say "this is the same person as last
-- time", so every run inserted a fresh set. Re-running a seed should be a
-- no-op, and a reviewer's identity should not depend on how many times
-- somebody ran a script.
--
-- Existing duplicates are collapsed onto the earliest row and anything
-- referencing a later copy is repointed first, so no verified source loses
-- its verifier — which would trip the check constraint requiring one.
-- ============================================================================

-- 1. Repoint sources at the surviving profile for each name.
update scientific_sources s
   set verified_by = keep.id
  from professional_profiles dup
  join lateral (
        select p.id
          from professional_profiles p
         where p.name = dup.name
         order by p.created_at, p.id
         limit 1
       ) keep on true
 where s.verified_by = dup.id
   and dup.id <> keep.id;

-- 2. Collapse the duplicates.
delete from professional_profiles p
 where p.id <> (
   select keep.id
     from professional_profiles keep
    where keep.name = p.name
    order by keep.created_at, keep.id
    limit 1
 );

-- 3. Make it impossible to reintroduce.
create unique index if not exists professional_profiles_name_idx
  on professional_profiles (name);
