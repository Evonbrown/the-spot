-- =============================================================================
-- supabase/tests/0023_login_lockout_checks.sql
--
-- WHAT: Manual checks for migration 0023_login_lockout.sql (Step 39b): 4
--       failures don't lock, the 5th does, a good login resets the count,
--       email + student ID failures add up, unknown emails / IDs lock too,
--       a lock ends, and nobody can read the table with the public key.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks marked "SHOULD FAIL" are supposed to give the error shown. Every
--   block ends with "rollback", so nothing is left behind.
--
-- NEEDS: a 'customer' profile. The test ID 620000004 must not belong to a
--   real account.
--
-- These blocks call the functions directly (like our server does), with the
-- REAL numbers: 5 failures, 15 minutes.
--
-- ---- HOW TO UNLOCK AN ACCOUNT RIGHT AWAY (while testing in the browser) ----
-- Replace the email and run BOTH lines (the count, and the Supabase ban):
--   delete from public.login_attempts
--    where user_id = (select id from auth.users where email = 'someone@example.com');
--   update auth.users set banned_until = null where email = 'someone@example.com';
-- Unknown emails / IDs: delete from public.login_attempts where user_id is null;
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: 4 failures in a row do NOT lock.
-- EXPECT: 1 row: any_lock false, locked_now false, failed_count 4.
-- -----------------------------------------------------------------------------
begin;

select set_config('t.user', (select id from public.profiles where role = 'customer' order by created_at limit 1)::text, true);
create temp table t_results (locked timestamptz) on commit drop;
insert into t_results select public.login_record_failure(current_setting('t.user')::uuid, null, 5, 15) from generate_series(1, 4);

select bool_or(locked is not null) as any_lock,
       public.login_lock_status(current_setting('t.user')::uuid, null) is not null as locked_now,
       (select failed_count from public.login_attempts where user_id = current_setting('t.user')::uuid) as failed_count
  from t_results;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: the 5th failure LOCKS it for 15 minutes.
-- EXPECT: 1 row: fifth_locked true, minutes_left 15, locked_now true,
--         failed_count 0 (the count restarts after a lock).
-- -----------------------------------------------------------------------------
begin;

select set_config('t.user', (select id from public.profiles where role = 'customer' order by created_at limit 1)::text, true);
select public.login_record_failure(current_setting('t.user')::uuid, null, 5, 15) from generate_series(1, 4);
select set_config('t.fifth', coalesce(public.login_record_failure(current_setting('t.user')::uuid, null, 5, 15)::text, ''), true);

select current_setting('t.fifth') <> '' as fifth_locked,
       round(extract(epoch from (current_setting('t.fifth')::timestamptz - now())) / 60) as minutes_left,
       public.login_lock_status(current_setting('t.user')::uuid, null) is not null as locked_now,
       (select failed_count from public.login_attempts where user_id = current_setting('t.user')::uuid) as failed_count;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: a GOOD login resets the count: 3 failures, a success, then 4
