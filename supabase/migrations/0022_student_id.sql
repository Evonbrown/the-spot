-- =============================================================================
-- supabase/migrations/0022_student_id.sql   (Build step 8, Step 39a)
--
-- WHAT: Log in with EMAIL OR STUDENT ID (SRS Section 3, Security: "All users
--       shall log in with their email or student ID and a password"):
--         1. profiles.student_id: OPTIONAL, exactly 9 digits (e.g. 620165372),
--            and UNIQUE (two accounts can't share one);
--         2. users may change their OWN student ID (like name and phone);
--         3. the sign-up trigger also copies the student ID from the form;
--         4. login_identify(): finds the account for an email OR a student
--            ID and gives back its id + email. SERVER ONLY: visitors must not
--            be able to ask "does this student ID exist?".
--
-- LAYER: Data layer (Supabase Postgres).
--
-- HOW LOGIN WORKS WITH A STUDENT ID: Supabase Auth only knows emails. So the
--   server (logIn action) asks login_identify() for the email that belongs
--   to the student ID, then logs in with that email + the typed password as
--   usual. If there's no such ID, the person gets the SAME message as for a
--   wrong password ("Email/student ID or password is incorrect.").
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0022_student_id_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The column, its format and uniqueness.
--    text (not a number): a student ID is a CODE, not an amount, and text
--    keeps any leading zero. The CHECK makes sure it's exactly 9 digits.
--    UNIQUE allows many empty (NULL) values: people without a student ID.
-- -----------------------------------------------------------------------------
alter table public.profiles add column student_id text;

alter table public.profiles
  add constraint profiles_student_id_format check (student_id is null or student_id ~ '^[0-9]{9}$'),
  add constraint profiles_student_id_unique unique (student_id);


-- -----------------------------------------------------------------------------
-- 2. Users may change their own student ID.
--    0001 allowed UPDATE of full_name and phone only; this adds student_id.
--    The existing rule "Users can update their own profile" (0001) still
--    limits it to YOUR OWN row. role is still NOT updatable.
-- -----------------------------------------------------------------------------
grant update (student_id) on public.profiles to authenticated;


-- -----------------------------------------------------------------------------
-- 3. The sign-up trigger (0001), now also copying the student ID.
--    Only a correct 9-digit value is copied; anything else is left empty
--    (the server checks it first and shows a message). We STILL never read a
--    role from the form: every new account is a 'customer'.
--    "create or replace" keeps the trigger on auth.users as it is.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id text := btrim(coalesce(new.raw_user_meta_data ->> 'student_id', ''));
begin
  insert into public.profiles (id, full_name, phone, student_id)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    case when v_student_id ~ '^[0-9]{9}$' then v_student_id end
  );
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. login_identify(identifier) -> one row (user_id, email), or NO rows.
--    identifier = an email (any capitals) or a 9-digit student ID.
--    "security definer": it reads auth.users (where Supabase keeps emails),
--    which normal users can't read. Only our server (service_role) may call
--    it, so nobody can use it to test which emails or IDs have accounts.
-- -----------------------------------------------------------------------------
create function public.login_identify(p_identifier text)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text
    from auth.users u
    left join public.profiles p on p.id = u.id
   where (btrim(p_identifier) ~ '^[0-9]{9}$' and p.student_id = btrim(p_identifier))
      or (position('@' in p_identifier) > 0 and lower(u.email) = lower(btrim(p_identifier)))
   limit 1
$$;

revoke execute on function public.login_identify(text) from public, anon, authenticated;
grant execute on function public.login_identify(text) to service_role;
