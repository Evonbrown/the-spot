-- =============================================================================
-- supabase/migrations/0024_login_tries_left.sql   (Build step 8, Step 39b)
--
-- WHAT: login_failed_count(user, identifier) -> how many failed logins IN A
--       ROW this account (or unknown email / student ID) has right now.
--       The server uses it to warn from the 3rd failure: "2 tries left before
--       a 15-minute lock."
--
-- LAYER: Data layer (Supabase Postgres).
--
-- WHY A NEW FILE (not editing 0023)? 0023 has already been run. Migrations are
--   a history: each one runs once, in order; changes go in a NEW file.
--
-- SAME FOR UNKNOWN EMAILS / IDs: they are counted the same way (0023), so
--   they get the same warning; it never reveals which accounts exist.
--
-- SERVER ONLY, like the other login_* functions.
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0024_login_tries_left_checks.sql block by block.
-- =============================================================================

create function public.login_failed_count(p_user_id uuid, p_identifier text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.failed_count
      from public.login_attempts a
     where a.account_key = public.login_account_key(p_user_id, p_identifier)
  ), 0)
$$;

revoke execute on function public.login_failed_count(uuid, text) from public, anon, authenticated;
grant execute on function public.login_failed_count(uuid, text) to service_role;
