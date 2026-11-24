-- =============================================================================
-- supabase/migrations/0023_login_lockout.sql   (Build step 8, Step 39b)
--
-- WHAT: Lock an account for 15 minutes after 5 FAILED LOGINS IN A ROW
--       (SRS Section 3, Security):
--         1. login_attempts: one row per account (or per unknown email /
--            student ID): how many failures in a row, and "locked until".
--            ONLY our server can read or change it.
--         2. login_lock_status()    -> is it locked right now? (until when)
--         3. login_record_failure() -> one more failure; the 5th locks it;
--         4. login_record_success() -> a good login resets the count.
--
-- LAYER: Data layer (Supabase Postgres).
--
-- WHY PER ACCOUNT? A person can log in with their email OR their student ID
--   (Step 39a). Failures with either must add up, so the count is kept for
--   the ACCOUNT (its user id), not for what was typed.
--
-- WHY COUNT UNKNOWN EMAILS / IDs TOO (decision)? If only real accounts could
--   be locked, "Too many failed attempts" would prove an account exists. So
--   failures for an unknown email / student ID also lock after 5, with the
--   same message. For those we store a HASH (a scrambled fingerprint, sha256)
--   of what was typed, not the text itself: we don't keep strangers' emails.
--
-- THE NUMBERS (5 failures, 15 minutes) come from the server
--   (src/lib/auth/security-settings.ts), so a test mode on our laptops can use
--   1 minute instead. The server is trusted: only it may call these functions.
--
-- ALSO: on the 5th failure the server BANS the account in Supabase Auth for
--   the same time, so it can't log in by ANY route (not even by calling
--   Supabase's login address directly, skipping our form). See actions.ts.
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0023_login_lockout_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The table.
--    account_key    'user:<id>' for a real account, 'unknown:<hash>' for an
--                   email / student ID that has no account;
--    failed_count   failures IN A ROW since the last good login (or lock);
--    locked_until   null = not locked; in the past = the lock is over.
-- -----------------------------------------------------------------------------
create table public.login_attempts (
  account_key    text primary key,
  user_id        uuid references auth.users (id) on delete cascade,
  failed_count   integer not null default 0 constraint login_attempts_count_ok check (failed_count >= 0),
  locked_until   timestamptz,
  last_failed_at timestamptz
);

-- RLS ON with NO policies + no grants = nobody can touch it with the public
-- key. Only the security-definer functions below (called by our server).
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;


-- -----------------------------------------------------------------------------
-- Helper: the key for an account, or for an unknown identifier (hashed).
--   lower(btrim(...)): "Jane@Example.com " and "jane@example.com" are the same.
-- -----------------------------------------------------------------------------
create function public.login_account_key(p_user_id uuid, p_identifier text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_user_id is not null then 'user:' || p_user_id::text
           else 'unknown:' || encode(sha256(convert_to(lower(btrim(coalesce(p_identifier, ''))), 'UTF8')), 'hex')
         end
$$;

revoke execute on function public.login_account_key(uuid, text) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. login_lock_status(user, identifier) -> "locked until" (a time in the
--    future), or NULL if it's not locked right now.
-- -----------------------------------------------------------------------------
create function public.login_lock_status(p_user_id uuid, p_identifier text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select a.locked_until
    from public.login_attempts a
   where a.account_key = public.login_account_key(p_user_id, p_identifier)
     and a.locked_until > now()
$$;


-- -----------------------------------------------------------------------------
-- 3. login_record_failure(user, identifier, max_fails, lock_minutes)
--    -> "locked until" if THIS failure locked the account, else NULL.
--    - an earlier lock that is OVER starts a fresh count (5 new tries);
--    - the count goes up by 1;
--    - at max_fails: locked for lock_minutes, and the count starts again
--      from 0 (so after the lock, the person has 5 new tries).
--    "insert ... on conflict do update" = add the row if it's new, otherwise
--    change the existing one, in ONE safe step (two failures at the same
--    moment can't both read "4").
-- -----------------------------------------------------------------------------
create function public.login_record_failure(
  p_user_id      uuid,
  p_identifier   text,
  p_max_fails    integer,
  p_lock_minutes integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   text := public.login_account_key(p_user_id, p_identifier);
  v_max   integer := least(greatest(coalesce(p_max_fails, 5), 1), 20);         -- 1..20
  v_mins  integer := least(greatest(coalesce(p_lock_minutes, 15), 1), 1440);   -- 1 min..1 day
  v_row   public.login_attempts;
begin
  insert into public.login_attempts as a (account_key, user_id, failed_count, last_failed_at)
  values (v_key, p_user_id, 1, now())
  on conflict (account_key) do update
     set failed_count   = case
                            when a.locked_until is not null and a.locked_until <= now() then 1 -- old lock over
                            else a.failed_count + 1
                          end,
         locked_until   = case when a.locked_until <= now() then null else a.locked_until end,
         last_failed_at = now()
  returning * into v_row;

  if v_row.failed_count >= v_max then
    update public.login_attempts
       set locked_until = now() + make_interval(mins => v_mins),
           failed_count = 0
     where account_key = v_key
    returning locked_until into v_row.locked_until;
    return v_row.locked_until;
  end if;

  return null;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. login_record_success(user): a good login -> forget the failures.
-- -----------------------------------------------------------------------------
create function public.login_record_success(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.login_attempts where account_key = public.login_account_key(p_user_id, null)
$$;


-- Only our server (service_role) may use these.
revoke execute on function public.login_lock_status(uuid, text) from public, anon, authenticated;
revoke execute on function public.login_record_failure(uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.login_record_success(uuid) from public, anon, authenticated;
grant execute on function public.login_lock_status(uuid, text) to service_role;
grant execute on function public.login_record_failure(uuid, text, integer, integer) to service_role;
grant execute on function public.login_record_success(uuid) to service_role;
