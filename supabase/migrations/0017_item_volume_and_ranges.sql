-- =============================================================================
-- supabase/migrations/0017_item_volume_and_ranges.sql   (Build step 7, Step 35)
--
-- WHAT: More Manager reports (FR-06 SR-6.4, SR-6.5, AC-6.4, AC-6.5),
--       all worked out BY THE DATABASE:
--         1. report_orders(): THE shared rule "which orders of a period, and
--            which of them COUNT as sales". Every report uses it, so the
--            reports can never disagree (decision).
--         2. report_summary(): the summary figures for any period (the same
--            figures as Step 34).
--         3. daily_sales_summary(p_day) (Step 34) rewritten to use 1 + 2.
--            Nothing changes for its users (counter staff still today only).
--         4. sales_range_summary(start, end): a line per day + the combined
--            summary, for 1 to 31 days (decision: 31 days max).
--         5. item_volume_report(start, end, order type, category, sort):
--            one line per menu item AND SIZE (decision), e.g. "Fry Chicken
--            (Large)", with quantity sold and revenue.
--
-- LAYER: Data layer (Supabase Postgres).
--
-- THE RULES (same as Step 34):
--   - an order belongs to the day it was PLACED, midnight to midnight
--     JAMAICA time (America/Jamaica);
--   - it COUNTS if its payment is PAID and it is not CANCELLED/ABANDONED;
--   - item revenue = the saved line totals (price as charged, incl. extras
--     on that line); delivery fees are NOT item revenue, so
--     item revenue total = gross sales - delivery fees.
--
-- WHO (SR-6.10): the range summary and the item report are MANAGER ONLY.
--   The helpers (1, 2) return rows/figures without any check, so NOBODY may
--   call them directly: only our report functions use them.
--
-- SPEED (10 s for 31 days): the orders.created_at index (0016) finds the
--   period's orders; order_items has an index on order_id (0006).
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0017_item_volume_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. report_orders(p_from, p_to): every order PLACED in [p_from, p_to), with
--    its payment, and "counted" = does it count as sales? THE ONE PLACE where
--    that rule is written.
--    "(...) is true" turns "unknown" (no payment row) into false.
-- -----------------------------------------------------------------------------
create function public.report_orders(p_from timestamptz, p_to timestamptz)
returns table (
  id           bigint,
  created_at   timestamptz,
  status       public.order_status,
  fulfilment   text,
  total        numeric,
  delivery_fee numeric,
  method       text,
  pay_status   text,
  amount       numeric,
  counted      boolean
)
language sql
stable
set search_path = ''
as $$
  select o.id, o.created_at, o.status, o.fulfilment, o.total, o.delivery_fee,
         pay.method, pay.status, pay.amount,
         (pay.status = 'PAID' and o.status not in ('CANCELLED', 'ABANDONED')) is true
    from public.orders o
    left join public.payments pay on pay.order_id = o.id
   where o.created_at >= p_from
     and o.created_at <  p_to
$$;

