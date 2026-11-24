-- =============================================================================
-- supabase/tests/0012_notifications_checks.sql
--
-- WHAT: Manual checks for migration 0012_notifications.sql (Step 30):
--       one notification per notifying status, none for In progress, no
--       duplicates, customers only see their own and can't write any.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks 5 and 7 are SUPPOSED to fail. Every block ends with "rollback", so
--   no test data (and no notification) is left behind.
--
-- NEEDS: TWO 'customer' profiles (block 6), a 'counter_staff' profile and
--   the menu.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: READY_FOR_PICKUP (pickup order) -> exactly ONE notification.
-- EXPECT: two "changed = true" results, then 1 row:
--         notifications = 1, status = READY_FOR_PICKUP, channel = SMS,
--         sent_to = the customer's phone, message "The Spot: Order #… is
--         ready for pickup. Show your Order ID at the counter.", sent_at filled.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '12121212-1212-4212-8212-121212121201',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121201'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121201'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select (select count(*) from public.notifications n where n.order_id = o.id) as notifications,
       n.status, n.channel, n.sent_to, n.message, n.sent_at
from public.orders o
join public.notifications n on n.order_id = o.id
where o.client_request_id = '12121212-1212-4212-8212-121212121201';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: CANCELLED -> exactly ONE notification.
-- EXPECT: one "changed = true", then 1 row: notifications = 1,
--         status = CANCELLED, message "The Spot: Order #… was cancelled. …".
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '12121212-1212-4212-8212-121212121202',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121202'),
  'PENDING', 'CANCELLED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select (select count(*) from public.notifications n where n.order_id = o.id) as notifications,
       n.status, n.channel, n.message
from public.orders o
join public.notifications n on n.order_id = o.id
where o.client_request_id = '12121212-1212-4212-8212-121212121202';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: ABANDONED -> one more notification (the order also got one at
--          READY_FOR_PICKUP). Uses the Step 28 trick: pretend it became
--          ready 20 minutes ago.
-- EXPECT: three "changed = true" results, then 2 rows, newest first:
--         ABANDONED ("…was not collected, so it was marked abandoned…"),
--         then READY_FOR_PICKUP.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '12121212-1212-4212-8212-121212121203',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121203'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121203'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

update public.order_status_history
   set changed_at = now() - interval '20 minutes'
 where status = 'READY_FOR_PICKUP'
   and order_id = (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121203');

select public.change_order_status(
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121203'),
  'READY_FOR_PICKUP', 'ABANDONED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select n.status, n.message
from public.notifications n
where n.order_id = (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121203')
order by n.id desc;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: IN_PROGRESS -> NO notification (and the delivery wording, below).
-- EXPECT: 1 row: after_in_progress = 0, after_ready = 1,
--         ready_message "The Spot: Order #… is ready and will leave with a
--         driver soon." (a DELIVERY order).
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '12121212-1212-4212-8212-121212121204',
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
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121204'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

-- Remember the count after In progress (a temporary setting, gone after rollback).
select set_config('test.after_in_progress', (
  select count(*) from public.notifications
   where order_id = (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121204')
)::text, true);

select public.change_order_status(
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121204'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

select current_setting('test.after_in_progress') as after_in_progress,
       (select count(*) from public.notifications n where n.order_id = o.id) as after_ready,
       (select n.message from public.notifications n where n.order_id = o.id) as ready_message
from public.orders o
where o.client_request_id = '12121212-1212-4212-8212-121212121204';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: NO DUPLICATES: a second READY_FOR_PICKUP notification for the same
--          order is refused by the unique rule.
-- EXPECT: an ERROR mentioning "notifications_one_per_order_status".
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '12121212-1212-4212-8212-121212121205',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121205'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121205'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

-- By hand, a second one for the same order + status:
insert into public.notifications (order_id, customer_id, status, channel, sent_to, message)
select o.id, o.customer_id, 'READY_FOR_PICKUP', 'SMS', 'test', 'duplicate'
from public.orders o
where o.client_request_id = '12121212-1212-4212-8212-121212121205';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: a customer can NOT see another customer's notifications.
--          The order belongs to the FIRST customer; we then look as the SECOND.
-- EXPECT: 1 row: owner_sees = 1, other_customer_sees = 0.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '12121212-1212-4212-8212-121212121206',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121206'),
  'PENDING', 'CANCELLED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
);

-- Remember the order number (RLS will hide the order from the 2nd customer).
select set_config('test.order_id',
  (select id from public.orders where client_request_id = '12121212-1212-4212-8212-121212121206')::text, true);

-- As the FIRST customer (the owner):
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'customer' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('test.owner_sees', (
  select count(*) from public.notifications where order_id = current_setting('test.order_id')::bigint
)::text, true);

-- As the SECOND customer:
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'customer' order by created_at offset 1 limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select current_setting('test.owner_sees') as owner_sees,
       (select count(*) from public.notifications
         where order_id = current_setting('test.order_id')::bigint) as other_customer_sees;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: customers can NOT write notifications (only the trigger can).
-- EXPECT: an ERROR: "permission denied for table notifications".
--         (Change the last line to the commented-out UPDATE and run again:
--          the same error.)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'customer' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.notifications (order_id, customer_id, status, channel, sent_to, message)
values (1001, (select auth.uid()), 'CANCELLED', 'SMS', 'fake', 'fake message');
-- update public.notifications set message = 'changed';

rollback;
