-- =============================================================================
-- supabase/tests/0017_item_volume_checks.sql
--
-- WHAT: Manual checks for migration 0017_item_volume_and_ranges.sql (Step 35),
--       with KNOWN test numbers: the item volume report (sorts, filters,
--       sizes), the date range (daily totals + combined), the date rules,
--       and who may see them.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks 2 and 3 are SUPPOSED to fail. Every block ends with "rollback",
--   so no test data is left behind.
--
-- NEEDS: a 'customer', 'counter_staff', 'manager' and 'delivery_personnel'
--   profile, an active delivery location, and the real menu ("Fry Chicken"
--   in category Chicken, "Pepsi" in Sodas).
--
-- THE TEST DAYS: 15 and 16 January 2020 (Jamaica time), days with no real
--   orders, so real data can't mix in.
--
--   Order | Day    | What                                              | Counted?
--   ------+--------+---------------------------------------------------+---------
--   A     | 15 Jan | CASH pickup: 2 x Fry Chicken (Large) @900 = 1800  | yes
--         |        |              + 1 x Pepsi 220      -> total 2020   |
--   B     | 15 Jan | CASH delivery: 1 x Fry Chicken (Small) 600        | yes
--         |        |              + J$200 fee          -> total 800    |
--   C     | 15 Jan | 5 x Pepsi, CANCELLED                              | no
--   D     | 15 Jan | LYNK 1 x Fry Chicken (Large), UNPAID              | no
--   E     | 16 Jan | CASH pickup: 3 x Pepsi = 660                      | yes
--
--   EXPECTED for 15-16 Jan:
--     items (by quantity): Pepsi 4 / 880; Fry Chicken Large 2 / 1800;
--                          Fry Chicken Small 1 / 600; item total 3280
--     = gross sales 3480 - delivery fees 200.
--     days: 15 Jan 2 orders 2820; 16 Jan 1 order 660; total 3 orders 3480.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: ALL the known-number checks in ONE result (the SQL Editor only
--          shows a block's LAST result, so everything is put in one JSON).
-- EXPECT (one row, "checks"):
--   by_quantity:  Pepsi 4 / 880, Fry Chicken Large 2 / 1800, Fry Chicken Small 1 / 600
--   by_revenue:   Fry Chicken Large, Pepsi, Fry Chicken Small
--   by_name:      Fry Chicken Small, Fry Chicken Large, Pepsi
--                 (name A-Z, then sizes Small, Medium, Large)
--   item_total:   3280
--   delivery_only:    Fry Chicken Small 1 / 600 (one line)
--   category_chicken: Fry Chicken Large 2 / 1800, Fry Chicken Small 1 / 600
--   category_sodas:   Pepsi 4 / 880
--   range.days:   2020-01-15 orders 2, gross 2820, cash 2820, lynk 0;
--                 2020-01-16 orders 1, gross 660,  cash 660,  lynk 0
--   range.total:  orders 3, gross_sales 3480, delivery_fees 200,
--                 net_sales 3480, cancelled 1 / 1100, not_counted 1 / 900,
--                 totals_match true
--   items_equal_gross_minus_fees: true   (3280 = 3480 - 200)
--   one_day_range_same_as_daily:  true   (Step 34 and Step 35 agree)
-- -----------------------------------------------------------------------------
begin;

-- Helper (exists only inside this transaction): an order from a list of
-- lines like [{"name":"Pepsi","size":null,"price":220,"qty":3}].
create function pg_temp.test_order(p_req uuid, p_fulfilment text, p_lines jsonb, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, p_fulfilment,
    case when p_fulfilment = 'DELIVERY'
      then (select id from public.delivery_locations where is_active order by sort_order limit 1) end,
    now() + interval '30 minutes', false,
    (select sum((l ->> 'price')::numeric * (l ->> 'qty')::int) from jsonb_array_elements(p_lines) l),
    case when p_fulfilment = 'DELIVERY' then 200 else 0 end,
    p_method,
    (select jsonb_agg(jsonb_build_object(
        'menu_item_id', (select id from public.menu_items where name = l ->> 'name'),
        'item_name', l ->> 'name', 'size', l ->> 'size',
        'unit_price', (l ->> 'price')::numeric, 'quantity', (l ->> 'qty')::int, 'note', '',
        'line_total', (l ->> 'price')::numeric * (l ->> 'qty')::int, 'extras', '[]'::jsonb))
       from jsonb_array_elements(p_lines) l))
$$;
create function pg_temp.step(p_id bigint, p_from public.order_status, p_to public.order_status, p_cash boolean default false)
returns boolean language sql as $$
  select public.change_order_status(p_id, p_from, p_to,
    (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), p_cash)
$$;
-- Complete a PICKUP order (cash received if p_cash).
create function pg_temp.complete_pickup(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select pg_temp.step(p_id, 'PENDING', 'IN_PROGRESS');
  select pg_temp.step(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP');
  select pg_temp.step(p_id, 'READY_FOR_PICKUP', 'COMPLETED', p_cash);
$$;

select set_config('t.a', pg_temp.test_order('17171717-1717-4717-8717-17171717170a', 'PICKUP',
  '[{"name":"Fry Chicken","size":"Large","price":900,"qty":2},{"name":"Pepsi","size":null,"price":220,"qty":1}]', 'CASH')::text, true);
select set_config('t.b', pg_temp.test_order('17171717-1717-4717-8717-17171717170b', 'DELIVERY',
  '[{"name":"Fry Chicken","size":"Small","price":600,"qty":1}]', 'CASH')::text, true);
select set_config('t.c', pg_temp.test_order('17171717-1717-4717-8717-17171717170c', 'PICKUP',
  '[{"name":"Pepsi","size":null,"price":220,"qty":5}]', 'CASH')::text, true);
select set_config('t.d', pg_temp.test_order('17171717-1717-4717-8717-17171717170d', 'PICKUP',
  '[{"name":"Fry Chicken","size":"Large","price":900,"qty":1}]', 'LYNK')::text, true);
select set_config('t.e', pg_temp.test_order('17171717-1717-4717-8717-17171717170e', 'PICKUP',
  '[{"name":"Pepsi","size":null,"price":220,"qty":3}]', 'CASH')::text, true);

select pg_temp.complete_pickup(current_setting('t.a')::bigint, true);           -- A: PAID
select public.assign_delivery(current_setting('t.b')::bigint, null,             -- B: delivery
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select pg_temp.step(current_setting('t.b')::bigint, 'PENDING', 'IN_PROGRESS');
select pg_temp.step(current_setting('t.b')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP');
select pg_temp.step(current_setting('t.b')::bigint, 'READY_FOR_PICKUP', 'BEING_DELIVERED');
select pg_temp.step(current_setting('t.b')::bigint, 'BEING_DELIVERED', 'COMPLETED', true);
select pg_temp.step(current_setting('t.c')::bigint, 'PENDING', 'CANCELLED');    -- C: cancelled
select pg_temp.complete_pickup(current_setting('t.d')::bigint, false);          -- D: Lynk unpaid
select pg_temp.complete_pickup(current_setting('t.e')::bigint, true);           -- E: PAID

-- Move them to the test days (noon, Jamaica time).
update public.orders set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where client_request_id::text like '17171717-1717-4717-8717-17171717170_'
   and client_request_id::text not like '%e';
update public.orders set created_at = timestamp '2020-01-16 12:00' at time zone 'America/Jamaica'
 where client_request_id = '17171717-1717-4717-8717-17171717170e';

-- Become the Manager.
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'manager' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

-- A short way to list report lines as "name (size) qty / revenue".
create function pg_temp.lines(p_fulfilment text, p_category text, p_sort text)
returns jsonb language sql as $$
  select jsonb_agg(r.item_name || coalesce(' (' || r.size || ')', '') || ' ' || r.quantity || ' / ' || r.revenue
                   order by r.ord)
    -- "with ordinality" numbers the lines in the order the report returned them.
    from public.item_volume_report('2020-01-15', '2020-01-16', p_fulfilment, p_category, p_sort)
         with ordinality as r (menu_item_id, item_name, size, category, quantity, revenue, ord)
$$;

select jsonb_pretty(jsonb_build_object(
  'by_quantity',      pg_temp.lines(null, null, 'quantity'),
  'by_revenue',       pg_temp.lines(null, null, 'revenue'),
  'by_name',          pg_temp.lines(null, null, 'name'),
  'item_total',       (select sum(revenue) from public.item_volume_report('2020-01-15', '2020-01-16')),
  'delivery_only',    pg_temp.lines('DELIVERY', null, 'quantity'),
  'category_chicken', pg_temp.lines(null, 'Chicken', 'quantity'),
  'category_sodas',   pg_temp.lines(null, 'Sodas', 'quantity'),
  'range',            public.sales_range_summary('2020-01-15', '2020-01-16'),
  'items_equal_gross_minus_fees',
      (select sum(revenue) from public.item_volume_report('2020-01-15', '2020-01-16'))
        = ((public.sales_range_summary('2020-01-15', '2020-01-16') -> 'total' ->> 'gross_sales')::numeric
           - (public.sales_range_summary('2020-01-15', '2020-01-16') -> 'total' ->> 'delivery_fees')::numeric),
  'one_day_range_same_as_daily',
      (public.sales_range_summary('2020-01-15', '2020-01-15') -> 'total')
        = (public.daily_sales_summary('2020-01-15') - 'day')
)) as checks;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: the DATE RULES (no setup needed). Run each "select" line on its
--          own (highlight from "begin;" down to that line, then "rollback;").
-- EXPECT, one ERROR each:
--   end before start -> "The end day must be on or after the start day."
--   32 days          -> "Choose at most 31 days."
--   a future day     -> "The range can't include future days."
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'manager' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select public.sales_range_summary('2020-01-16', '2020-01-15');
-- select public.sales_range_summary('2020-01-01', '2020-02-01');
-- select public.item_volume_report('2020-01-01', ((now() at time zone 'America/Jamaica')::date + 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: WHO: counter staff can't use the range or item reports (and nor
--          can drivers or customers: change the role below and run again).
--          Nobody can call the helper report_orders() directly.
-- EXPECT: an ERROR: "Only the Manager can see these reports."
--         (With the commented-out line instead:
--          "permission denied for function report_orders".)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select public.sales_range_summary((now() at time zone 'America/Jamaica')::date,
                                  (now() at time zone 'America/Jamaica')::date);
-- select * from public.report_orders(now() - interval '1 day', now());

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: counter staff's TODAY summary still works (Step 34, now using the
--          shared rule).
-- EXPECT: 1 row: today's summary (real numbers, whatever they are).
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select jsonb_pretty(public.daily_sales_summary((now() at time zone 'America/Jamaica')::date)) as summary;

rollback;