revoke execute on function public.report_orders(timestamptz, timestamptz) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. report_summary(p_from, p_to): the summary figures for a period, as JSON
--    (the same names Step 34 uses, so the app reads them the same way).
--    STEP 38: refunds come from the refunds table (0 until then).
-- -----------------------------------------------------------------------------
create function public.report_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with
  period as (select * from public.report_orders(p_from, p_to)),
  counted as (select * from period where counted),
  by_method as (
    select m.method,
           count(c.id)                as transactions,
           coalesce(sum(c.amount), 0) as amount,
           0::numeric                 as refunds -- STEP 38
      from (values ('LYNK'), ('CASH')) as m (method)
      left join counted c on c.method = m.method
     group by m.method
  ),
  totals as (
    select count(*)                       as orders,
           coalesce(sum(total), 0)        as gross_sales,
           coalesce(sum(delivery_fee), 0) as delivery_fees,
           0::numeric                     as refunds -- STEP 38
      from counted
  )
  select jsonb_build_object(
    'orders',          t.orders,
    'gross_sales',     t.gross_sales,
    'delivery_fees',   t.delivery_fees,
    'refunds',         t.refunds,
    'net_sales',       t.gross_sales - t.refunds,
    'cancelled_count', (select count(*) from period where status = 'CANCELLED'),
    'cancelled_value', (select coalesce(sum(total), 0) from period where status = 'CANCELLED'),
    'abandoned_count', (select count(*) from period where status = 'ABANDONED'),
    'abandoned_value', (select coalesce(sum(total), 0) from period where status = 'ABANDONED'),
    'not_counted_count', (select count(*) from period
                           where not counted and status not in ('CANCELLED', 'ABANDONED')),
    'not_counted_value', (select coalesce(sum(total), 0) from period
                           where not counted and status not in ('CANCELLED', 'ABANDONED')),
    'by_method', (
      select jsonb_agg(jsonb_build_object(
               'method',       b.method,
               'transactions', b.transactions,
               'amount',       b.amount,
               'refunds',      b.refunds,
               'net',          b.amount - b.refunds,
               'percent',      coalesce(round((b.amount - b.refunds) * 100
                                 / nullif(t.gross_sales - t.refunds, 0), 1), 0)
             ) order by b.method desc) -- LYNK, then CASH
        from by_method b
    ),
    'methods_total', (select coalesce(sum(b.amount - b.refunds), 0) from by_method b),
    'totals_match',  (select coalesce(sum(b.amount - b.refunds), 0) from by_method b)
                       = (t.gross_sales - t.refunds)
  )
  from totals t
$$;

