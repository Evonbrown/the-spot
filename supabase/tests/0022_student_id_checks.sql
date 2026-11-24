-- =============================================================================
-- supabase/tests/0022_student_id_checks.sql
--
-- WHAT: Manual checks for migration 0022_student_id.sql (Step 39a): the
--       student ID format and uniqueness, the sign-up trigger, finding an
--       account by email or student ID (login_identify), and who may change
--       or look up what.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks marked "SHOULD FAIL" are supposed to give the error shown. Every
--   block ends with "rollback", so nothing is left behind.
--
-- NEEDS: at least TWO 'customer' profiles. The test IDs 620000001-620000003
--   must not belong to a real account.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: SHOULD FAIL. A student ID must be exactly 9 digits.
-- EXPECT: an ERROR: new row for relation "profiles" violates check constraint
--         "profiles_student_id_format".
-- -----------------------------------------------------------------------------
begin;

update public.profiles set student_id = '12345'
 where id = (select id from public.profiles where role = 'customer' order by created_at limit 1);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: SHOULD FAIL. Two accounts can't have the SAME student ID.
-- EXPECT: an ERROR: duplicate key value violates unique constraint
--         "profiles_student_id_unique".
-- -----------------------------------------------------------------------------
begin;

update public.profiles set student_id = '620000001'
 where id = (select id from public.profiles where role = 'customer' order by created_at limit 1);
update public.profiles set student_id = '620000001'
 where id = (select id from public.profiles where role = 'customer' order by created_at offset 1 limit 1);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: the SIGN-UP trigger copies a correct student ID (and leaves a
--          wrong one empty). Two test sign-ups straight into auth.users.
-- EXPECT: 2 rows:
--   s39a-good@example.invalid  student_id 620000001  role customer
--   s39a-bad@example.invalid   student_id (null)     role customer
-- -----------------------------------------------------------------------------
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('39a39a39-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 's39a-good@example.invalid',
   '{"full_name": "Test Good", "phone": "8765550001", "student_id": "620000001"}', now(), now()),
  ('39a39a39-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 's39a-bad@example.invalid',
   '{"full_name": "Test Bad", "phone": "8765550002", "student_id": "abc", "role": "manager"}', now(), now());

select u.email, p.student_id, p.role
  from public.profiles p join auth.users u on u.id = p.id
 where u.email like 's39a-%@example.invalid'
 order by u.email desc;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: login_identify finds the SAME account by student ID or by email
--          (capitals don't matter), and nothing for an unknown ID.
-- EXPECT: 3 rows:
--   by student ID      1 match, same_user true
--   by email (CAPS)    1 match, same_user true
--   unknown ID         0 matches
-- -----------------------------------------------------------------------------
begin;

-- Give the first customer a test ID.
update public.profiles set student_id = '620000002'
 where id = (select id from public.profiles where role = 'customer' order by created_at limit 1);
select set_config('t.user', (select id from public.profiles where student_id = '620000002')::text, true);
select set_config('t.email', upper((select email from auth.users where id = current_setting('t.user')::uuid)), true);

select 'by student ID' as lookup, count(*) as matches,
       bool_and(user_id = current_setting('t.user')::uuid) as same_user
  from public.login_identify('620000002')
union all
select 'by email (CAPS)', count(*), bool_and(user_id = current_setting('t.user')::uuid)
  from public.login_identify(current_setting('t.email'))
union all
select 'unknown ID', count(*), null
  from public.login_identify('620000003');

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: a customer can change their OWN student ID (logged in as them),
--          but NOT another customer's (that update changes 0 rows: RLS).
-- EXPECT: 1 row: own_updated 1, own_value 620000002, other_updated 0.
-- -----------------------------------------------------------------------------
begin;

select set_config('t.me', (select id from public.profiles where role = 'customer' order by created_at limit 1)::text, true);
select set_config('t.other', (select id from public.profiles where role = 'customer' order by created_at offset 1 limit 1)::text, true);

select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.me'), 'role', 'authenticated')::text, true);
set local role authenticated;

with own as (
  update public.profiles set student_id = '620000002' where id = current_setting('t.me')::uuid returning 1
)
select set_config('t.own', (select count(*) from own)::text, true);

with other as (
  update public.profiles set student_id = '620000003' where id = current_setting('t.other')::uuid returning 1
)
select set_config('t.other_n', (select count(*) from other)::text, true);

select current_setting('t.own') as own_updated,
       (select student_id from public.profiles where id = current_setting('t.me')::uuid) as own_value,
       current_setting('t.other_n') as other_updated;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: SHOULD FAIL. A user still can't change their own ROLE (0001).
-- EXPECT: an ERROR: "permission denied for table profiles".
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'customer' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

update public.profiles set role = 'manager' where id = (select auth.uid());

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: SHOULD FAIL. Logged-in users (and visitors) can't use
--          login_identify to test which emails / student IDs exist.
-- EXPECT: an ERROR: "permission denied for function login_identify".
--         (Change 'authenticated' to 'anon' in "set local role": same error.)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'customer' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

select * from public.login_identify('620165372');

rollback;
