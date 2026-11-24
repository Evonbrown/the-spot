-- =============================================================================
-- supabase/migrations/0016_sales_summary.sql   (Build step 7, Step 34)
--
-- WHAT: The Daily Sales Summary (FR-06 SR-6.1, SR-6.2, SR-6.3, SR-6.10,
--       AC-6.1 to AC-6.3), worked out BY THE DATABASE:
--         1. an index on orders.created_at, so "the orders of one day" is
--            found quickly (must load within 3 s for 500 orders);
--         2. daily_sales_summary(p_day): all the day's figures in ONE call.
--
-- LAYER: Data layer (Supabase Postgres).
--
-- THE RULES (FR-06 + decisions):
--   - A business day = midnight to midnight JAMAICA time (America/Jamaica,
--     UTC-5). An order belongs to the day it was PLACED (created_at).
--   - COUNTED orders = payment PAID AND the order is not CANCELLED or
--     ABANDONED. Everything else is never sales.
--   - Gross sales = total of counted orders (items + delivery fees).
--   - Refunds = 0 for now (no refunds table until Step 38: see "STEP 38").
--   - Net sales = gross sales - refunds.
--   - Breakdown per payment type (LYNK, CASH): transactions, amount, refunds,
--     net, % of net sales. The amounts are added up from the PAYMENTS table,
--     net sales from the ORDERS table, so "totals_match" really checks the
--     data (AC-6.3) instead of comparing a number with itself.
--   - For information (never in sales): cancelled, abandoned, and "not
--     counted" (unpaid orders, e.g. Lynk waiting for the Supervisor).
--
-- WHO MAY RUN IT (SR-6.10)? The function checks it itself:
--   manager       -> any day;
--   counter_staff -> TODAY (Jamaica) only;
--   anyone else   -> refused.
--   It returns ONLY totals, never order rows or customer details, so the
--   Manager doesn't need read access to every order (least privilege).
--   "security definer" = it adds up the orders with its OWNER's rights, but
--   only AFTER the role check above.
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0016_sales_summary_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Speed: an index is like the index at the back of a book. Without it,
--    Postgres reads EVERY order to find one day's; with it, it jumps there.
-- -----------------------------------------------------------------------------
create index orders_created_at_idx on public.orders (created_at);


-- -----------------------------------------------------------------------------
-- 2. daily_sales_summary(p_day) -> one JSON object with every figure.
--    (JSON = a bundle of named values; easy for the app to read.)
-- -----------------------------------------------------------------------------
create function public.daily_sales_summary(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role  text := public.current_user_role();
  -- "today" in Jamaica, from the database's own clock.
  v_today date := (now() at time zone 'America/Jamaica')::date;
  -- The day's start and end as real moments in time: midnight Jamaica.
  -- ("timestamp ... at time zone 'America/Jamaica'" = "this clock time IN
  --  Jamaica", turned into an exact moment.)
  v_from  timestamptz;
  v_to    timestamptz;
  v_result jsonb;
begin
  if p_day is null then
    raise exception 'Choose a day.';
  end if;

  -- SR-6.10: who may see which day.
  if v_role = 'manager' then
    null; -- any day
  elsif v_role = 'counter_staff' then
    if p_day <> v_today then
      raise exception 'Counter staff can only see today''s sales.';
    end if;
  else
    raise exception 'You are not allowed to see sales reports.';
  end if;

  v_from := p_day::timestamp at time zone 'America/Jamaica';
  v_to   := (p_day + 1)::timestamp at time zone 'America/Jamaica';

  with
  -- Every order placed that day, with its payment (if any).
  day_orders as (
    select o.id, o.status, o.total, o.delivery_fee,
           pay.method, pay.status as pay_status, pay.amount
      from public.orders o
      left join public.payments pay on pay.order_id = o.id
     where o.created_at >= v_from
       and o.created_at <  v_to
  ),
  -- The ones that COUNT as sales (FR-06).
  counted as (
    select * from day_orders
     where pay_status = 'PAID'
       and status not in ('CANCELLED', 'ABANDONED')
  ),
  -- Per payment type. Both types are always listed (a type with no sales
  -- shows 0), so the table on screen never changes shape.
  -- STEP 38: subtract each type's refunds here (refunds table).
  by_method as (
    select m.method,
           count(c.id)                  as transactions,
           coalesce(sum(c.amount), 0)   as amount,
           0::numeric                   as refunds
      from (values ('LYNK'), ('CASH')) as m (method)
      left join counted c on c.method = m.method
     group by m.method
  ),
  totals as (
    select count(*)                         as orders,
           coalesce(sum(total), 0)          as gross_sales,
           coalesce(sum(delivery_fee), 0)   as delivery_fees,
           0::numeric                       as refunds -- STEP 38: refunds table
      from counted
  )
  select jsonb_build_object(
    'day',            p_day,
    'orders',         t.orders,
    'gross_sales',    t.gross_sales,
    'delivery_fees',  t.delivery_fees,
    'refunds',        t.refunds,
    'net_sales',      t.gross_sales - t.refunds,
    -- For information only (never in sales):
    'cancelled_count', (select count(*) from day_orders where status = 'CANCELLED'),
    'cancelled_value', (select coalesce(sum(total), 0) from day_orders where status = 'CANCELLED'),
    'abandoned_count', (select count(*) from day_orders where status = 'ABANDONED'),
    'abandoned_value', (select coalesce(sum(total), 0) from day_orders where status = 'ABANDONED'),
    'not_counted_count', (select count(*) from day_orders
                           where status not in ('CANCELLED', 'ABANDONED')
                             and pay_status is distinct from 'PAID'),
    'not_counted_value', (select coalesce(sum(total), 0) from day_orders
                           where status not in ('CANCELLED', 'ABANDONED')
                             and pay_status is distinct from 'PAID'),
    -- The breakdown, Lynk first then Cash.
    'by_method', (
      select jsonb_agg(jsonb_build_object(
               'method',       b.method,
               'transactions', b.transactions,
               'amount',       b.amount,
               'refunds',      b.refunds,
               'net',          b.amount - b.refunds,
               -- % of net sales, 1 decimal. "nullif(..., 0)" avoids dividing
               -- by zero on a day with no sales (then the % is 0).
               'percent',      coalesce(round((b.amount - b.refunds) * 100
                                 / nullif(t.gross_sales - t.refunds, 0), 1), 0)
             ) order by b.method desc)
        from by_method b
    ),
    -- AC-6.3: do the payment-type totals add up to net sales?
    'methods_total', (select coalesce(sum(b.amount - b.refunds), 0) from by_method b),
    'totals_match',  (select coalesce(sum(b.amount - b.refunds), 0) from by_method b)
                       = (t.gross_sales - t.refunds)
  )
  into v_result
  from totals t;

  return v_result;
end;
$$;

-- Logged-in users may CALL it (the function itself decides who sees what);
-- visitors may not.
revoke execute on function public.daily_sales_summary(date) from public, anon;
grant execute on function public.daily_sales_summary(date) to authenticated;
