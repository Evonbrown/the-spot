-- =============================================================================
-- supabase/tests/0025_staff_idle_checks.sql
--
-- WHAT: Manual checks for migration 0025_staff_idle.sql (Step 39c): recording
--       staff activity, customers not tracked, and nobody can change the
--       time themselves.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks marked "SHOULD FAIL" are supposed to give the error shown. Every
--   block ends with "rollback", so nothing is left behind.
--
-- NEEDS: a 'counter_staff' and a 'customer' profile.
--
-- ---- QUICK BROWSER TEST WITHOUT WAITING 30 MINUTES ----
-- While a staff member is logged in, make them "idle" (replace the email):
--   update public.profiles set last_active_at = now() - interval '33 minutes'
--    where id = (select id from auth.users where email = 'staff@example.com');
-- Their screen logs out at its next refresh (within about 30 seconds on the
-- driver / supervisor screens, or on the next tap or page change).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: activity is recorded for STAFF, not for customers.
-- EXPECT: 1 row: staff_touched true, staff_recent true, customer_touched false,
--         customer_time_empty true.
-- -----------------------------------------------------------------------------
begin;

select set_config('t.staff', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)::text, true);
select set_config('t.customer', (select id from public.profiles where role = 'customer' order by created_at limit 1)::text, true);
update public.profiles set last_active_at = null
 where id in (current_setting('t.staff')::uuid, current_setting('t.customer')::uuid);

-- Touch in SEPARATE statements first: a single SELECT reads the table as it
-- was when that statement STARTED, so it can't see a change made by a
-- function called inside the same SELECT (that showed staff_recent as NULL).
select set_config('t.staff_touched', public.touch_staff_activity(current_setting('t.staff')::uuid)::text, true);
select set_config('t.customer_touched', public.touch_staff_activity(current_setting('t.customer')::uuid)::text, true);

select current_setting('t.staff_touched') as staff_touched,
       (select last_active_at > now() - interval '5 seconds' from public.profiles where id = current_setting('t.staff')::uuid) as staff_recent,
       current_setting('t.customer_touched') as customer_touched,
       (select last_active_at is null from public.profiles where id = current_setting('t.customer')::uuid) as customer_time_empty;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: SHOULD FAIL. A staff member can't set their own last_active_at
--          (to stay "active" forever): it isn't one of the editable columns.
-- EXPECT: an ERROR: "permission denied for table profiles".
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

update public.profiles set last_active_at = now() + interval '1 year' where id = (select auth.uid());

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: SHOULD FAIL. Only our server may record activity.
-- EXPECT: an ERROR: "permission denied for function touch_staff_activity".
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

select public.touch_staff_activity((select auth.uid()));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: a staff member CAN still read their own last_active_at (the
--          server reads it with their login on every page).
-- EXPECT: 1 row: can_read true.
-- -----------------------------------------------------------------------------
begin;

select public.touch_staff_activity((select id from public.profiles where role = 'counter_staff' order by created_at limit 1));

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

select last_active_at is not null as can_read from public.profiles where id = (select auth.uid());

rollback;
