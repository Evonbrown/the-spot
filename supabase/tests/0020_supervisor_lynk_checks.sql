-- =============================================================================
-- supabase/tests/0020_supervisor_lynk_checks.sql
--
-- WHAT: Manual checks for migration 0020_supervisor_lynk.sql (Step 38a):
--       verifying a Lynk payment (and that it then counts in sales), "not
--       received", who may do it, the closed-day lock, and who may read what.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks marked "SHOULD FAIL" are supposed to give the error shown. Every
--   block ends with "rollback", so nothing is left behind.
--
-- NEEDS: a 'customer', a 'counter_staff', a 'manager' and a 'supervisor'
--   profile, and the menu.
--
-- THE TEST DAY: 16 January 2020 (a day with no real orders).
--
-- Every block starts with the same SETUP: one LYNK pickup order of J$1,200
-- (unpaid), moved to the test day. Its id is kept in the setting "t.lynk".
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: the Supervisor VERIFIES a Lynk payment -> PAID, and it now COUNTS
--          in the sales figures.
-- EXPECT: two rows:
--   before: lynk_amount 0,    orders 0
--   after:  lynk_amount 1200, orders 1
-- and the final row: verified true, status PAID, paid_by_role supervisor,
--   has_paid_at true.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP (copied in every block) =====
create function pg_temp.lynk_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'LYNK',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.supervisor() returns uuid language sql as $$
  select id from public.profiles where role = 'supervisor' order by created_at limit 1 $$;
select set_config('t.lynk', pg_temp.lynk_order('20202020-2020-4020-8020-202020202001', 1200)::text, true);
update public.orders set created_at = timestamp '2020-01-16 12:00' at time zone 'America/Jamaica'
 where client_request_id = '20202020-2020-4020-8020-202020202001';
-- The day's figures (Lynk amount + counted orders), as the reports see them.
create function pg_temp.lynk_sales() returns table (lynk_amount numeric, orders numeric) language sql as $$
  select (select (m->>'amount')::numeric
            from jsonb_array_elements(s->'by_method') m where m->>'method' = 'LYNK'),
         (s->>'orders')::numeric
    from (select public.report_summary(public.jamaica_midnight('2020-01-16'),
                                       public.jamaica_midnight('2020-01-17')) as s) x
$$;
-- ===== SETUP END =====

select 'before' as moment, * from pg_temp.lynk_sales();

select set_config('t.ok', public.verify_lynk_payment(current_setting('t.lynk')::bigint, pg_temp.supervisor())::text, true);

select 'after' as moment, * from pg_temp.lynk_sales();

select current_setting('t.ok') as verified, pay.status,
       (select role from public.profiles where id = pay.paid_by) as paid_by_role,
       pay.paid_at is not null as has_paid_at
  from public.payments pay where pay.order_id = current_setting('t.lynk')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: verifying TWICE (two Supervisors at the same moment): the second
--          time returns FALSE and changes nothing.
-- EXPECT: 1 row: first true, second false, status PAID.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.lynk_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'LYNK',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.supervisor() returns uuid language sql as $$
  select id from public.profiles where role = 'supervisor' order by created_at limit 1 $$;
select set_config('t.lynk', pg_temp.lynk_order('20202020-2020-4020-8020-202020202001', 1200)::text, true);
update public.orders set created_at = timestamp '2020-01-16 12:00' at time zone 'America/Jamaica'
 where client_request_id = '20202020-2020-4020-8020-202020202001';
-- ===== SETUP END =====

select set_config('t.first', public.verify_lynk_payment(current_setting('t.lynk')::bigint, pg_temp.supervisor())::text, true);
select set_config('t.second', public.verify_lynk_payment(current_setting('t.lynk')::bigint, pg_temp.supervisor())::text, true);

select current_setting('t.first') as first, current_setting('t.second') as second, pay.status
  from public.payments pay where pay.order_id = current_setting('t.lynk')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: SHOULD FAIL. Only the Supervisor can verify (here: the MANAGER).
-- EXPECT: an ERROR: "Only the Supervisor can verify Lynk payments."
--         (Try 'counter_staff' or 'customer' instead of 'manager': same error.)
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.lynk_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'LYNK',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
select set_config('t.lynk', pg_temp.lynk_order('20202020-2020-4020-8020-202020202001', 1200)::text, true);
update public.orders set created_at = timestamp '2020-01-16 12:00' at time zone 'America/Jamaica'
 where client_request_id = '20202020-2020-4020-8020-202020202001';
-- ===== SETUP END =====

select public.verify_lynk_payment(current_setting('t.lynk')::bigint,
  (select id from public.profiles where role = 'manager' order by created_at limit 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: SHOULD FAIL. A CASH payment can't be "verified" here (cash is
--          marked paid at the handover, Step 27 / 33).
-- EXPECT: an ERROR: "Order N: this is a cash payment. Cash is marked paid
--         when it's received."
-- -----------------------------------------------------------------------------
begin;

select set_config('t.cash', public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    '20202020-2020-4020-8020-202020202002', 'PICKUP', null, now() + interval '30 minutes', false, 500, 0, 'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', 500,
      'quantity', 1, 'note', '', 'line_total', 500, 'extras', '[]'::jsonb)))::text, true);

