-- ============================================================================
-- auth shim
--
-- The row-level-security policies in the next migration call `auth.uid()` and
-- `auth.role()`. Those are provided by Supabase; on a self-hosted Postgres they
-- do not exist and the policies fail to create.
--
-- This creates them only when absent, so the same migration set applies
-- unchanged to both a Supabase project and a plain Postgres container. On
-- Supabase this is a no-op — importantly it does NOT replace the real
-- functions, which would silently break authentication.
-- ============================================================================

create schema if not exists auth;

do $shim$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $fn$
      create function auth.uid() returns uuid
      language sql stable
      as $body$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $body$;
    $fn$;
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'role'
  ) then
    execute $fn$
      create function auth.role() returns text
      language sql stable
      as $body$
        select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
      $body$;
    $fn$;
  end if;
end
$shim$;
