-- =============================================================================
-- supabase/tests/0011_status_rules_checks.sql
--
-- WHAT: Manual checks for migration 0011_status_rules.sql (Step 28):
--       the 20-minute Abandoned rule (19 min = refused, 20 min = allowed),
--       forward-only, finished orders locked, and staff reading the history.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks 1 and 3-7 are SUPPOSED to fail with the error shown. Every block
--   ends with "rollback", so no test data is left behind.
--
-- HOW WE "WAIT 20 MINUTES" WITHOUT WAITING: we move the READY_FOR_PICKUP
--   history row back in time ("now() - 19 minutes"). Inside ONE transaction
--   now() always returns the SAME time (when the transaction started), so
--   "now() - 20 minutes" is EXACTLY 20 minutes ago: no seconds slip by while
--   the block runs. That makes the boundary test exact.
--
-- NEEDS: a 'customer' and a 'counter_staff' profile, and the menu.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: ready for 19 minutes -> Abandoned is REFUSED.
-- EXPECT: two "changed = true" results, then an ERROR:
--   "Order ... can only be marked ABANDONED 20 minutes after it was ready ..."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '11111111-1111-4111-8111-111111111101',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111101'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111101'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

-- Pretend it became ready 19 minutes ago.
update public.order_status_history
   set changed_at = now() - interval '19 minutes'
 where status = 'READY_FOR_PICKUP'
   and order_id = (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111101');

select public.change_order_status(
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111101'),
  'READY_FOR_PICKUP', 'ABANDONED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: ready for EXACTLY 20 minutes -> Abandoned is ALLOWED.
-- EXPECT: three "changed = true" results, then 1 row:
--         status = ABANDONED, history_rows = 4, last_history = ABANDONED,
--         payment_status = UNPAID (no cash was received: FR-06 won't count it).
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '11111111-1111-4111-8111-111111111102',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111102'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111102'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

-- Pretend it became ready exactly 20 minutes ago.
update public.order_status_history
   set changed_at = now() - interval '20 minutes'
 where status = 'READY_FOR_PICKUP'
   and order_id = (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111102');

select public.change_order_status(
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111102'),
  'READY_FOR_PICKUP', 'ABANDONED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select o.status,
       (select count(*) from public.order_status_history h where h.order_id = o.id) as history_rows,
       (select h.status from public.order_status_history h
         where h.order_id = o.id order by h.id desc limit 1) as last_history,
       (select pay.status from public.payments pay where pay.order_id = o.id) as payment_status
from public.orders o
where o.client_request_id = '11111111-1111-4111-8111-111111111102';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: a DELIVERY order can't be marked Abandoned (even after 20+ min).
-- EXPECT: two "changed = true" results, then an ERROR:
--   "Order ...: only pickup orders can be marked ABANDONED."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '11111111-1111-4111-8111-111111111103',
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
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111103'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111103'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

update public.order_status_history
   set changed_at = now() - interval '30 minutes'
 where status = 'READY_FOR_PICKUP'
   and order_id = (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111103');

select public.change_order_status(
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111103'),
  'READY_FOR_PICKUP', 'ABANDONED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: Abandoned only from READY_FOR_PICKUP (here it is still PENDING).
-- EXPECT: an ERROR:
--   "Order ...: only a READY_FOR_PICKUP order can be marked ABANDONED (it is PENDING)."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '11111111-1111-4111-8111-111111111104',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111104'),
  'PENDING', 'ABANDONED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: SKIPPING a step is refused (PENDING -> READY_FOR_PICKUP).
--          This one uses a plain UPDATE (as if typed into the SQL Editor), to
--          show the trigger catches EVERY way of changing a status, not just
--          change_order_status().
-- EXPECT: an ERROR:
--   "Order ...: can't skip steps. The next step after PENDING is IN_PROGRESS."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '11111111-1111-4111-8111-111111111105',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

update public.orders
   set status = 'READY_FOR_PICKUP'
 where client_request_id = '11111111-1111-4111-8111-111111111105';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: going BACKWARDS is refused (IN_PROGRESS -> PENDING).
-- EXPECT: one "changed = true", then an ERROR:
--   "Order ... can't go back from IN_PROGRESS to PENDING. Statuses only move forward."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '11111111-1111-4111-8111-111111111106',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111106'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

update public.orders
   set status = 'PENDING'
 where client_request_id = '11111111-1111-4111-8111-111111111106';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: a FINISHED order is locked (CANCELLED -> IN_PROGRESS).
-- EXPECT: one "changed = true", then an ERROR:
--   "Order ... is already CANCELLED. Finished orders can't change."
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '11111111-1111-4111-8111-111111111107',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '11111111-1111-4111-8111-111111111107'),
  'PENDING', 'CANCELLED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

update public.orders
   set status = 'IN_PROGRESS'
 where client_request_id = '11111111-1111-4111-8111-111111111107';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 8: counter staff can READ every order's history; a customer still
--          sees only the history of their OWN orders.
-- EXPECT: 1 row: staff_sees = (the number of history rows in the database,
--         more than 0), customer_sees_others = 0.
-- -----------------------------------------------------------------------------
begin;

-- As counter staff:
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;
-- Remember the count in a temporary setting (gone after rollback).
select set_config('test.staff_sees', (select count(*) from public.order_status_history)::text, true);

-- As a customer: count history rows of orders that are NOT theirs.
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'customer' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select current_setting('test.staff_sees') as staff_sees,
       (select count(*) from public.order_status_history h
         where h.order_id not in (select o.id from public.orders o
                                   where o.customer_id = (select auth.uid()))) as customer_sees_others;

rollback;
