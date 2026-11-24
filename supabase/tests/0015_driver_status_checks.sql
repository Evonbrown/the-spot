-- =============================================================================
-- supabase/tests/0015_driver_status_checks.sql
--
-- WHAT: Manual checks for migration 0015_driver_status.sql (Step 33):
--       the driver's Being delivered / Completed, the recorded times, cash
--       PAID at the driver handover, Lynk staying unpaid, the counter
--       backup, and who may run the function.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks 2, 3, 5, 7 and 9 are SUPPOSED to fail. Every block ends with
--   "rollback", so no test data is left behind.
--
-- NEEDS: a 'customer', a 'counter_staff', TWO 'delivery_personnel' profiles,
--   an active delivery location, and the menu.
--   driver 1 = the OLDEST delivery_personnel profile, driver 2 = the second.
--
-- EVERY BLOCK STARTS THE SAME WAY: a test DELIVERY order (cash, unless it
--   says Lynk), assigned to driver 1, moved by counter staff to
--   READY_FOR_PICKUP. Then the block does its own test.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: driver 1 marks it BEING_DELIVERED -> picked_up_at is recorded.
-- EXPECT: the setup results, then changed = true, then 1 row:
--         status = BEING_DELIVERED, picked_up_at filled, delivered_at EMPTY,
--         last_changed_by_role = delivery_personnel.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '15151515-1515-4515-8515-151515151501', 'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false, 220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)));
select set_config('test.order_id',
  (select id from public.orders where client_request_id = '15151515-1515-4515-8515-151515151501')::text, true);
select public.assign_delivery(current_setting('test.order_id')::bigint, null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));

-- The test:
select public.driver_change_delivery_status(current_setting('test.order_id')::bigint,
  'READY_FOR_PICKUP', 'BEING_DELIVERED',
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1)) as changed;

select o.status, d.picked_up_at, d.delivered_at,
       (select p.role from public.order_status_history h join public.profiles p on p.id = h.changed_by
         where h.order_id = o.id order by h.id desc limit 1) as last_changed_by_role
from public.orders o join public.deliveries d on d.order_id = o.id
where o.id = current_setting('test.order_id')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: driver 2 (NOT assigned) can't change it.
-- EXPECT: the setup results, then an ERROR:
--   "Order ...: this delivery is not assigned to you."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '15151515-1515-4515-8515-151515151502', 'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false, 220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)));
select set_config('test.order_id',
  (select id from public.orders where client_request_id = '15151515-1515-4515-8515-151515151502')::text, true);
select public.assign_delivery(current_setting('test.order_id')::bigint, null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));

-- The test (driver 2):
select public.driver_change_delivery_status(current_setting('test.order_id')::bigint,
  'READY_FOR_PICKUP', 'BEING_DELIVERED',
  (select id from public.profiles where role = 'delivery_personnel' order by created_at offset 1 limit 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: too early: Being delivered from IN_PROGRESS is a SKIP (Step 28
--          rules trigger still applies to drivers).
-- EXPECT: the setup results, then an ERROR:
--   "Order ...: can't skip steps. The next step after IN_PROGRESS is READY_FOR_PICKUP."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '15151515-1515-4515-8515-151515151503', 'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false, 220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)));
select set_config('test.order_id',
  (select id from public.orders where client_request_id = '15151515-1515-4515-8515-151515151503')::text, true);
select public.assign_delivery(current_setting('test.order_id')::bigint, null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));

-- The test (still IN_PROGRESS):
select public.driver_change_delivery_status(current_setting('test.order_id')::bigint,
  'IN_PROGRESS', 'BEING_DELIVERED',
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: CASH handover by the driver -> COMPLETED + delivered_at + PAID.
-- EXPECT: the setup results, two "changed = true", then 1 row:
--         status = COMPLETED, picked_up_at and delivered_at filled,
--         payment_status = PAID, paid_at filled, paid_by_role =
--         delivery_personnel, history_rows = 5.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '15151515-1515-4515-8515-151515151504', 'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false, 220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)));
select set_config('test.order_id',
  (select id from public.orders where client_request_id = '15151515-1515-4515-8515-151515151504')::text, true);
select public.assign_delivery(current_setting('test.order_id')::bigint, null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));

-- The test:
select public.driver_change_delivery_status(current_setting('test.order_id')::bigint,
  'READY_FOR_PICKUP', 'BEING_DELIVERED',
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1)) as changed;
select public.driver_change_delivery_status(current_setting('test.order_id')::bigint,
  'BEING_DELIVERED', 'COMPLETED',
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  true) as changed;

