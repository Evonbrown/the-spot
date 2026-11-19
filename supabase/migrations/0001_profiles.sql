-- =============================================================================
-- supabase/migrations/0001_profiles.sql
--
-- WHAT: Creates the "profiles" table, which stores each user's ROLE plus their
--       name and phone number. One row per user, linked to their Supabase login.
--
-- LAYER: Data layer (Supabase Postgres), protected by Row Level Security (RLS).
--
-- WHY: Supabase Auth only stores email + password (hashed). It does not know our
--      roles. The SRS (Security, section 3) says access must be role-based and
--      enforced by RLS + server checks, and both need to look up "what is this
--      user's role?" -- this table is where that answer lives.
--
-- CLASS DIAGRAM: User -> Customer, Supervisor, Staff;
--                Staff -> CounterStaff, DeliveryPersonnel, Manager.
--      We store all of these in ONE table with a "role" column instead of one
--      table per class, because every subclass shares the same login data.
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query -> paste this whole
--      file -> Run. Run it ONCE. (Running it again will fail with
--      "already exists" errors, because the objects are already there.)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The list of allowed roles (an "enum" = a fixed list of values).
--    These are exactly the 5 role names from CLAUDE.md. Postgres will refuse
--    to save any other value, e.g. a typo like 'manger' is rejected.
-- -----------------------------------------------------------------------------
create type public.user_role as enum (
  'customer',
  'counter_staff',
  'delivery_personnel',
  'manager',
  'supervisor'
);


-- -----------------------------------------------------------------------------
-- 2. The profiles table.
--    id         = the same id as the user's row in auth.users (Supabase's own
--                 login table). "references" links them; "on delete cascade"
--                 means if the login is deleted, the profile is deleted too.
--    full_name  = shown to staff on orders.
--    phone      = FR-04: the driver sees the customer's phone.
--                 FR-05: used for (simulated) SMS notifications.
--    role       = defaults to 'customer'. Staff roles are set by an admin.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  phone      text,
  role       public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 3. Turn on Row Level Security (RLS).
--    With RLS ON and no policies, NOBODY (using the public key) can read or
--    change any row. Each policy below then opens up one specific, safe action.
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;


-- -----------------------------------------------------------------------------
-- 4. Table permissions ("grants") -- WHICH COLUMNS each kind of user may touch.
--    anon          = a visitor who is not logged in.
--    authenticated = any logged-in user (any role).
--    We start by removing everything, then give back only what is needed:
--      - logged-in users may SELECT (read) profiles  (RLS limits it to their own row)
--      - logged-in users may UPDATE ONLY full_name and phone.
--    Because "role" is NOT in the update list, a user can never change their own
--    role -- even by sending a hand-made request with the public key.
-- -----------------------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;


-- -----------------------------------------------------------------------------
-- 5. RLS policies -- WHICH ROWS each user may touch.
--    auth.uid() = the id of the user making the request (from their login token).
--    "(select auth.uid())" is written inside a select so Postgres works it out
--    once per query instead of once per row (Supabase's recommended speed tip).
-- -----------------------------------------------------------------------------

-- A logged-in user can read ONLY their own profile.
-- (Later, when staff need to see customer names/phones on orders, we will add a
--  separate, carefully limited rule for that.)
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- A logged-in user can update ONLY their own profile
-- (and, because of the grants above, only the full_name and phone columns).
--   using       = which existing rows they may change
--   with check  = what the row must look like after the change
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Note: there is NO insert or delete policy, so users can't create or delete
-- profiles themselves. Profiles are created only by the trigger below.


-- -----------------------------------------------------------------------------
-- 6. Automatically create a profile when someone signs up.
--
--    A "trigger" is code the database runs automatically when something happens.
--    Here: AFTER a new row is inserted into auth.users (= someone signed up),
--    run handle_new_user(), which inserts their row into profiles.
--
--    SECURITY: we copy full_name and phone from the sign-up form
--    (raw_user_meta_data), but we NEVER read a role from it. Every new user gets
--    the default role 'customer', so nobody can sign up as a manager by
--    tampering with the form.
--
--    "security definer" = run with the permissions of the function's owner, not
--    the new user (who has no insert permission on profiles).
--    "set search_path = ''" = a safety setting so the function only uses the
--    exact table names we write (public.profiles), not look-alike tables.
-- -----------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 7. Backfill: if any users were created BEFORE this trigger existed, give them
--    a profile too (as 'customer'). "on conflict do nothing" skips users who
--    already have one.
-- -----------------------------------------------------------------------------
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
