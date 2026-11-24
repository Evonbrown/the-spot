-- =============================================================================
-- supabase/tests/0009_order_status_checks.sql
--
-- WHAT: Manual checks for migration 0009_order_status_changes.sql (Step 26).
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Block 3 is SUPPOSED to fail. Every block ends with "rollback", so no test
--   data is left behind.
--
-- NEEDS: a 'customer' and a 'counter_staff' profile, and the menu.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: a change saves the new status AND a history row, together.
-- EXPECT: changed = true, then 1 row: status = IN_PROGRESS, history_rows = 2
--         (PENDING from create_order + IN_PROGRESS), last_changed_by_role =
--         counter_staff.
-- -----------------------------------------------------------------------------
begin;

-- A test order (as the database owner, standing in for our server).
select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '99999999-9999-4999-8999-999999999999',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '99999999-9999-4999-8999-999999999999'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select o.status,
       (select count(*) from public.order_status_history h where h.order_id = o.id) as history_rows,
       (select p.role from public.order_status_history h
          join public.profiles p on p.id = h.changed_by
         where h.order_id = o.id order by h.id desc limit 1) as last_changed_by_role
from public.orders o
where o.client_request_id = '99999999-9999-4999-8999-999999999999';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: "someone else just changed it": if the status is no longer what
--          staff saw, NOTHING changes.
-- EXPECT: changed = false, then 1 row: status = PENDING, history_rows = 1.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '99999999-9999-4999-8999-999999999998',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

-- Staff "saw" IN_PROGRESS, but the order is really PENDING.
select public.change_order_status(
  (select id from public.orders where client_request_id = '99999999-9999-4999-8999-999999999998'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select o.status,
       (select count(*) from public.order_status_history h where h.order_id = o.id) as history_rows
from public.orders o
where o.client_request_id = '99999999-9999-4999-8999-999999999998';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: logged-in users (even counter staff) can NOT run the function
--          themselves: only our server can.
-- EXPECT: an ERROR: "permission denied for function change_order_status".
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select public.change_order_status(1001, 'PENDING', 'COMPLETED', (select auth.uid()));

rollback;
