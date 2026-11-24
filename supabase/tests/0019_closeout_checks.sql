-- =============================================================================
-- supabase/tests/0019_closeout_checks.sql
--
-- WHAT: Manual checks for migration 0019_daily_closeout.sql (Step 36):
--       counting the cash, the difference limit, open orders, approving
--       (and locking), the lock itself, "figures changed", the override,
--       reopening, and who may see / do what.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks marked "SHOULD FAIL" are supposed to give the error shown. Every
--   block ends with "rollback", so nothing is left behind (not even a
--   closeout or a lock).
--
-- NEEDS: a 'customer', a 'counter_staff' and a 'manager' profile, and the
--   menu. The default limit (J$500) from the migration.
--
-- THE TEST DAY: 15 January 2020 (a day with no real orders).
--
-- EVERY BLOCK THAT NEEDS ORDERS starts with the same "SETUP" (helpers + the
-- orders it needs). The orders used:
--   A: CASH pickup J$1,000, completed, PAID
--   B: CASH pickup J$1,700, completed, PAID      -> with A: expected cash 2,700
--   C: CASH pickup J$500,   still OPEN (In progress)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: SHOULD FAIL. Counter staff can't close out while an order is open
--          (TODAY: counter staff can only do today).
-- EXPECT: an ERROR: "N order(s) from this day are still open. Finish or
--         cancel them before closing out." (N = 1, or more if real orders are
--         open today.)
-- -----------------------------------------------------------------------------
begin;

-- One OPEN test order TODAY.
select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '19191919-1919-4919-8919-191919191901', 'PICKUP', null, now() + interval '15 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Test item', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)));

