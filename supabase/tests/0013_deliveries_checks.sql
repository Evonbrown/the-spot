-- =============================================================================
-- supabase/tests/0013_deliveries_checks.sql
--
-- WHAT: Manual checks for migration 0013_deliveries.sql (Step 31):
--       assigning and changing a driver, the rules (delivery only, real
--       drivers only, only before it leaves), "Being delivered needs a
--       driver", the active-delivery count, the time rules, and who can
--       read / write.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks 3, 4, 5, 6, 7, 10 and 12 are SUPPOSED to fail. Every block ends
--   with "rollback", so no test data is left behind.
--
-- NEEDS: a 'customer', a 'counter_staff' and TWO 'delivery_personnel'
--   profiles, at least one active delivery location, and the menu.
--
-- WHO IS WHO below (written out in full each time):
--   driver 1 = the OLDEST delivery_personnel profile
--   driver 2 = the SECOND oldest ("offset 1")
--   staff    = the oldest counter_staff profile
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: assign a driver to a delivery order.
-- EXPECT: assigned = true, then 1 row: driver_is_driver_1 = true,
--         drop_off_location = the location's name, assigned_at filled,
--         assigned_by_role = counter_staff, picked_up_at and delivered_at EMPTY.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '13131313-1313-4313-8313-131313131301',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
  'Test drop-off, Block A' /* Step 41 (0028): delivery orders need drop-off details */
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131301'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as assigned;

select d.driver_id = (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1) as driver_is_driver_1,
       d.drop_off_location, d.assigned_at,
       (select p.role from public.profiles p where p.id = d.assigned_by) as assigned_by_role,
       d.picked_up_at, d.delivered_at
