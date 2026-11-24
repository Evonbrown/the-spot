-- =============================================================================
-- supabase/tests/0014_driver_access_checks.sql
--
-- WHAT: Manual checks for migration 0014_driver_access.sql (Step 32):
--       a driver reads ONLY their own deliveries (and those orders' items,
--       payments and customers), nothing else, and can't write anything.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Block 6 is SUPPOSED to fail. Every block ends with "rollback", so no
--   test data is left behind.
--
-- NEEDS: a 'customer', a 'counter_staff', TWO 'delivery_personnel' profiles,
--   an active delivery location, and the menu.
--   driver 1 = the OLDEST delivery_personnel profile, driver 2 = the second.
--
-- HOW EACH BLOCK WORKS: as the database owner we create a test order and
--   assign it; then we "become" a driver (set local role authenticated + the
--   driver's id in request.jwt.claims) and count what RLS lets them see.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: driver 1 sees THEIR delivery and everything on it.
-- EXPECT: 1 row: deliveries = 1, orders = 1, items = 1, payments = 1,
--         customers = 1 (all for the test order).
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '14141414-1414-4414-8414-141414141401',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '14141414-1414-4414-8414-141414141401'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

-- Remember the order number (as the owner, before becoming the driver).
select set_config('test.order_id',
  (select id from public.orders where client_request_id = '14141414-1414-4414-8414-141414141401')::text, true);

-- Become driver 1:
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select
  (select count(*) from public.deliveries where order_id = current_setting('test.order_id')::bigint) as deliveries,
  (select count(*) from public.orders where id = current_setting('test.order_id')::bigint) as orders,
  (select count(*) from public.order_items where order_id = current_setting('test.order_id')::bigint) as items,
  (select count(*) from public.payments where order_id = current_setting('test.order_id')::bigint) as payments,
  (select count(*) from public.profiles p
     where p.id = (select o.customer_id from public.orders o
                    where o.id = current_setting('test.order_id')::bigint)) as customers;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: driver 2 sees NOTHING of driver 1's delivery.
-- EXPECT: 1 row: deliveries = 0, orders = 0, items = 0, payments = 0.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '14141414-1414-4414-8414-141414141402',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '14141414-1414-4414-8414-141414141402'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

select set_config('test.order_id',
  (select id from public.orders where client_request_id = '14141414-1414-4414-8414-141414141402')::text, true);

-- Become driver 2:
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'delivery_personnel' order by created_at offset 1 limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select
  (select count(*) from public.deliveries where order_id = current_setting('test.order_id')::bigint) as deliveries,
  (select count(*) from public.orders where id = current_setting('test.order_id')::bigint) as orders,
  (select count(*) from public.order_items where order_id = current_setting('test.order_id')::bigint) as items,
  (select count(*) from public.payments where order_id = current_setting('test.order_id')::bigint) as payments;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: a driver can't see orders that aren't assigned to them: an
--          UNASSIGNED delivery order, and a PICKUP order.
-- EXPECT: 1 row: unassigned_delivery = 0, pickup = 0.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '14141414-1414-4414-8414-141414141403',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '14141414-1414-4414-8414-141414141404',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select set_config('test.delivery_id',
  (select id from public.orders where client_request_id = '14141414-1414-4414-8414-141414141403')::text, true);
select set_config('test.pickup_id',
  (select id from public.orders where client_request_id = '14141414-1414-4414-8414-141414141404')::text, true);

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select
  (select count(*) from public.orders where id = current_setting('test.delivery_id')::bigint) as unassigned_delivery,
  (select count(*) from public.orders where id = current_setting('test.pickup_id')::bigint) as pickup;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: changing the driver MOVES the access: driver 1 -> driver 2.
-- EXPECT: 1 row: driver_1_sees = 0, driver_2_sees = 1.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '14141414-1414-4414-8414-141414141405',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '14141414-1414-4414-8414-141414141405'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '14141414-1414-4414-8414-141414141405'),
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'delivery_personnel' order by created_at offset 1 limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

select set_config('test.order_id',
  (select id from public.orders where client_request_id = '14141414-1414-4414-8414-141414141405')::text, true);

-- As driver 1 (remember the count):
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('test.driver_1_sees',
  (select count(*) from public.orders where id = current_setting('test.order_id')::bigint)::text, true);

-- As driver 2:
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'delivery_personnel' order by created_at offset 1 limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select current_setting('test.driver_1_sees') as driver_1_sees,
       (select count(*) from public.orders where id = current_setting('test.order_id')::bigint) as driver_2_sees;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: a driver reads no OTHER profiles: no staff, no customers who
--          aren't on their deliveries. (Here driver 1 has no deliveries in
--          this block, so they should only see their OWN profile.)
-- EXPECT: 1 row: profiles_seen = 1 (themselves), staff_seen = 0.
--         (If driver 1 has REAL unfinished or finished deliveries in your
--          database, profiles_seen = 1 + the number of those customers.)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select (select count(*) from public.profiles) as profiles_seen,
       (select count(*) from public.profiles
         where role in ('counter_staff', 'manager', 'supervisor')) as staff_seen;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: drivers can NOT write (read-only until Step 33, through the server).
-- EXPECT: an ERROR: "permission denied for table deliveries".
--         (Change the last line to one of the commented-out ones and run
--          again: "permission denied for table orders" / "... payments".)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

update public.deliveries set picked_up_at = now();
-- update public.orders set status = 'COMPLETED';
-- update public.payments set status = 'PAID', paid_at = now(), paid_by = (select auth.uid());

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: nothing changed for the others: counter staff still see every
--          order; a customer still sees only their own.
-- EXPECT: 1 row: staff_sees_all = true, customer_sees_only_own = true.
-- -----------------------------------------------------------------------------
begin;

select set_config('test.all_orders', (select count(*) from public.orders)::text, true);
select set_config('test.customer_id',
  (select id from public.profiles where role = 'customer' order by created_at limit 1)::text, true);
select set_config('test.customer_orders',
  (select count(*) from public.orders where customer_id = current_setting('test.customer_id')::uuid)::text, true);

-- As counter staff:
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('test.staff_sees', (select count(*) from public.orders)::text, true);

-- As the customer:
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('test.customer_id'), 'role', 'authenticated')::text, true);
set local role authenticated;

select current_setting('test.staff_sees') = current_setting('test.all_orders') as staff_sees_all,
       (select count(*) from public.orders)::text = current_setting('test.customer_orders') as customer_sees_only_own;

rollback;
