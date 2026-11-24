-- =============================================================================
-- supabase/migrations/0025_staff_idle.sql   (Build step 8, Step 39c)
--
-- WHAT: Staff are logged out after 30 minutes WITHOUT ACTIVITY (SRS Section 3,
--       Security: "staff auto-logout after 30 min idle"):
--         1. profiles.last_active_at: the last time this STAFF member really
--            used the app (tapped, typed, scrolled), as told by our server;
--         2. touch_staff_activity(user): sets it to "now". SERVER ONLY, and
--            only for staff roles (customers are never logged out for being
--            idle).
--
-- LAYER: Data layer (Supabase Postgres).
--
-- WHY IN THE DATABASE (and not only a timer in the browser)? A browser timer
--   can be switched off, or put to sleep when a laptop closes. Our server
--   reads this time on EVERY page and action (getCurrentProfile), so a staff
--   member idle for over 30 minutes counts as logged out, whatever the
--   browser does. Staff screens refresh themselves, so an idle screen is
--   logged out at its next refresh.
--
-- WHO CAN CHANGE IT? Nobody with the public key: users may only update
--   full_name, phone and student_id (column grants, 0001 + 0022), so a staff
--   member can't keep themselves "active" forever by editing it.
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0025_staff_idle_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The column. NULL = no activity recorded yet (e.g. logged in before this
--    migration): treated as active until the first activity is recorded.
-- -----------------------------------------------------------------------------
alter table public.profiles add column last_active_at timestamptz;


-- -----------------------------------------------------------------------------
-- 2. touch_staff_activity(user) -> true if recorded, false if this person is
--    not staff (customers aren't tracked).
--    The browser tells our server at most once a minute; the server calls this.
-- -----------------------------------------------------------------------------
create function public.touch_staff_activity(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with touched as (
    update public.profiles
       set last_active_at = now()
     where id = p_user_id
       and role in ('counter_staff', 'delivery_personnel', 'manager', 'supervisor')
    returning 1
  )
  select exists (select 1 from touched)
$$;

revoke execute on function public.touch_staff_activity(uuid) from public, anon, authenticated;
grant execute on function public.touch_staff_activity(uuid) to service_role;