from public.deliveries d
where d.order_id = (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131301');

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: change the driver BEFORE it leaves -> still ONE row, new driver.
-- EXPECT: two "assigned = true", then 1 row: rows = 1, driver_is_driver_2 = true.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '13131313-1313-4313-8313-131313131302',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
  'Test drop-off, Block A' /* Step 41 (0028): delivery orders need drop-off details */
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131302'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as assigned;

-- Change: staff SAW driver 1, now choose driver 2.
select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131302'),
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'delivery_personnel' order by created_at offset 1 limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as assigned;

select count(*) as rows,
       bool_and(d.driver_id = (select id from public.profiles where role = 'delivery_personnel' order by created_at offset 1 limit 1)) as driver_is_driver_2
from public.deliveries d
where d.order_id = (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131302');

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: a PICKUP order can't have a driver.
-- EXPECT: an ERROR: "Order ...: only delivery orders can have a driver."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '13131313-1313-4313-8313-131313131303',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131303'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: someone who ISN'T delivery staff (here: a customer) can't be the
--          driver.
-- EXPECT: an ERROR: "That person is not a delivery staff member."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '13131313-1313-4313-8313-131313131304',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
  'Test drop-off, Block A' /* Step 41 (0028): delivery orders need drop-off details */
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131304'),
  null,
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: WITH a driver, Being delivered works; AFTER that, the driver is
--          locked.
-- EXPECT: assigned = true, then three "changed = true" (the last one is
--         BEING_DELIVERED: allowed because there IS a driver), then an ERROR:
--         "Order ...: the driver can only be set before the order leaves
--          (it is BEING_DELIVERED)."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '13131313-1313-4313-8313-131313131305',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
  'Test drop-off, Block A' /* Step 41 (0028): delivery orders need drop-off details */
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131305'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as assigned;

select public.change_order_status(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131305'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131305'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131305'),
  'READY_FOR_PICKUP', 'BEING_DELIVERED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131305'),
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'delivery_personnel' order by created_at offset 1 limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: a FINISHED (cancelled) order can't get a driver.
-- EXPECT: one "changed = true", then an ERROR:
--   "Order ...: the driver can only be set before the order leaves (it is CANCELLED)."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '13131313-1313-4313-8313-131313131306',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
  'Test drop-off, Block A' /* Step 41 (0028): delivery orders need drop-off details */
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131306'),
  'PENDING', 'CANCELLED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131306'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: Being delivered WITHOUT a driver is refused (the new trigger).
-- EXPECT: two "changed = true", then an ERROR:
--   "Order ...: assign a driver before it goes out for delivery."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '13131313-1313-4313-8313-131313131307',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
  'Test drop-off, Block A' /* Step 41 (0028): delivery orders need drop-off details */
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131307'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131307'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131307'),
  'READY_FOR_PICKUP', 'BEING_DELIVERED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 8: "someone else just changed the driver": staff SAW no driver, but
--          there is one now -> NOTHING changes, false.
-- EXPECT: assigned = true, then assigned = false, then 1 row:
--         still_driver_1 = true.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '13131313-1313-4313-8313-131313131308',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
  'Test drop-off, Block A' /* Step 41 (0028): delivery orders need drop-off details */
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131308'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as assigned;

-- A second staff member, whose page still showed "No driver yet":
select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131308'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at offset 1 limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as assigned;

select d.driver_id = (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1) as still_driver_1
from public.deliveries d
where d.order_id = (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131308');

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 9: the ACTIVE count. Driver 1 gets 3 test deliveries; one is then
--          cancelled (finished), so only 2 of them are still active.
--          (The app counts the same way: orders that aren't finished.)
-- EXPECT: 3 rows from create_order, 3 "true" from assign_delivery,
--         changed = true, then 1 row: test_all = 3, test_active = 2.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  ('13131313-1313-4313-8313-13131313131' || n)::uuid,
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
  'Test drop-off, Block A' /* Step 41 (0028): delivery orders need drop-off details */
)
from generate_series(1, 3) as n;

select public.assign_delivery(
  o.id, null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
)
from public.orders o
where o.client_request_id::text like '13131313-1313-4313-8313-13131313131_';

select public.change_order_status(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131311'),
  'PENDING', 'CANCELLED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select count(*) as test_all,
       count(*) filter (where o.status in ('PENDING', 'IN_PROGRESS', 'READY_FOR_PICKUP', 'BEING_DELIVERED')) as test_active
from public.deliveries d
join public.orders o on o.id = d.order_id
where o.client_request_id::text like '13131313-1313-4313-8313-13131313131_';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 10: time rule: "delivered" can't be saved without "picked up"
--           (Step 33 will fill these in).
-- EXPECT: assigned = true, then an ERROR mentioning
--         "deliveries_delivered_needs_picked_up".
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '13131313-1313-4313-8313-131313131320',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
  'Test drop-off, Block A' /* Step 41 (0028): delivery orders need drop-off details */
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131320'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as assigned;

update public.deliveries
   set delivered_at = now()
 where order_id = (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131320');

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 11: who can READ: counter staff see deliveries and driver profiles;
--           a customer sees no deliveries.
-- EXPECT: 1 row: staff_sees_deliveries = 1 or more, staff_sees_drivers = 2
--         or more, customer_sees_deliveries = 0.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '13131313-1313-4313-8313-131313131321',
  'DELIVERY',
  (select id from public.delivery_locations where is_active order by sort_order limit 1),
  now() + interval '30 minutes', false,
  220,
  (select delivery_fee from public.delivery_locations where is_active order by sort_order limit 1),
  'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
  'Test drop-off, Block A' /* Step 41 (0028): delivery orders need drop-off details */
);

select public.assign_delivery(
  (select id from public.orders where client_request_id = '13131313-1313-4313-8313-131313131321'),
  null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

-- As counter staff (counts remembered in temporary settings):
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('test.staff_deliveries', (select count(*) from public.deliveries)::text, true);
select set_config('test.staff_drivers',
  (select count(*) from public.profiles where role = 'delivery_personnel')::text, true);

-- As the customer who placed the order:
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'customer' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select current_setting('test.staff_deliveries') as staff_sees_deliveries,
       current_setting('test.staff_drivers') as staff_sees_drivers,
       (select count(*) from public.deliveries) as customer_sees_deliveries;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 12: nobody can WRITE deliveries with the public key, or run the
--           function themselves (only our server can).
-- EXPECT: an ERROR: "permission denied for table deliveries".
--         (Change the last line to the commented-out call and run again:
--          "permission denied for function assign_delivery".)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

update public.deliveries set driver_id = (select auth.uid());
-- select public.assign_delivery(1001, null, (select auth.uid()), (select auth.uid()));

rollback;
