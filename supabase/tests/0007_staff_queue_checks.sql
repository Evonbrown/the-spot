-- =============================================================================
-- supabase/tests/0007_staff_queue_checks.sql
--
-- WHAT: Manual checks for migration 0007_staff_order_access.sql (Step 24).
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run. One block at a time:
--   block 4 is SUPPOSED to fail. Every block ends with "rollback", so no test
--   data is left behind.
--
-- NEEDS: profiles with role 'customer' and 'counter_staff'; for block 3, at
--   least one of 'manager', 'delivery_personnel' or 'supervisor'.
--   The menu (real_menu_items.sql) for the test order.
--
-- "Acting as a user": set_config('request.jwt.claims', ...) pretends a login
--   token for that person, and "set local role authenticated" switches to the
--   logged-in role, so RLS applies exactly as in the app (same as 0006 tests).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: counter staff can read EVERY order and its items (FR-03).
-- EXPECT: 1 row where staff_sees_orders = all_orders and
--         staff_sees_items = all_items (both at least 1).
-- -----------------------------------------------------------------------------
begin;

-- A test order (as the database owner, standing in for our server).
select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '77777777-7777-4777-8777-777777777777',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

-- Remember the REAL totals (counted as the owner, who skips RLS).
select set_config('test.all_orders', (select count(*) from public.orders)::text, true),
       set_config('test.all_items', (select count(*) from public.order_items)::text, true);

-- Now act as counter staff.
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select (select count(*) from public.orders)      as staff_sees_orders,
       current_setting('test.all_orders')        as all_orders,
       (select count(*) from public.order_items) as staff_sees_items,
       current_setting('test.all_items')         as all_items;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: a customer STILL sees only their own orders (FR-05 unchanged).
-- EXPECT: 1 row: other_peoples_orders = 0.
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'customer' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select count(*) as other_peoples_orders
from public.orders
where customer_id <> (select auth.uid());

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: other staff roles see NO orders yet (strict role access).
-- EXPECT: 1 row: the role you tested (manager / delivery_personnel /
--         supervisor) and orders_visible = 0.
-- (Unless that person has placed orders as a customer, which they can't:
--  only customers can check out.)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles
           where role in ('manager', 'delivery_personnel', 'supervisor')
           order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select public.current_user_role() as tested_role,
       (select count(*) from public.orders) as orders_visible;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: counter staff can NOT change an order directly (read-only).
-- EXPECT: an ERROR: "permission denied for table orders".
-- (Changing a status will only be possible through the server rule, Step 28.)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

update public.orders set status = 'COMPLETED';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: Realtime is on for orders (and only orders, of our order tables).
-- EXPECT: 1 row: tablename = orders.
-- -----------------------------------------------------------------------------
begin;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('orders', 'order_items', 'order_item_customizations', 'payments');

rollback;
