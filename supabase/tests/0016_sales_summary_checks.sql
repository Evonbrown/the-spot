-- =============================================================================
-- supabase/tests/0016_sales_summary_checks.sql
--
-- WHAT: Manual checks for migration 0016_sales_summary.sql (Step 34), with
--       KNOWN test numbers, so we can check every figure by hand.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks 3 and 5 are SUPPOSED to fail. Every block ends with "rollback",
--   so no test data is left behind.
--
-- NEEDS: a 'customer', a 'counter_staff', a 'manager', a 'delivery_personnel'
--   profile, an active delivery location, and the menu.
--
-- THE TEST DAY: all test orders are moved to 15 January 2020 (Jamaica time),
--   a day with no real orders, so real data can't mix in.
--
--   Order | What                                              | Counted?
--   ------+---------------------------------------------------+----------
--   A     | CASH pickup J$1,000, completed, PAID              | yes
--   B     | CASH delivery J$1,500 + J$200 fee = 1,700, PAID   | yes
--   C     | LYNK pickup J$800, PAID (by hand: "the Supervisor")| yes
--   D     | CASH pickup J$600, CANCELLED                      | no (cancelled)
--   E     | CASH pickup J$400, ABANDONED                      | no (abandoned)
--   F     | LYNK pickup J$900, completed, UNPAID              | no (not counted)
--
--   EXPECTED for 2020-01-15:
--     orders 3, gross_sales 3500, delivery_fees 200, refunds 0,
--     net_sales 3500, cancelled 1 / 600, abandoned 1 / 400,
--     not_counted 1 / 900,
--     LYNK: 1 transaction, 800, 22.9 %;  CASH: 2 transactions, 2700, 77.1 %,
--     methods_total 3500, totals_match true.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: the known numbers, as the MANAGER.
-- EXPECT: (setup results), then ONE row with the JSON summary. Compare it
--         with "EXPECTED" above.
-- -----------------------------------------------------------------------------
begin;