select public.submit_closeout_count(public.jamaica_day(now()), 0, '',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: count WITHIN the limit (2650 counted, 2700 expected: -50, limit
--          500): no explanation needed.
-- EXPECT: 1 row: expected_cash 2700, counted_cash 2650, cash_difference -50,
--         status SUBMITTED, is_locked false, events 1.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP (copied in every block that needs orders) =====
create function pg_temp.test_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.step(p_id bigint, p_from public.order_status, p_to public.order_status, p_cash boolean default false)
returns boolean language sql as $$
  select public.change_order_status(p_id, p_from, p_to,
    (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), p_cash)
$$;
create function pg_temp.complete_paid(p_id bigint)
returns boolean language sql as $$
  select pg_temp.step(p_id, 'PENDING', 'IN_PROGRESS');
  select pg_temp.step(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP');
  select pg_temp.step(p_id, 'READY_FOR_PICKUP', 'COMPLETED', true);
$$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
-- Orders A and B (completed + PAID), moved to the test day.
select set_config('t.a', pg_temp.test_order('19191919-1919-4919-8919-19191919190a', 1000)::text, true);
select set_config('t.b', pg_temp.test_order('19191919-1919-4919-8919-19191919190b', 1700)::text, true);
select pg_temp.complete_paid(current_setting('t.a')::bigint);
select pg_temp.complete_paid(current_setting('t.b')::bigint);
update public.orders set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where client_request_id::text like '19191919-1919-4919-8919-1919191919%';
-- ===== SETUP END =====

select public.submit_closeout_count('2020-01-15', 2650, '', pg_temp.manager()) as result;

select c.expected_cash, c.counted_cash, c.cash_difference, c.status, c.is_locked,
       (select count(*) from public.daily_closeout_events e where e.business_day = c.business_day) as events
  from public.daily_closeouts c where c.business_day = '2020-01-15';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: OVER the limit (2000 counted = -700, limit 500).
-- EXPECT (as written): an ERROR: "The difference (J$-700.00) is more than the
--         allowed J$500.00. Write an explanation (at least 10 characters)."
--         Then swap the two submit lines (comment the first, uncomment the
--         second) and run again: 1 row: cash_difference -700 + the note.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.test_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.step(p_id bigint, p_from public.order_status, p_to public.order_status, p_cash boolean default false)
returns boolean language sql as $$
  select public.change_order_status(p_id, p_from, p_to,
    (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), p_cash)
$$;
create function pg_temp.complete_paid(p_id bigint)
returns boolean language sql as $$
  select pg_temp.step(p_id, 'PENDING', 'IN_PROGRESS');
  select pg_temp.step(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP');
  select pg_temp.step(p_id, 'READY_FOR_PICKUP', 'COMPLETED', true);
$$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
select set_config('t.a', pg_temp.test_order('19191919-1919-4919-8919-19191919190a', 1000)::text, true);
select set_config('t.b', pg_temp.test_order('19191919-1919-4919-8919-19191919190b', 1700)::text, true);
select pg_temp.complete_paid(current_setting('t.a')::bigint);
select pg_temp.complete_paid(current_setting('t.b')::bigint);
update public.orders set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where client_request_id::text like '19191919-1919-4919-8919-1919191919%';
-- ===== SETUP END =====

select public.submit_closeout_count('2020-01-15', 2000, '', pg_temp.manager());
-- select public.submit_closeout_count('2020-01-15', 2000, 'J$700 paid out for gas, receipt in the till', pg_temp.manager());

select c.cash_difference, c.difference_note from public.daily_closeouts c where c.business_day = '2020-01-15';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: SHOULD FAIL. Counter staff can't close out a PAST day, or approve.
-- EXPECT: an ERROR: "Counter staff can only close out today."
--         (Swap to the commented-out line and run again:
--          "Only the Manager can approve a closeout.")
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.test_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.step(p_id bigint, p_from public.order_status, p_to public.order_status, p_cash boolean default false)
returns boolean language sql as $$
  select public.change_order_status(p_id, p_from, p_to,
    (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), p_cash)
$$;
create function pg_temp.complete_paid(p_id bigint)
returns boolean language sql as $$
  select pg_temp.step(p_id, 'PENDING', 'IN_PROGRESS');
  select pg_temp.step(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP');
  select pg_temp.step(p_id, 'READY_FOR_PICKUP', 'COMPLETED', true);
$$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
select set_config('t.a', pg_temp.test_order('19191919-1919-4919-8919-19191919190a', 1000)::text, true);
select set_config('t.b', pg_temp.test_order('19191919-1919-4919-8919-19191919190b', 1700)::text, true);
select pg_temp.complete_paid(current_setting('t.a')::bigint);
select pg_temp.complete_paid(current_setting('t.b')::bigint);
update public.orders set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where client_request_id::text like '19191919-1919-4919-8919-1919191919%';
-- ===== SETUP END =====

select public.submit_closeout_count('2020-01-15', 2650, '', pg_temp.manager());
select public.submit_closeout_count('2020-01-15', 2700, '', pg_temp.staff());
-- select public.approve_closeout('2020-01-15', null, pg_temp.staff());

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: the Manager APPROVES -> figures saved, day LOCKED, history.
-- EXPECT: 1 row: status APPROVED, is_locked true, summary_orders 2,
--         summary_net 2700, expected 2700, counted 2650, difference -50,
--         approved_by_role manager, events "SUBMITTED, APPROVED".
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.test_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.step(p_id bigint, p_from public.order_status, p_to public.order_status, p_cash boolean default false)
returns boolean language sql as $$
  select public.change_order_status(p_id, p_from, p_to,
    (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), p_cash)
$$;
create function pg_temp.complete_paid(p_id bigint)
returns boolean language sql as $$
  select pg_temp.step(p_id, 'PENDING', 'IN_PROGRESS');
  select pg_temp.step(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP');
  select pg_temp.step(p_id, 'READY_FOR_PICKUP', 'COMPLETED', true);
$$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
select set_config('t.a', pg_temp.test_order('19191919-1919-4919-8919-19191919190a', 1000)::text, true);
select set_config('t.b', pg_temp.test_order('19191919-1919-4919-8919-19191919190b', 1700)::text, true);
select pg_temp.complete_paid(current_setting('t.a')::bigint);
select pg_temp.complete_paid(current_setting('t.b')::bigint);
update public.orders set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where client_request_id::text like '19191919-1919-4919-8919-1919191919%';
-- ===== SETUP END =====

select public.submit_closeout_count('2020-01-15', 2650, '', pg_temp.manager());
select public.approve_closeout('2020-01-15', null, pg_temp.manager());

select c.status, c.is_locked,
       c.summary ->> 'orders' as summary_orders, c.summary ->> 'net_sales' as summary_net,
       c.expected_cash as expected, c.counted_cash as counted, c.cash_difference as difference,
       (select p.role from public.profiles p where p.id = c.approved_by) as approved_by_role,
       (select string_agg(e.action, ', ' order by e.id) from public.daily_closeout_events e
         where e.business_day = c.business_day) as events
  from public.daily_closeouts c where c.business_day = '2020-01-15';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: SHOULD FAIL. The LOCK holds: a closed day's payment can't change.
-- EXPECT: an ERROR: "Order ...: the business day 2020-01-15 is closed, so its
--         payments can't change. The Manager can reopen the day."
--         Try each commented-out line instead (each SHOULD FAIL too):
--           the order itself     -> "Order ...: the business day ... is closed, so it can't change."
--           a NEW order moved onto the closed day -> the same message.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.test_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.step(p_id bigint, p_from public.order_status, p_to public.order_status, p_cash boolean default false)
returns boolean language sql as $$
  select public.change_order_status(p_id, p_from, p_to,
    (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), p_cash)
$$;
create function pg_temp.complete_paid(p_id bigint)
returns boolean language sql as $$
  select pg_temp.step(p_id, 'PENDING', 'IN_PROGRESS');
  select pg_temp.step(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP');
  select pg_temp.step(p_id, 'READY_FOR_PICKUP', 'COMPLETED', true);
$$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
select set_config('t.a', pg_temp.test_order('19191919-1919-4919-8919-19191919190a', 1000)::text, true);
select set_config('t.b', pg_temp.test_order('19191919-1919-4919-8919-19191919190b', 1700)::text, true);
select pg_temp.complete_paid(current_setting('t.a')::bigint);
select pg_temp.complete_paid(current_setting('t.b')::bigint);
update public.orders set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where client_request_id::text like '19191919-1919-4919-8919-1919191919%';
-- ===== SETUP END =====

select public.submit_closeout_count('2020-01-15', 2650, '', pg_temp.manager());
select public.approve_closeout('2020-01-15', null, pg_temp.manager());

update public.payments set amount = 1 where order_id = current_setting('t.a')::bigint;
-- update public.orders set updated_at = now() where id = current_setting('t.a')::bigint;
-- select pg_temp.test_order('19191919-1919-4919-8919-19191919190d', 300); update public.orders set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica' where client_request_id = '19191919-1919-4919-8919-19191919190d';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: SHOULD FAIL. "Figures changed": a cash order is finished and paid
--          AFTER the count, so the count is out of date.
-- EXPECT: an ERROR: "The figures changed since the count (expected cash is
--         now J$1500.00). Please count again."
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP (A paid, C still open) =====
create function pg_temp.test_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.step(p_id bigint, p_from public.order_status, p_to public.order_status, p_cash boolean default false)
returns boolean language sql as $$
  select public.change_order_status(p_id, p_from, p_to,
    (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), p_cash)
$$;
create function pg_temp.complete_paid(p_id bigint)
returns boolean language sql as $$
  select pg_temp.step(p_id, 'PENDING', 'IN_PROGRESS');
  select pg_temp.step(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP');
  select pg_temp.step(p_id, 'READY_FOR_PICKUP', 'COMPLETED', true);
$$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
select set_config('t.a', pg_temp.test_order('19191919-1919-4919-8919-19191919190a', 1000)::text, true);
select set_config('t.c', pg_temp.test_order('19191919-1919-4919-8919-19191919190c', 500)::text, true);
select pg_temp.complete_paid(current_setting('t.a')::bigint);
select pg_temp.step(current_setting('t.c')::bigint, 'PENDING', 'IN_PROGRESS');
update public.orders set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where client_request_id::text like '19191919-1919-4919-8919-1919191919%';
-- ===== SETUP END =====

-- The Manager counts J$1,000 while C is still open (allowed for the Manager) ...
select public.submit_closeout_count('2020-01-15', 1000, '', pg_temp.manager());
-- ... then C is finished and its J$500 cash received ...
select pg_temp.step(current_setting('t.c')::bigint, 'IN_PROGRESS', 'READY_FOR_PICKUP');
select pg_temp.step(current_setting('t.c')::bigint, 'READY_FOR_PICKUP', 'COMPLETED', true);
-- ... so approving the OLD count must be refused.
select public.approve_closeout('2020-01-15', null, pg_temp.manager());

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 8: an OPEN order: approval needs an OVERRIDE reason.
-- EXPECT (as written): an ERROR: "1 order(s) are still open. To close the day
--         anyway, write a reason (at least 10 characters)."
--         Then swap the two approve lines and run again: 1 row: status
--         APPROVED, is_locked true, open_orders_at_approval 1, override_reason
--         = the reason.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP (A paid, C still open) =====
create function pg_temp.test_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.step(p_id bigint, p_from public.order_status, p_to public.order_status, p_cash boolean default false)
returns boolean language sql as $$
  select public.change_order_status(p_id, p_from, p_to,
    (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), p_cash)
$$;
create function pg_temp.complete_paid(p_id bigint)
returns boolean language sql as $$
  select pg_temp.step(p_id, 'PENDING', 'IN_PROGRESS');
  select pg_temp.step(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP');
  select pg_temp.step(p_id, 'READY_FOR_PICKUP', 'COMPLETED', true);
$$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
select set_config('t.a', pg_temp.test_order('19191919-1919-4919-8919-19191919190a', 1000)::text, true);
select set_config('t.c', pg_temp.test_order('19191919-1919-4919-8919-19191919190c', 500)::text, true);
select pg_temp.complete_paid(current_setting('t.a')::bigint);
select pg_temp.step(current_setting('t.c')::bigint, 'PENDING', 'IN_PROGRESS');
update public.orders set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where client_request_id::text like '19191919-1919-4919-8919-1919191919%';
-- ===== SETUP END =====

select public.submit_closeout_count('2020-01-15', 1000, '', pg_temp.manager());
select public.approve_closeout('2020-01-15', null, pg_temp.manager());
-- select public.approve_closeout('2020-01-15', 'Order left by a walk-out customer, handled tomorrow', pg_temp.manager());

select c.status, c.is_locked, c.open_orders_at_approval, c.override_reason
  from public.daily_closeouts c where c.business_day = '2020-01-15';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 9: REOPEN: a reason is required; then the day can change again.
-- EXPECT (as written): an ERROR: "Write why the day is being reopened (at
--         least 10 characters)."
--         Then swap the two reopen lines and run again: the payment update
--         works, then 1 row: status REOPENED, is_locked false, events
--         "SUBMITTED, APPROVED, REOPENED", last_reason = the reason.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.test_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.step(p_id bigint, p_from public.order_status, p_to public.order_status, p_cash boolean default false)
returns boolean language sql as $$
  select public.change_order_status(p_id, p_from, p_to,
    (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), p_cash)
$$;
create function pg_temp.complete_paid(p_id bigint)
returns boolean language sql as $$
  select pg_temp.step(p_id, 'PENDING', 'IN_PROGRESS');
  select pg_temp.step(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP');
  select pg_temp.step(p_id, 'READY_FOR_PICKUP', 'COMPLETED', true);
$$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
select set_config('t.a', pg_temp.test_order('19191919-1919-4919-8919-19191919190a', 1000)::text, true);
select set_config('t.b', pg_temp.test_order('19191919-1919-4919-8919-19191919190b', 1700)::text, true);
select pg_temp.complete_paid(current_setting('t.a')::bigint);
select pg_temp.complete_paid(current_setting('t.b')::bigint);
update public.orders set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where client_request_id::text like '19191919-1919-4919-8919-1919191919%';
-- ===== SETUP END =====

select public.submit_closeout_count('2020-01-15', 2650, '', pg_temp.manager());
select public.approve_closeout('2020-01-15', null, pg_temp.manager());

select public.reopen_closeout('2020-01-15', '', pg_temp.manager());
-- select public.reopen_closeout('2020-01-15', 'Cash count was wrong, recounting the till', pg_temp.manager());

-- After a reopen, the day's payments can change again (this line works).
update public.payments set paid_at = paid_at where order_id = current_setting('t.a')::bigint;

select c.status, c.is_locked,
       (select string_agg(e.action, ', ' order by e.id) from public.daily_closeout_events e
         where e.business_day = c.business_day) as events,
       (select e.reason from public.daily_closeout_events e
         where e.business_day = c.business_day order by e.id desc limit 1) as last_reason
  from public.daily_closeouts c where c.business_day = '2020-01-15';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 10: WHO SEES: counter staff see TODAY's closeout only; a customer none.
-- EXPECT: 1 row: staff_sees 1 (today's only, not 15 Jan 2020), customer_sees 0.
-- -----------------------------------------------------------------------------
begin;

-- Two closeouts written directly (as the database owner): today and 15 Jan 2020.
insert into public.daily_closeouts (business_day, status, expected_cash, counted_cash, cash_difference, submitted_by, submitted_at)
values (public.jamaica_day(now()), 'SUBMITTED', 0, 0, 0,
        (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), now()),
       ('2020-01-15', 'SUBMITTED', 0, 0, 0,
        (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), now())
on conflict (business_day) do nothing;

-- As counter staff:
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('test.staff_sees', (select count(*) from public.daily_closeouts)::text, true);

-- As a customer:
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'customer' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select current_setting('test.staff_sees') as staff_sees,
       (select count(*) from public.daily_closeouts) as customer_sees;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 11: SHOULD FAIL. Nobody (even the Manager) writes closeouts directly
--           or calls the write functions: only our server can.
-- EXPECT: an ERROR: "permission denied for table daily_closeouts".
--         (Swap to the commented-out line: "permission denied for function
--          submit_closeout_count".)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'manager' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

update public.daily_closeouts set is_locked = false;
-- select public.submit_closeout_count('2020-01-15', 0, '', (select auth.uid()));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 12: the Manager can READ a day's closeout details (closeout_details).
-- EXPECT: 1 row (JSON): expected_cash 2700, open_orders [], limit 500,
--         closeout with status SUBMITTED, counted_cash 2650, cash_difference
--         -50, submitted_by = the manager's name; events: one SUBMITTED.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.test_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.step(p_id bigint, p_from public.order_status, p_to public.order_status, p_cash boolean default false)
returns boolean language sql as $$
  select public.change_order_status(p_id, p_from, p_to,
    (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), p_cash)
$$;
create function pg_temp.complete_paid(p_id bigint)
returns boolean language sql as $$
  select pg_temp.step(p_id, 'PENDING', 'IN_PROGRESS');
  select pg_temp.step(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP');
  select pg_temp.step(p_id, 'READY_FOR_PICKUP', 'COMPLETED', true);
$$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
select set_config('t.a', pg_temp.test_order('19191919-1919-4919-8919-19191919190a', 1000)::text, true);
select set_config('t.b', pg_temp.test_order('19191919-1919-4919-8919-19191919190b', 1700)::text, true);
select pg_temp.complete_paid(current_setting('t.a')::bigint);
select pg_temp.complete_paid(current_setting('t.b')::bigint);
update public.orders set created_at = timestamp '2020-01-15 12:00' at time zone 'America/Jamaica'
 where client_request_id::text like '19191919-1919-4919-8919-1919191919%';
-- ===== SETUP END =====

select public.submit_closeout_count('2020-01-15', 2650, '', pg_temp.manager());

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'manager' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select jsonb_pretty(public.closeout_details('2020-01-15')) as details;

rollback;
