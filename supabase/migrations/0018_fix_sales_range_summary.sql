-- =============================================================================
-- supabase/migrations/0018_fix_sales_range_summary.sql   (Build step 7, Step 35 fix)
--
-- WHAT: Fixes sales_range_summary() from migration 0017. Running it failed
--       with "aggregate function calls cannot be nested" (error 42803).
--
-- WHAT WAS WRONG (in simple words):
--   An "aggregate" is a function that squeezes MANY rows into ONE value:
--   count(), sum(), jsonb_agg() (which squeezes rows into one JSON list).
--   The old code did both squeezes in ONE step: inside jsonb_agg (list all
--   the days) it also called count() and sum() (add up each day's orders).
--   Postgres can't do "squeeze inside a squeeze" in one step, because it
--   doesn't know which rows each inner count/sum is for.
--
-- THE FIX: two steps.
--   1. per_day: add up EACH day's orders (count, sum), giving one row per
--      day ("group by days.day").
--   2. Then jsonb_agg those day rows into one list, in date order.
--   Same inputs, same result shape, same checks (Manager only, 1-31 days,
--   no future days), so the app needs no change.
--
-- WHY A NEW FILE (not editing 0017)? 0017 has already been run on the
--   database. Migrations are a history: each one is run once, in order. A
--   fix goes in a NEW migration that replaces the function
--   ("create or replace"), so every database ends up the same.
--
-- LAYER: Data layer (Supabase Postgres).
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then re-run BLOCK 1 of supabase/tests/0017_item_volume_checks.sql.
-- =============================================================================

create or replace function public.sales_range_summary(p_start date, p_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to   timestamptz;
  v_days jsonb;
begin
  -- Manager only, 1-31 days, end on/after start, no future days (0017).
  perform public.report_check_manager_range(p_start, p_end);

  v_from := public.jamaica_midnight(p_start);
  v_to   := public.jamaica_midnight(p_end + 1);

  with
  -- The counted orders of the range, each with its Jamaica DAY.
  counted as (
    select r.*, (r.created_at at time zone 'America/Jamaica')::date as day
      from public.report_orders(v_from, v_to) r
     where r.counted
  ),
  -- Every day of the range (so a day with no sales still gets a 0 line).
  days as (
    select d::date as day from generate_series(p_start, p_end, interval '1 day') as d
  ),
  -- STEP 1: add up EACH day (one row per day).
  per_day as (
    select days.day,
           count(c.id)                                                 as orders,
           coalesce(sum(c.total), 0)                                   as gross_sales,
           coalesce(sum(c.amount) filter (where c.method = 'CASH'), 0) as cash,
           coalesce(sum(c.amount) filter (where c.method = 'LYNK'), 0) as lynk
      from days
      left join counted c on c.day = days.day
     group by days.day
  )
  -- STEP 2: put the day rows into one JSON list, in date order.
  select jsonb_agg(jsonb_build_object(
           'day',         p.day,
           'orders',      p.orders,
           'gross_sales', p.gross_sales,
           'refunds',     0,             -- STEP 38: refunds table
           'net_sales',   p.gross_sales, -- gross - refunds (0 for now)
           'cash',        p.cash,
           'lynk',        p.lynk
         ) order by p.day)
    into v_days
    from per_day p;

  return jsonb_build_object(
    'start', p_start,
    'end',   p_end,
    'total', public.report_summary(v_from, v_to),
    'days',  coalesce(v_days, '[]'::jsonb)
  );
end;
$$;

-- "create or replace" keeps the existing permissions from 0017 (Manager
-- check inside; logged-in users may call it, visitors may not). Repeated
-- here so this file is clear on its own.
revoke execute on function public.sales_range_summary(date, date) from public, anon;
grant execute on function public.sales_range_summary(date, date) to authenticated;