--          more failures -> still not locked (they're not 5 "in a row").
-- EXPECT: 1 row: locked_now false, failed_count 4.
-- -----------------------------------------------------------------------------
begin;

select set_config('t.user', (select id from public.profiles where role = 'customer' order by created_at limit 1)::text, true);
select public.login_record_failure(current_setting('t.user')::uuid, null, 5, 15) from generate_series(1, 3);
select public.login_record_success(current_setting('t.user')::uuid);
select public.login_record_failure(current_setting('t.user')::uuid, null, 5, 15) from generate_series(1, 4);

select public.login_lock_status(current_setting('t.user')::uuid, null) is not null as locked_now,
       (select failed_count from public.login_attempts where user_id = current_setting('t.user')::uuid) as failed_count;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: failures with the EMAIL and with the STUDENT ID add up (they are
--          the same account): 2 "by email" + 3 "by student ID" = locked.
--          (Our server finds the account with login_identify, Step 39a, and
--          passes its user id; this block does the same.)
-- EXPECT: 1 row: same_account true, locked_now true.
-- -----------------------------------------------------------------------------
begin;

update public.profiles set student_id = '620000004'
 where id = (select id from public.profiles where role = 'customer' order by created_at limit 1);
select set_config('t.by_email', (select user_id from public.login_identify(
  (select email from auth.users where id = (select id from public.profiles where student_id = '620000004'))))::text, true);
select set_config('t.by_id', (select user_id from public.login_identify('620000004'))::text, true);

select public.login_record_failure(current_setting('t.by_email')::uuid, 'typed email', 5, 15) from generate_series(1, 2);
select public.login_record_failure(current_setting('t.by_id')::uuid, '620000004', 5, 15) from generate_series(1, 3);

select current_setting('t.by_email') = current_setting('t.by_id') as same_account,
       public.login_lock_status(current_setting('t.by_id')::uuid, null) is not null as locked_now;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: an UNKNOWN email locks too (capitals and spaces don't matter), and
--          the table keeps only a HASH, not the email itself.
-- EXPECT: 1 row: locked_now true, rows 1, key_is_hash true, email_stored false.
-- -----------------------------------------------------------------------------
begin;

select public.login_record_failure(null, 'Nobody@Example.invalid', 5, 15);
select public.login_record_failure(null, 'nobody@example.invalid ', 5, 15);
select public.login_record_failure(null, ' NOBODY@EXAMPLE.INVALID', 5, 15);
select public.login_record_failure(null, 'nobody@example.invalid', 5, 15);
select public.login_record_failure(null, 'nobody@example.invalid', 5, 15);

select public.login_lock_status(null, 'nobody@example.invalid') is not null as locked_now,
       count(*) as rows,
       bool_and(account_key like 'unknown:%' and length(account_key) = 72) as key_is_hash,
       bool_or(account_key ilike '%nobody%') as email_stored
  from public.login_attempts
 where account_key = public.login_account_key(null, 'nobody@example.invalid');

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: a lock ENDS by itself. We pretend 15 minutes have passed by moving
--          "locked until" into the past (the quick way to test without
--          waiting); then it's open again and the next failure counts from 1.
-- EXPECT: 1 row: locked_before true, locked_after false, next_failure_locks
--         false, failed_count 1.
-- -----------------------------------------------------------------------------
begin;

select set_config('t.user', (select id from public.profiles where role = 'customer' order by created_at limit 1)::text, true);
select public.login_record_failure(current_setting('t.user')::uuid, null, 5, 15) from generate_series(1, 5);
select set_config('t.before', (public.login_lock_status(current_setting('t.user')::uuid, null) is not null)::text, true);

-- "15 minutes later":
update public.login_attempts set locked_until = now() - interval '1 second'
 where user_id = current_setting('t.user')::uuid;

select set_config('t.after', (public.login_lock_status(current_setting('t.user')::uuid, null) is not null)::text, true);
select set_config('t.next', (public.login_record_failure(current_setting('t.user')::uuid, null, 5, 15) is not null)::text, true);

select current_setting('t.before') as locked_before, current_setting('t.after') as locked_after,
       current_setting('t.next') as next_failure_locks,
       (select failed_count from public.login_attempts where user_id = current_setting('t.user')::uuid) as failed_count;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: the TEST MODE number (TEST_SHORT_SECURITY_TIMERS on a laptop): the
--          server passes 1 minute instead of 15.
-- EXPECT: 1 row: minutes_left 1.
-- -----------------------------------------------------------------------------
begin;

select set_config('t.user', (select id from public.profiles where role = 'customer' order by created_at limit 1)::text, true);
select public.login_record_failure(current_setting('t.user')::uuid, null, 5, 1) from generate_series(1, 4);
select round(extract(epoch from (public.login_record_failure(current_setting('t.user')::uuid, null, 5, 1) - now())) / 60)
       as minutes_left;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 8: SHOULD FAIL. Nobody can read (or reset) the attempts with the
--          public key, not even a logged-in user: only our server can.
-- EXPECT: an ERROR: "permission denied for table login_attempts".
--         (Swap to the commented-out line: "permission denied for function
--          login_record_success".)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'customer' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

select * from public.login_attempts;
-- select public.login_record_success((select auth.uid()));

rollback;