select public.verify_lynk_payment(current_setting('t.cash')::bigint,
  (select id from public.profiles where role = 'supervisor' order by created_at limit 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: NOT RECEIVED, then the money arrives after all.
-- EXPECT: three rows:
--   flagged:          status UNPAID, flagged true,  note "Nothing in Lynk yet"
--   flagged again:    status UNPAID, flagged true,  note "Checked again at 2pm"
--   verified later:   status PAID,   flagged false, note null
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.lynk_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'LYNK',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.supervisor() returns uuid language sql as $$
  select id from public.profiles where role = 'supervisor' order by created_at limit 1 $$;
select set_config('t.lynk', pg_temp.lynk_order('20202020-2020-4020-8020-202020202001', 1200)::text, true);
update public.orders set created_at = timestamp '2020-01-16 12:00' at time zone 'America/Jamaica'
 where client_request_id = '20202020-2020-4020-8020-202020202001';
-- ===== SETUP END =====

create temp table t_steps (step text, status text, flagged boolean, note text) on commit drop;
create function pg_temp.snap(p_step text) returns void language sql as $$
  insert into t_steps
  select p_step, pay.status, pay.not_received_at is not null, pay.not_received_note
    from public.payments pay where pay.order_id = current_setting('t.lynk')::bigint
$$;

select public.flag_lynk_not_received(current_setting('t.lynk')::bigint, '  Nothing in Lynk yet ', pg_temp.supervisor());
select pg_temp.snap('flagged');
select public.flag_lynk_not_received(current_setting('t.lynk')::bigint, 'Checked again at 2pm', pg_temp.supervisor());
select pg_temp.snap('flagged again');
select public.verify_lynk_payment(current_setting('t.lynk')::bigint, pg_temp.supervisor());
select pg_temp.snap('verified later');

select * from t_steps;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: SHOULD FAIL. The note can be at most 200 characters.
-- EXPECT: an ERROR: "The note can be at most 200 characters."
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.lynk_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'LYNK',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
select set_config('t.lynk', pg_temp.lynk_order('20202020-2020-4020-8020-202020202001', 1200)::text, true);
-- ===== SETUP END =====

select public.flag_lynk_not_received(current_setting('t.lynk')::bigint, repeat('x', 201),
  (select id from public.profiles where role = 'supervisor' order by created_at limit 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: SHOULD FAIL. A CLOSED day (Step 36): the Manager counts and
--          approves 16 Jan 2020 (with an override reason, because the Lynk
--          order is still open), then the Supervisor tries to verify it.
-- EXPECT: an ERROR: "Order N: the business day 2020-01-16 is closed, so its
--         payments can't change. The Manager can reopen the day."
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.lynk_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'LYNK',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.supervisor() returns uuid language sql as $$
  select id from public.profiles where role = 'supervisor' order by created_at limit 1 $$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
select set_config('t.lynk', pg_temp.lynk_order('20202020-2020-4020-8020-202020202001', 1200)::text, true);
update public.orders set created_at = timestamp '2020-01-16 12:00' at time zone 'America/Jamaica'
 where client_request_id = '20202020-2020-4020-8020-202020202001';
-- ===== SETUP END =====

-- Close the test day (no cash expected, J$0 counted).
select public.submit_closeout_count('2020-01-16', 0, '', pg_temp.manager());
select public.approve_closeout('2020-01-16', 'Test: closing with the Lynk order open', pg_temp.manager());

select public.verify_lynk_payment(current_setting('t.lynk')::bigint, pg_temp.supervisor());

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 8: what the Supervisor may READ (logged in as the Supervisor).
-- EXPECT: 1 row: orders_seen and payments_seen = ALL orders / payments
--         (same as all_orders / all_payments), and roles_seen = {customer,
--         supervisor} (customers who ordered + their own profile; no other
--         staff accounts).
-- -----------------------------------------------------------------------------
begin;

select set_config('t.all_orders', (select count(*) from public.orders)::text, true);
select set_config('t.all_payments', (select count(*) from public.payments)::text, true);

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'supervisor' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select (select count(*) from public.orders) as orders_seen,
       current_setting('t.all_orders') as all_orders,
       (select count(*) from public.payments) as payments_seen,
       current_setting('t.all_payments') as all_payments,
       (select array_agg(distinct role order by role) from public.profiles) as roles_seen;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 9: SHOULD FAIL. The Supervisor can't change payments DIRECTLY with
--          the public key, or call the write function: only our server can.
-- EXPECT: an ERROR: "permission denied for table payments".
--         (Swap to the commented-out line: "permission denied for function
--          verify_lynk_payment".)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'supervisor' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

update public.payments set status = 'PAID' where method = 'LYNK';
-- select public.verify_lynk_payment(1001, (select auth.uid()));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 10: COUNTER STAFF see the "not received" flag (for the order page).
-- EXPECT: 1 row: status UNPAID, flagged true, note "Nothing in Lynk yet".
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.lynk_order(p_req uuid, p_amount numeric)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, 'LYNK',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
select set_config('t.lynk', pg_temp.lynk_order('20202020-2020-4020-8020-202020202001', 1200)::text, true);
-- ===== SETUP END =====

select public.flag_lynk_not_received(current_setting('t.lynk')::bigint, 'Nothing in Lynk yet',
  (select id from public.profiles where role = 'supervisor' order by created_at limit 1));

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select pay.status, pay.not_received_at is not null as flagged, pay.not_received_note as note
  from public.payments pay where pay.order_id = current_setting('t.lynk')::bigint;

rollback;
