-- =============================================================================
-- supabase/tests/0006_orders_checks.sql
--
-- WHAT: Manual checks for migration 0006_orders.sql (Part 19).
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run. Do the blocks one at a time:
--   some are SUPPOSED to fail, and an error stops everything after it.
--   Every block ends with "rollback", so NO test data is left behind.
--
-- NEEDS: at least one profile with role 'customer', the real menu
--   (real_menu_items.sql) and the sample extras (sample_customizations.sql).
--
-- HOW "acting as a user" works (same trick as earlier parts):
--   set_config('request.jwt.claims', ...) pretends a login token for that user,
--   and "set local role authenticated" switches to the logged-in role, so RLS
--   applies exactly as it would for that person in the app.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: the server can create an order; the customer can read it.
-- EXPECT: the last query shows 1 row: id 1001 (or higher), PENDING, PICKUP,
--         total 2700.00, payment CASH / UNPAID, 1 item, 1 extra.
-- -----------------------------------------------------------------------------
begin;

-- As the database owner (stands in for our server), create a test order:
-- 2 × Fry Chicken (Large) + Coleslaw = (1200 + 150) × 2 = 2700.
select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '11111111-1111-1111-1111-111111111111',
  'PICKUP', null, now() + interval '15 minutes', false,
  2700, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Fry Chicken'),
    'item_name', 'Fry Chicken', 'size', 'Large', 'unit_price', 1200,
    'quantity', 2, 'note', 'test order', 'line_total', 2700,
    'extras', jsonb_build_array(jsonb_build_object(
      'customization_id', (select id from public.customizations where name like 'Coleslaw%'),
      'customization_name', 'Coleslaw (Sample)', 'extra_price', 150))))
) as new_order_id;

-- Now act as THAT customer and read their orders through RLS.
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'customer' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select o.id, o.status, o.fulfilment, o.total, p.method, p.status as payment_status,
       (select count(*) from public.order_items oi where oi.order_id = o.id) as items,
       (select count(*) from public.order_item_customizations c
          join public.order_items oi on oi.id = c.order_item_id
         where oi.order_id = o.id) as extras
from public.orders o
join public.payments p on p.order_id = o.id;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: a DIFFERENT user can't see someone else's order (FR-05).
-- EXPECT: 1 row: orders_visible = 0. (Uses any profile that isn't the
--         customer from block 1, e.g. your manager account. Staff rules come
--         in Build step 4.)
-- WHY count(*)? A query that returns NO rows can leave the SQL Editor showing
-- an earlier result instead. count(*) always returns one row, so "0" is clear.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '22222222-2222-2222-2222-222222222222',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles
           where id <> (select id from public.profiles where role = 'customer' order by created_at limit 1)
           limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select count(*) as orders_visible from public.orders;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: a customer can NOT insert an order directly.
-- EXPECT: ERROR "permission denied for table orders". (That's the point: no
--         J$0 orders by skipping checkout.)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'customer' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.orders (customer_id, client_request_id, fulfilment, requested_time, items_total, total)
values (auth.uid(), gen_random_uuid(), 'PICKUP', now(), 0, 0);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: a customer can NOT call create_order() (only the server can).
-- EXPECT: ERROR "permission denied for function create_order".
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'customer' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select public.create_order(
  auth.uid(), gen_random_uuid(), 'PICKUP', null, now(), false, 0, 0, 'CASH',
  '[{"menu_item_id":1,"item_name":"x","size":null,"unit_price":0,"quantity":1,"note":"","line_total":0}]'::jsonb
);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: the same checkout twice gives the SAME Order ID (no duplicates).
-- EXPECT: 1 row: second_try = first_order_id, and order_count = 1.
--
-- WHY TWO STATEMENTS? A single SQL statement sees the database as it was when
-- that statement STARTED (its "snapshot"). If the first try and the count were
-- in the same SELECT, the count couldn't see the row the first try just added
-- and would wrongly show 0. So: statement 1 = first try; statement 2 = second
-- try + the checks (it now sees the row from statement 1).
-- -----------------------------------------------------------------------------
begin;

-- Statement 1: the first try (creates the order).
with args as (
  select (select id from public.profiles where role = 'customer' order by created_at limit 1) as customer,
         jsonb_build_array(jsonb_build_object(
           'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
           'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
           'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)) as items
)
select public.create_order(customer, '33333333-3333-3333-3333-333333333333', 'PICKUP', null,
                           now() + interval '5 minutes', true, 220, 0, 'LYNK', items) as first_try
from args;

-- Statement 2: the same checkout again, and the checks.
with args as (
  select (select id from public.profiles where role = 'customer' order by created_at limit 1) as customer,
         jsonb_build_array(jsonb_build_object(
           'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
           'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
           'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)) as items
)
select
  public.create_order(customer, '33333333-3333-3333-3333-333333333333', 'PICKUP', null,
                      now() + interval '5 minutes', true, 220, 0, 'LYNK', items) as second_try,
  (select id from public.orders
    where client_request_id = '33333333-3333-3333-3333-333333333333') as first_order_id,
  (select count(*) from public.orders
    where client_request_id = '33333333-3333-3333-3333-333333333333') as order_count
from args;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: numbers that don't add up are refused (safety net).
-- EXPECT: ERROR "Line totals (220) do not add up to items_total (1)."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  gen_random_uuid(), 'PICKUP', null, now(), false,
  1, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: a delivery order without a location is refused.
-- EXPECT: ERROR mentioning "orders_delivery_needs_location".
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  gen_random_uuid(), 'DELIVERY', null, now() + interval '30 minutes', false,
  220, 200, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
  'Test drop-off, Block A' /* Step 41 (0028): delivery orders need drop-off details */
);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 8 (run LAST): reset the Order ID counter back to 1001.
-- WHY? A rollback undoes the rows, but NOT the counter: Postgres never hands
-- out the same number twice, even from a cancelled transaction. Without this,
-- the first real order would be #1004 or so. Only safe while there are no
-- real orders, so it checks that first.
-- EXPECT: "Success. No rows returned".
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.orders) then
    raise exception 'There are real orders; not resetting the counter.';
  end if;
  alter table public.orders alter column id restart with 1001;
end;
$$;
