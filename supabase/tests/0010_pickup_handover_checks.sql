-- =============================================================================
-- supabase/tests/0010_pickup_handover_checks.sql
--
-- WHAT: Manual checks for migration 0010_pickup_handover.sql (Step 27).
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks 2-5 are SUPPOSED to fail. Every block ends with "rollback", so no
--   test data is left behind.
--
-- NEEDS: a 'customer' and a 'counter_staff' profile, and the menu.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: cash pickup handover: COMPLETED + history + PAID, all together.
--          (The first two steps use the old 4-input call: Step 26 still works.)
-- EXPECT: three "changed = true" results, then 1 row:
--         status = COMPLETED, payment_status = PAID, paid_at filled in,
--         paid_by_role = counter_staff, history_rows = 4.
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '10101010-1010-4010-8010-101010101010',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '10101010-1010-4010-8010-101010101010'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '10101010-1010-4010-8010-101010101010'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

-- The handover: completed AND cash received.
select public.change_order_status(
  (select id from public.orders where client_request_id = '10101010-1010-4010-8010-101010101010'),
  'READY_FOR_PICKUP', 'COMPLETED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  true
) as changed;

select o.status,
       pay.status as payment_status,
       pay.paid_at,
       (select p.role from public.profiles p where p.id = pay.paid_by) as paid_by_role,
       (select count(*) from public.order_status_history h where h.order_id = o.id) as history_rows
from public.orders o
join public.payments pay on pay.order_id = o.id
where o.client_request_id = '10101010-1010-4010-8010-101010101010';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: a LYNK payment can NOT be marked paid this way (Supervisor only,
--          Build step 7). The whole change is undone.
-- EXPECT: two "changed = true" results, then an ERROR:
--         "Order ... has no unpaid cash payment to mark as paid."
-- (Step 28: the order first walks to READY_FOR_PICKUP, because the status
--  trigger from migration 0011 now refuses skipping straight to COMPLETED.)
-- -----------------------------------------------------------------------------
begin;

select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '10101010-1010-4010-8010-101010101011',
  'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'LYNK',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb))
);

select public.change_order_status(
  (select id from public.orders where client_request_id = '10101010-1010-4010-8010-101010101011'),
  'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '10101010-1010-4010-8010-101010101011'),
  'IN_PROGRESS', 'READY_FOR_PICKUP',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1)
) as changed;

select public.change_order_status(
  (select id from public.orders where client_request_id = '10101010-1010-4010-8010-101010101011'),
  'READY_FOR_PICKUP', 'COMPLETED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  true
);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: cash can only be recorded together with COMPLETED.
-- EXPECT: an ERROR: "Cash can only be recorded when an order is completed."
-- -----------------------------------------------------------------------------
begin;

select public.change_order_status(1001, 'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  true);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: a payment can't be PAID without saying when and by whom.
-- EXPECT: an ERROR mentioning "payments_paid_needs_who_and_when".
-- -----------------------------------------------------------------------------
begin;

update public.payments
   set status = 'PAID'
 where id = (select id from public.payments order by id limit 1);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: customers and staff still can't change payments themselves, and
--          can't run the function (only our server can).
-- EXPECT: an ERROR: "permission denied for table payments".
--         (If you then change the last line to the commented-out
--          change_order_status call and run again: "permission denied for
--          function change_order_status".)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

update public.payments set status = 'PAID', paid_at = now(), paid_by = (select auth.uid());
-- select public.change_order_status(1001, 'READY_FOR_PICKUP', 'COMPLETED', (select auth.uid()), true);

rollback;