select o.status, d.picked_up_at, d.delivered_at,
       pay.status as payment_status, pay.paid_at,
       (select p.role from public.profiles p where p.id = pay.paid_by) as paid_by_role,
       (select count(*) from public.order_status_history h where h.order_id = o.id) as history_rows
from public.orders o
join public.deliveries d on d.order_id = o.id
join public.payments pay on pay.order_id = o.id
where o.id = current_setting('test.order_id')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: CASH not confirmed -> refused, nothing changes (FR-06).
-- EXPECT: the setup results, changed = true (Being delivered), then an ERROR:
--   "Order ...: confirm the cash was received before completing it."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '15151515-1515-4515-8515-151515151505', 'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false, 220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)));
select set_config('test.order_id',
  (select id from public.orders where client_request_id = '15151515-1515-4515-8515-151515151505')::text, true);
select public.assign_delivery(current_setting('test.order_id')::bigint, null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));

-- The test:
select public.driver_change_delivery_status(current_setting('test.order_id')::bigint,
  'READY_FOR_PICKUP', 'BEING_DELIVERED',
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1)) as changed;
select public.driver_change_delivery_status(current_setting('test.order_id')::bigint,
  'BEING_DELIVERED', 'COMPLETED',
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  false);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: LYNK handover -> COMPLETED, payment stays UNPAID (the Supervisor
--          verifies Lynk, Build step 7).
-- EXPECT: the setup results, two "changed = true", then 1 row:
--         status = COMPLETED, delivered_at filled, payment_status = UNPAID.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '15151515-1515-4515-8515-151515151506', 'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false, 220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'LYNK',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)));
select set_config('test.order_id',
  (select id from public.orders where client_request_id = '15151515-1515-4515-8515-151515151506')::text, true);
select public.assign_delivery(current_setting('test.order_id')::bigint, null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));

-- The test (no cash for Lynk):
select public.driver_change_delivery_status(current_setting('test.order_id')::bigint,
  'READY_FOR_PICKUP', 'BEING_DELIVERED',
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1)) as changed;
select public.driver_change_delivery_status(current_setting('test.order_id')::bigint,
  'BEING_DELIVERED', 'COMPLETED',
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  false) as changed;

select o.status, d.delivered_at, pay.status as payment_status
from public.orders o
join public.deliveries d on d.order_id = o.id
join public.payments pay on pay.order_id = o.id
where o.id = current_setting('test.order_id')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: no skipping for drivers: COMPLETED straight from READY_FOR_PICKUP.
-- EXPECT: the setup results, then an ERROR:
--   "Order ...: can't skip steps. The next step after READY_FOR_PICKUP is BEING_DELIVERED."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '15151515-1515-4515-8515-151515151507', 'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false, 220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)));
select set_config('test.order_id',
  (select id from public.orders where client_request_id = '15151515-1515-4515-8515-151515151507')::text, true);
select public.assign_delivery(current_setting('test.order_id')::bigint, null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));

-- The test:
select public.driver_change_delivery_status(current_setting('test.order_id')::bigint,
  'READY_FOR_PICKUP', 'COMPLETED',
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  true);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 8: COUNTER BACKUP (decision B): the driver left, then counter staff
--          complete it with the cash (e.g. the driver's phone died).
-- EXPECT: the setup results, two "changed = true", then 1 row:
--         status = COMPLETED, delivered_at filled, payment_status = PAID,
--         paid_by_role = counter_staff.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '15151515-1515-4515-8515-151515151508', 'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false, 220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)));
select set_config('test.order_id',
  (select id from public.orders where client_request_id = '15151515-1515-4515-8515-151515151508')::text, true);
select public.assign_delivery(current_setting('test.order_id')::bigint, null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
select public.change_order_status(current_setting('test.order_id')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));

-- The driver leaves ...
select public.driver_change_delivery_status(current_setting('test.order_id')::bigint,
  'READY_FOR_PICKUP', 'BEING_DELIVERED',
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1)) as changed;
-- ... and the counter completes it as the backup (same function as Step 27).
select public.change_order_status(current_setting('test.order_id')::bigint, 'BEING_DELIVERED', 'COMPLETED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  true) as changed;

select o.status, d.delivered_at, pay.status as payment_status,
       (select p.role from public.profiles p where p.id = pay.paid_by) as paid_by_role
from public.orders o
join public.deliveries d on d.order_id = o.id
join public.payments pay on pay.order_id = o.id
where o.id = current_setting('test.order_id')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 9: logged-in users (even drivers) can NOT run the function: only our
--          server can.
-- EXPECT: an ERROR: "permission denied for function driver_change_delivery_status".
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select public.driver_change_delivery_status(1001, 'BEING_DELIVERED', 'COMPLETED', (select auth.uid()), true);

rollback;