-- A small helper that ONLY exists inside this transaction ("pg_temp"):
-- makes one test order with a single line of the given amount.
create function pg_temp.test_order(p_req uuid, p_fulfilment text, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, p_fulfilment,
    case when p_fulfilment = 'DELIVERY'
      then (select id from public.delivery_locations where is_active order by sort_order limit 1) end,
    now() + interval '30 minutes', false, p_amount,
    case when p_fulfilment = 'DELIVERY' then 200 else 0 end,
    p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;

-- Another helper: move an order one step with the normal status function.
create function pg_temp.step(p_id bigint, p_from public.order_status, p_to public.order_status, p_cash boolean default false)
returns boolean language sql as $$
  select public.change_order_status(p_id, p_from, p_to,
    (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), p_cash)
$$;

-- The six orders. set_config remembers each Order ID by letter.
select set_config('t.a', pg_temp.test_order('16161616-1616-4616-8616-16161616160a', 'PICKUP',   1000, 'CASH')::text, true);
select set_config('t.b', pg_temp.test_order('16161616-1616-4616-8616-16161616160b', 'DELIVERY', 1500, 'CASH')::text, true);
select set_config('t.c', pg_temp.test_order('16161616-1616-4616-8616-16161616160c', 'PICKUP',    800, 'LYNK')::text, true);
select set_config('t.d', pg_temp.test_order('16161616-1616-4616-8616-16161616160d', 'PICKUP',    600, 'CASH')::text, true);
select set_config('t.e', pg_temp.test_order('16161616-1616-4616-8616-16161616160e', 'PICKUP',    400, 'CASH')::text, true);
select set_config('t.f', pg_temp.test_order('16161616-1616-4616-8616-16161616160f', 'PICKUP',    900, 'LYNK')::text, true);

-- A: cash pickup, completed with cash received -> PAID.
select pg_temp.step(current_setting('t.a')::bigint, 'PENDING', 'IN_PROGRESS');
select pg_temp.step(current_setting('t.a')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP');
select pg_temp.step(current_setting('t.a')::bigint, 'READY_FOR_PICKUP', 'COMPLETED', true);

-- B: cash delivery: driver assigned, out, completed with cash -> PAID.
select public.assign_delivery(current_setting('t.b')::bigint, null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select pg_temp.step(current_setting('t.b')::bigint, 'PENDING', 'IN_PROGRESS');
select pg_temp.step(current_setting('t.b')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP');
select pg_temp.step(current_setting('t.b')::bigint, 'READY_FOR_PICKUP', 'BEING_DELIVERED');
select pg_temp.step(current_setting('t.b')::bigint, 'BEING_DELIVERED', 'COMPLETED', true);

-- C: Lynk pickup completed; marked PAID by hand (stands in for the
-- Supervisor's verification, which is built later).
select pg_temp.step(current_setting('t.c')::bigint, 'PENDING', 'IN_PROGRESS');
select pg_temp.step(current_setting('t.c')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP');
select pg_temp.step(current_setting('t.c')::bigint, 'READY_FOR_PICKUP', 'COMPLETED');
update public.payments
   set status = 'PAID', paid_at = now(),
       paid_by = (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
 where order_id = current_setting('t.c')::bigint;

-- D: cancelled.
select pg_temp.step(current_setting('t.d')::bigint, 'PENDING', 'CANCELLED');

-- E: abandoned (ready "20 minutes ago", the Step 28 trick).
select pg_temp.step(current_setting('t.e')::bigint, 'PENDING', 'IN_PROGRESS');
select pg_temp.step(current_setting('t.e')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP');
update public.order_status_history set changed_at = now() - interval '20 minutes'
 where order_id = current_setting('t.e')::bigint and status = 'READY_FOR_PICKUP';
select pg_temp.step(current_setting('t.e')::bigint, 'READY_FOR_PICKUP', 'ABANDONED');

-- F: Lynk completed, still UNPAID.
select pg_temp.step(current_setting('t.f')::bigint, 'PENDING', 'IN_PROGRESS');
select pg_temp.step(current_setting('t.f')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP');
select pg_temp.step(current_setting('t.f')::bigint, 'READY_FOR_PICKUP', 'COMPLETED');

-- Move all six to the TEST DAY: 15 Jan 2020, 12:00 noon Jamaica time.
update public.orders
   set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where client_request_id::text like '16161616-1616-4616-8616-16161616160_';

-- Become the Manager and ask for that day.
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'manager' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select jsonb_pretty(public.daily_sales_summary('2020-01-15')) as summary;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: the WARNING (AC-6.3). If a payment's amount doesn't match its
--          order's total, the payment-type totals no longer equal net sales.
--          Here: one cash order J$1,000, but its payment says J$900.
-- EXPECT: 1 row: net_sales = 1000, methods_total = 900, totals_match = false.
-- -----------------------------------------------------------------------------
begin;

select set_config('t.a', public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '16161616-1616-4616-8616-161616161601', 'PICKUP', null,
  now() + interval '15 minutes', false, 1000, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Test item', 'size', null, 'unit_price', 1000,
    'quantity', 1, 'note', '', 'line_total', 1000, 'extras', '[]'::jsonb)))::text, true);

-- Completed + PAID (cash), then the payment amount is "wrong" by J$100.
select public.change_order_status(current_setting('t.a')::bigint, 'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('t.a')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('t.a')::bigint, 'READY_FOR_PICKUP', 'COMPLETED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), true);
update public.payments set amount = 900 where order_id = current_setting('t.a')::bigint;

update public.orders
   set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where id = current_setting('t.a')::bigint;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'manager' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select s ->> 'net_sales' as net_sales,
       s ->> 'methods_total' as methods_total,
       s ->> 'totals_match' as totals_match
from (select public.daily_sales_summary('2020-01-15') as s) x;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: COUNTER STAFF can't see a PAST day (SR-6.10).
-- EXPECT: an ERROR: "Counter staff can only see today's sales."
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select public.daily_sales_summary('2020-01-15');

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: COUNTER STAFF can see TODAY (Jamaica time).
-- EXPECT: 1 row: a summary for today (today's real numbers, whatever they are).
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select jsonb_pretty(public.daily_sales_summary((now() at time zone 'America/Jamaica')::date)) as summary;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: a DRIVER gets no access (and a customer neither: change
--          'delivery_personnel' to 'customer' below and run again).
-- EXPECT: an ERROR: "You are not allowed to see sales reports."
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select public.daily_sales_summary((now() at time zone 'America/Jamaica')::date);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: an EMPTY day: all zeros, and no "division by zero" for the %.
-- EXPECT: 1 row: orders 0, gross_sales 0, net_sales 0, both payment types
--         with 0 transactions, 0 amount and percent 0, totals_match true.
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'manager' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select jsonb_pretty(public.daily_sales_summary('2000-01-01')) as summary;

rollback;
