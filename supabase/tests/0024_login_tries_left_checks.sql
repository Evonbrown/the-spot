-- =============================================================================
-- supabase/tests/0024_login_tries_left_checks.sql
--
-- WHAT: Manual checks for migration 0024_login_tries_left.sql (Step 39b):
--       the failure count used for "N tries left", for a real account and
--       an unknown email, reset by a good login, and server only.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Every block ends with "rollback", so nothing is left behind.
--
-- NEEDS: a 'customer' profile, and migration 0023.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: the count for a REAL account and for an UNKNOWN email behave the
--          same (3 failures -> 3), and a good login resets the account to 0.
-- EXPECT: 1 row: account_after_3 3, unknown_after_3 3, account_after_success 0,
--         never_failed 0.
-- -----------------------------------------------------------------------------
begin;

select set_config('t.user', (select id from public.profiles where role = 'customer' order by created_at limit 1)::text, true);
select public.login_record_failure(current_setting('t.user')::uuid, null, 5, 15) from generate_series(1, 3);
select public.login_record_failure(null, 'Nobody@Example.invalid', 5, 15) from generate_series(1, 3);

select set_config('t.account3', public.login_failed_count(current_setting('t.user')::uuid, null)::text, true);
select set_config('t.unknown3', public.login_failed_count(null, 'nobody@example.invalid')::text, true);
select public.login_record_success(current_setting('t.user')::uuid);

select current_setting('t.account3') as account_after_3,
       current_setting('t.unknown3') as unknown_after_3,
       public.login_failed_count(current_setting('t.user')::uuid, null) as account_after_success,
       public.login_failed_count(null, 'never-tried@example.invalid') as never_failed;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: SHOULD FAIL. Logged-in users can't ask for the count.
-- EXPECT: an ERROR: "permission denied for function login_failed_count".
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'customer' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

select public.login_failed_count((select auth.uid()), null);

rollback;