revoke execute on function public.report_summary(timestamptz, timestamptz) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Small helper: a Jamaica DAY -> the exact moment its midnight starts.
-- -----------------------------------------------------------------------------
create function public.jamaica_midnight(p_day date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_day::timestamp at time zone 'America/Jamaica'
$$;


-- -----------------------------------------------------------------------------
-- Manager-only check for a date RANGE (SR-6.10 + decisions). Raises a clear
-- error if anything is wrong; returns nothing if all is fine.
-- -----------------------------------------------------------------------------
create function public.report_check_manager_range(p_start date, p_end date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'manager' then
    raise exception 'Only the Manager can see these reports.';
  end if;
  if p_start is null or p_end is null then
    raise exception 'Choose a start and an end day.';
  end if;
  if p_end < p_start then
    raise exception 'The end day must be on or after the start day.';
  end if;
  if p_end - p_start > 30 then
    raise exception 'Choose at most 31 days.';
  end if;
  if p_end > (now() at time zone 'America/Jamaica')::date then
    raise exception 'The range can''t include future days.';
  end if;
end;
$$;

revoke execute on function public.report_check_manager_range(date, date) from public, anon;


-- -----------------------------------------------------------------------------
-- 3. daily_sales_summary(p_day) (Step 34), now using the shared rule.
--    Same inputs, same result, same access rules as before.
-- -----------------------------------------------------------------------------
create or replace function public.daily_sales_summary(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role  text := public.current_user_role();
  v_today date := (now() at time zone 'America/Jamaica')::date;
begin
  if p_day is null then
    raise exception 'Choose a day.';
  end if;

  -- SR-6.10: manager any day; counter staff today only; nobody else.
  if v_role = 'manager' then
    null;
  elsif v_role = 'counter_staff' then
    if p_day <> v_today then
      raise exception 'Counter staff can only see today''s sales.';
    end if;
  else
    raise exception 'You are not allowed to see sales reports.';
  end if;

  return jsonb_build_object('day', p_day)
      || public.report_summary(public.jamaica_midnight(p_day), public.jamaica_midnight(p_day + 1));
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. sales_range_summary(p_start, p_end): MANAGER ONLY (SR-6.5).
--    Returns { start, end, total: <summary for the whole range>,
--              days: [ {day, orders, gross_sales, refunds, net_sales,
--                       cash, lynk}, ... ] }
--    "generate_series" makes one line for EVERY day, so days with no sales
--    show 0 instead of disappearing.
-- -----------------------------------------------------------------------------
create function public.sales_range_summary(p_start date, p_end date)
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
  perform public.report_check_manager_range(p_start, p_end);

  v_from := public.jamaica_midnight(p_start);
  v_to   := public.jamaica_midnight(p_end + 1);

  with
  counted as (
    select r.*, (r.created_at at time zone 'America/Jamaica')::date as day
      from public.report_orders(v_from, v_to) r
     where r.counted
  ),
  days as (
    select d::date as day from generate_series(p_start, p_end, interval '1 day') as d
  )
  select jsonb_agg(jsonb_build_object(
           'day',         days.day,
           'orders',      count(c.id),
           'gross_sales', coalesce(sum(c.total), 0),
           'refunds',     0, -- STEP 38
           'net_sales',   coalesce(sum(c.total), 0),
           'cash',        coalesce(sum(c.amount) filter (where c.method = 'CASH'), 0),
           'lynk',        coalesce(sum(c.amount) filter (where c.method = 'LYNK'), 0)
         ) order by days.day)
    into v_days
    from days
    left join counted c on c.day = days.day
   group by true;

  return jsonb_build_object(
    'start', p_start,
    'end',   p_end,
    'total', public.report_summary(v_from, v_to),
    'days',  coalesce(v_days, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.sales_range_summary(date, date) from public, anon;
grant execute on function public.sales_range_summary(date, date) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. item_volume_report(...): MANAGER ONLY (SR-6.4).
--    p_fulfilment = null (all) | 'PICKUP' | 'DELIVERY'
--    p_category   = null (all) | a category name, e.g. 'Chicken'
--    p_sort       = 'quantity' (default, highest first) | 'revenue' | 'name'
--    One line per menu item AND size (decision). The NAME is the one saved
--    with the orders (the latest one, if it was ever renamed); the CATEGORY
--    comes from the menu item.
-- -----------------------------------------------------------------------------
create function public.item_volume_report(
  p_start      date,
  p_end        date,
  p_fulfilment text default null,
  p_category   text default null,
  p_sort       text default 'quantity'
)
returns table (
  menu_item_id bigint,
  item_name    text,
  size         text,
  category     text,
  quantity     bigint,
  revenue      numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.report_check_manager_range(p_start, p_end);

  if p_fulfilment is not null and p_fulfilment not in ('PICKUP', 'DELIVERY') then
    raise exception 'Order type must be PICKUP or DELIVERY.';
  end if;
  if coalesce(p_sort, 'quantity') not in ('quantity', 'revenue', 'name') then
    raise exception 'Sort must be quantity, revenue or name.';
  end if;

  return query
  with lines as (
    select oi.menu_item_id, oi.item_name, oi.size, oi.quantity, oi.line_total, r.created_at
      from public.report_orders(public.jamaica_midnight(p_start), public.jamaica_midnight(p_end + 1)) r
      join public.order_items oi on oi.order_id = r.id
     where r.counted
       and (p_fulfilment is null or r.fulfilment = p_fulfilment)
  ),
  grouped as (
    select l.menu_item_id,
           l.size,
           -- the latest saved name for this item (if it was ever renamed)
           (array_agg(l.item_name order by l.created_at desc))[1] as item_name,
           sum(l.quantity)::bigint as quantity,
           sum(l.line_total)       as revenue
      from lines l
     group by l.menu_item_id, l.size
  )
  select g.menu_item_id, g.item_name, g.size, coalesce(mi.category, 'Other'),
         g.quantity, g.revenue
    from grouped g
    left join public.menu_items mi on mi.id = g.menu_item_id
   where p_category is null or mi.category = p_category
   order by
     -- the chosen sort first, then name + size so the order is always the same
     case when coalesce(p_sort, 'quantity') = 'quantity' then g.quantity end desc nulls last,
     case when p_sort = 'revenue' then g.revenue end desc nulls last,
     g.item_name,
     case g.size when 'Small' then 1 when 'Medium' then 2 when 'Large' then 3 else 0 end;
end;
$$;

revoke execute on function public.item_volume_report(date, date, text, text, text) from public, anon;
grant execute on function public.item_volume_report(date, date, text, text, text) to authenticated;
