-- =============================================================================
-- supabase/tests/0021_refunds_checks.sql
--
-- WHAT: Manual checks for migration 0021_refunds.sql (Step 38b): part and
--       full refunds, the "not more than paid" rule, who may refund, the
--       closed-day lock, decision A (a refund counts on the day it's
--       ISSUED), refunds in the reports and the expected cash, and who may
--       read refunds.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks marked "SHOULD FAIL" are supposed to give the error shown. Every
--   block ends with "rollback", so nothing is left behind (no orders, no
--   refunds, no closeouts).
--
-- NEEDS: a 'customer', a 'counter_staff', a 'manager' and a 'supervisor'
--   profile, and the menu. TODAY must not be closed already.
--
-- REFUNDS ARE ISSUED "NOW" (today). So the report checks look at TODAY and
-- compare BEFORE and AFTER ("delta" = how much a figure changed), which
-- works even if there are real orders today.
--
-- Every block starts with the same SETUP (helpers). The orders used:
--   cash order: CASH pickup J$1,000, completed and PAID (today)
--   lynk order: LYNK pickup J$1,200, not verified (UNPAID)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: a PART refund (J$300 of J$1,000, cash).
-- EXPECT: 1 row: ok true, pay_status PAID (only part refunded),
--   refund_day_is_today true, refunded_by_role supervisor,
--   d_gross 1000 (the test sale), d_refunds 300, d_net 700,
--   d_cash_refunds 300, d_expected_cash 700 (1000 cash in, 300 out).
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP (copied in every block) =====
create function pg_temp.new_order(p_req uuid, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
create function pg_temp.supervisor() returns uuid language sql as $$
  select id from public.profiles where role = 'supervisor' order by created_at limit 1 $$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
-- Complete a pickup order; true = "cash received" (cash -> PAID).
create function pg_temp.complete(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select public.change_order_status(p_id, 'PENDING', 'IN_PROGRESS', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'READY_FOR_PICKUP', 'COMPLETED', pg_temp.staff(), p_cash);
$$;
-- TODAY's figures, as the reports and the closeout see them.
create function pg_temp.today()
returns table (gross numeric, refunds numeric, net numeric, cash_refunds numeric, expected_cash numeric)
language sql as $$
  select (s->>'gross_sales')::numeric, (s->>'refunds')::numeric, (s->>'net_sales')::numeric,
         (select (m->>'refunds')::numeric from jsonb_array_elements(s->'by_method') m where m->>'method' = 'CASH'),
         public.closeout_expected_cash(public.jamaica_day(now()))
    from (select public.report_summary(public.jamaica_midnight(public.jamaica_day(now())),
                                       public.jamaica_midnight(public.jamaica_day(now()) + 1)) as s) x
$$;
create temp table t_before on commit drop as select * from pg_temp.today();
select set_config('t.cash', pg_temp.new_order('21212121-2121-4121-8121-212121212101', 1000, 'CASH')::text, true);
select pg_temp.complete(current_setting('t.cash')::bigint, true);
-- ===== SETUP END =====

select set_config('t.ok', public.issue_refund(current_setting('t.cash')::bigint, 300,
  'Customer found a hair in the food', 0, pg_temp.supervisor())::text, true);

select current_setting('t.ok') as ok,
       (select status from public.payments where order_id = current_setting('t.cash')::bigint) as pay_status,
       r.business_day = public.jamaica_day(now()) as refund_day_is_today,
       (select role from public.profiles where id = r.refunded_by) as refunded_by_role,
       a.gross - b.gross as d_gross, a.refunds - b.refunds as d_refunds, a.net - b.net as d_net,
       a.cash_refunds - b.cash_refunds as d_cash_refunds, a.expected_cash - b.expected_cash as d_expected_cash
  from public.refunds r, pg_temp.today() a, t_before b
 where r.order_id = current_setting('t.cash')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: two refunds that add up to ALL of it (600 + 400 of 1,000) -> the
--          payment becomes REFUNDED, and the order STILL counts in gross
--          (it was a sale; the refunds are taken off).
-- EXPECT: 1 row: first true, second true, pay_status REFUNDED,
--         refunded_total 1000, d_gross 1000, d_refunds 1000, d_net 0.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.new_order(p_req uuid, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
create function pg_temp.supervisor() returns uuid language sql as $$
  select id from public.profiles where role = 'supervisor' order by created_at limit 1 $$;
create function pg_temp.complete(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select public.change_order_status(p_id, 'PENDING', 'IN_PROGRESS', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'READY_FOR_PICKUP', 'COMPLETED', pg_temp.staff(), p_cash);
$$;
create function pg_temp.today()
returns table (gross numeric, refunds numeric, net numeric, cash_refunds numeric, expected_cash numeric)
language sql as $$
  select (s->>'gross_sales')::numeric, (s->>'refunds')::numeric, (s->>'net_sales')::numeric,
         (select (m->>'refunds')::numeric from jsonb_array_elements(s->'by_method') m where m->>'method' = 'CASH'),
         public.closeout_expected_cash(public.jamaica_day(now()))
    from (select public.report_summary(public.jamaica_midnight(public.jamaica_day(now())),
                                       public.jamaica_midnight(public.jamaica_day(now()) + 1)) as s) x
$$;
create temp table t_before on commit drop as select * from pg_temp.today();
select set_config('t.cash', pg_temp.new_order('21212121-2121-4121-8121-212121212101', 1000, 'CASH')::text, true);
select pg_temp.complete(current_setting('t.cash')::bigint, true);
-- ===== SETUP END =====

select set_config('t.first', public.issue_refund(current_setting('t.cash')::bigint, 600,
  'Wrong order: fries were missing', 0, pg_temp.supervisor())::text, true);
select set_config('t.second', public.issue_refund(current_setting('t.cash')::bigint, 400,
  'Customer cancelled the rest of the meal', 600, pg_temp.supervisor())::text, true);

select current_setting('t.first') as first, current_setting('t.second') as second,
       (select status from public.payments where order_id = current_setting('t.cash')::bigint) as pay_status,
       (select sum(amount) from public.refunds where order_id = current_setting('t.cash')::bigint) as refunded_total,
       a.gross - b.gross as d_gross, a.refunds - b.refunds as d_refunds, a.net - b.net as d_net
  from pg_temp.today() a, t_before b;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: SHOULD FAIL. More than what was paid.
-- EXPECT: an ERROR: "Order N: you can refund at most J$1,000.00 (paid
--         J$1,000.00, already refunded J$0.00)."
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.new_order(p_req uuid, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
create function pg_temp.complete(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select public.change_order_status(p_id, 'PENDING', 'IN_PROGRESS', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'READY_FOR_PICKUP', 'COMPLETED', pg_temp.staff(), p_cash);
$$;
select set_config('t.cash', pg_temp.new_order('21212121-2121-4121-8121-212121212101', 1000, 'CASH')::text, true);
select pg_temp.complete(current_setting('t.cash')::bigint, true);
-- ===== SETUP END =====

select public.issue_refund(current_setting('t.cash')::bigint, 1000.01, 'Trying to refund too much',
  0, (select id from public.profiles where role = 'supervisor' order by created_at limit 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: "someone refunded meanwhile": a second refund made with an OLD
--          "refunded so far" (0 instead of 300) returns FALSE and saves
--          nothing.
-- EXPECT: 1 row: first true, second false, refunds 1, refunded_total 300.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.new_order(p_req uuid, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
create function pg_temp.supervisor() returns uuid language sql as $$
  select id from public.profiles where role = 'supervisor' order by created_at limit 1 $$;
create function pg_temp.complete(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select public.change_order_status(p_id, 'PENDING', 'IN_PROGRESS', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'READY_FOR_PICKUP', 'COMPLETED', pg_temp.staff(), p_cash);
$$;
select set_config('t.cash', pg_temp.new_order('21212121-2121-4121-8121-212121212101', 1000, 'CASH')::text, true);
select pg_temp.complete(current_setting('t.cash')::bigint, true);
-- ===== SETUP END =====

select set_config('t.first', public.issue_refund(current_setting('t.cash')::bigint, 300,
  'First refund by Supervisor A', 0, pg_temp.supervisor())::text, true);
select set_config('t.second', public.issue_refund(current_setting('t.cash')::bigint, 300,
  'Same refund by Supervisor B', 0, pg_temp.supervisor())::text, true);

select current_setting('t.first') as first, current_setting('t.second') as second,
       count(*) as refunds, sum(amount) as refunded_total
  from public.refunds where order_id = current_setting('t.cash')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: SHOULD FAIL. An UNPAID order (Lynk not verified yet) can't be
--          refunded.
-- EXPECT: an ERROR: "Order N: this order isn't paid, so there is nothing to
--         refund."
-- -----------------------------------------------------------------------------
begin;

select set_config('t.lynk', public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    '21212121-2121-4121-8121-212121212102', 'PICKUP', null, now() + interval '30 minutes', false, 1200, 0, 'LYNK',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', 1200,
      'quantity', 1, 'note', '', 'line_total', 1200, 'extras', '[]'::jsonb)))::text, true);

select public.issue_refund(current_setting('t.lynk')::bigint, 100, 'Refund before paying',
  0, (select id from public.profiles where role = 'supervisor' order by created_at limit 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: SHOULD FAIL. A reason is required (at least 10 characters).
-- EXPECT: an ERROR: "Write the reason for the refund (at least 10 characters)."
--         (Try an amount of 0 instead: "The refund must be more than J$0.")
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.new_order(p_req uuid, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
create function pg_temp.complete(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select public.change_order_status(p_id, 'PENDING', 'IN_PROGRESS', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'READY_FOR_PICKUP', 'COMPLETED', pg_temp.staff(), p_cash);
$$;
select set_config('t.cash', pg_temp.new_order('21212121-2121-4121-8121-212121212101', 1000, 'CASH')::text, true);
select pg_temp.complete(current_setting('t.cash')::bigint, true);
-- ===== SETUP END =====

select public.issue_refund(current_setting('t.cash')::bigint, 100, '  short  ',
  0, (select id from public.profiles where role = 'supervisor' order by created_at limit 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: SHOULD FAIL. ONLY the Supervisor can refund (here: the Manager).
-- EXPECT: an ERROR: "Only the Supervisor can issue refunds."
--         (Try 'counter_staff' or 'customer': same error.)
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.new_order(p_req uuid, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
create function pg_temp.complete(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select public.change_order_status(p_id, 'PENDING', 'IN_PROGRESS', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'READY_FOR_PICKUP', 'COMPLETED', pg_temp.staff(), p_cash);
$$;
select set_config('t.cash', pg_temp.new_order('21212121-2121-4121-8121-212121212101', 1000, 'CASH')::text, true);
select pg_temp.complete(current_setting('t.cash')::bigint, true);
-- ===== SETUP END =====

select public.issue_refund(current_setting('t.cash')::bigint, 100, 'Manager trying a refund',
  0, (select id from public.profiles where role = 'manager' order by created_at limit 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 8: SHOULD FAIL. TODAY is closed (the Manager counts and approves
--          today), then the Supervisor tries a refund: no refund can be added
--          on a locked day.
-- EXPECT: an ERROR: "Refund: the business day YYYY-MM-DD is closed, so no
--         refund can be added. The Manager can reopen the day." (today's date)
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.new_order(p_req uuid, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
create function pg_temp.complete(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select public.change_order_status(p_id, 'PENDING', 'IN_PROGRESS', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'READY_FOR_PICKUP', 'COMPLETED', pg_temp.staff(), p_cash);
$$;
select set_config('t.cash', pg_temp.new_order('21212121-2121-4121-8121-212121212101', 1000, 'CASH')::text, true);
select pg_temp.complete(current_setting('t.cash')::bigint, true);
-- ===== SETUP END =====

-- Close TODAY: count exactly the expected cash, approve (with a reason in
-- case real orders are open today).
select public.submit_closeout_count(public.jamaica_day(now()),
  public.closeout_expected_cash(public.jamaica_day(now())), '', pg_temp.manager());
select public.approve_closeout(public.jamaica_day(now()), 'Test: closing today for the refund lock check', pg_temp.manager());

select public.issue_refund(current_setting('t.cash')::bigint, 100, 'Refund after closing time',
  0, (select id from public.profiles where role = 'supervisor' order by created_at limit 1));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 9: decision A. An order from a CLOSED past day (17 Jan 2020) gets a
--          FULL refund TODAY: allowed; the payment becomes REFUNDED; the
--          closed day's figures DON'T change (the refund counts today).
-- EXPECT: 1 row: ok true, pay_status REFUNDED, day_locked true,
--         old_day_gross 1000, old_day_refunds 0, old_day_net 1000,
--         d_today_refunds 1000.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.new_order(p_req uuid, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
create function pg_temp.supervisor() returns uuid language sql as $$
  select id from public.profiles where role = 'supervisor' order by created_at limit 1 $$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
create function pg_temp.complete(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select public.change_order_status(p_id, 'PENDING', 'IN_PROGRESS', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'READY_FOR_PICKUP', 'COMPLETED', pg_temp.staff(), p_cash);
$$;
create function pg_temp.day_figures(p_day date)
returns table (gross numeric, refunds numeric, net numeric) language sql as $$
  select (s->>'gross_sales')::numeric, (s->>'refunds')::numeric, (s->>'net_sales')::numeric
    from (select public.report_summary(public.jamaica_midnight(p_day), public.jamaica_midnight(p_day + 1)) as s) x
$$;
create temp table t_before on commit drop as select * from pg_temp.day_figures(public.jamaica_day(now()));
select set_config('t.cash', pg_temp.new_order('21212121-2121-4121-8121-212121212101', 1000, 'CASH')::text, true);
select pg_temp.complete(current_setting('t.cash')::bigint, true);
-- ===== SETUP END =====

-- Move the order to 17 Jan 2020 and CLOSE that day (expected cash 1000).
update public.orders set created_at = timestamp '2020-01-17 12:00' at time zone 'America/Jamaica'
 where id = current_setting('t.cash')::bigint;
select public.submit_closeout_count('2020-01-17', 1000, '', pg_temp.manager());
select public.approve_closeout('2020-01-17', null, pg_temp.manager());

-- Today: a full refund of that old order.
select set_config('t.ok', public.issue_refund(current_setting('t.cash')::bigint, 1000,
  'Food poisoning complaint, full refund', 0, pg_temp.supervisor())::text, true);

select current_setting('t.ok') as ok,
       (select status from public.payments where order_id = current_setting('t.cash')::bigint) as pay_status,
       public.is_day_locked('2020-01-17') as day_locked,
       o.gross as old_day_gross, o.refunds as old_day_refunds, o.net as old_day_net,
       t.refunds - b.refunds as d_today_refunds
  from pg_temp.day_figures('2020-01-17') o, pg_temp.day_figures(public.jamaica_day(now())) t, t_before b;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 10: SHOULD FAIL. On that closed day, any OTHER payment change is
--           still refused (only PAID -> REFUNDED is allowed).
-- EXPECT: an ERROR: "Order N: the business day 2020-01-17 is closed, so its
--         payments can't change. The Manager can reopen the day."
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.new_order(p_req uuid, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
create function pg_temp.manager() returns uuid language sql as $$
  select id from public.profiles where role = 'manager' order by created_at limit 1 $$;
create function pg_temp.complete(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select public.change_order_status(p_id, 'PENDING', 'IN_PROGRESS', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'READY_FOR_PICKUP', 'COMPLETED', pg_temp.staff(), p_cash);
$$;
select set_config('t.cash', pg_temp.new_order('21212121-2121-4121-8121-212121212101', 1000, 'CASH')::text, true);
select pg_temp.complete(current_setting('t.cash')::bigint, true);
-- ===== SETUP END =====

update public.orders set created_at = timestamp '2020-01-17 12:00' at time zone 'America/Jamaica'
 where id = current_setting('t.cash')::bigint;
select public.submit_closeout_count('2020-01-17', 1000, '', pg_temp.manager());
select public.approve_closeout('2020-01-17', null, pg_temp.manager());

-- Try to change the amount of the closed day's payment.
update public.payments set amount = 1 where order_id = current_setting('t.cash')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 11: SHOULD FAIL. A refund can never be changed or deleted (not even
--           in the SQL Editor).
-- EXPECT: an ERROR: "Refunds can't be changed or deleted."
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.new_order(p_req uuid, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
create function pg_temp.complete(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select public.change_order_status(p_id, 'PENDING', 'IN_PROGRESS', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'READY_FOR_PICKUP', 'COMPLETED', pg_temp.staff(), p_cash);
$$;
select set_config('t.cash', pg_temp.new_order('21212121-2121-4121-8121-212121212101', 1000, 'CASH')::text, true);
select pg_temp.complete(current_setting('t.cash')::bigint, true);
-- ===== SETUP END =====

select public.issue_refund(current_setting('t.cash')::bigint, 300, 'Customer found a hair in the food',
  0, (select id from public.profiles where role = 'supervisor' order by created_at limit 1));

update public.refunds set amount = 1 where order_id = current_setting('t.cash')::bigint;
-- delete from public.refunds where order_id = current_setting('t.cash')::bigint;  -- same error

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 12: WHO may READ refunds. One test refund, then count what each role
--           sees (logged in as that role).
-- EXPECT: 4 rows:
--   customer       0     (decision: customers don't see refunds, not now)
--   counter_staff  0
--   manager        1 or more (all refunds, incl. the test one)
--   supervisor     1 or more (same number as the manager)
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.new_order(p_req uuid, p_amount numeric, p_method text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, 'PICKUP', null, now() + interval '30 minutes', false, p_amount, 0, p_method,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', p_amount,
      'quantity', 1, 'note', '', 'line_total', p_amount, 'extras', '[]'::jsonb)))
$$;
create function pg_temp.staff() returns uuid language sql as $$
  select id from public.profiles where role = 'counter_staff' order by created_at limit 1 $$;
create function pg_temp.complete(p_id bigint, p_cash boolean)
returns boolean language sql as $$
  select public.change_order_status(p_id, 'PENDING', 'IN_PROGRESS', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'IN_PROGRESS', 'READY_FOR_PICKUP', pg_temp.staff(), false);
  select public.change_order_status(p_id, 'READY_FOR_PICKUP', 'COMPLETED', pg_temp.staff(), p_cash);
$$;
select set_config('t.cash', pg_temp.new_order('21212121-2121-4121-8121-212121212101', 1000, 'CASH')::text, true);
select pg_temp.complete(current_setting('t.cash')::bigint, true);
-- ===== SETUP END =====

select public.issue_refund(current_setting('t.cash')::bigint, 300, 'Customer found a hair in the food',
  0, (select id from public.profiles where role = 'supervisor' order by created_at limit 1));

-- As each role in turn ("reset role" = back to the SQL Editor's own role).
-- Each count is kept in a setting (t.seen_...), shown together at the end.
select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'customer' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('t.seen_customer', (select count(*) from public.refunds)::text, true);
reset role;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('t.seen_staff', (select count(*) from public.refunds)::text, true);
reset role;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'manager' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('t.seen_manager', (select count(*) from public.refunds)::text, true);
reset role;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'supervisor' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('t.seen_supervisor', (select count(*) from public.refunds)::text, true);
reset role;

select * from (values
  ('customer',      current_setting('t.seen_customer')),
  ('counter_staff', current_setting('t.seen_staff')),
  ('manager',       current_setting('t.seen_manager')),
  ('supervisor',    current_setting('t.seen_supervisor'))) as seen (role, refunds_seen);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 13: SHOULD FAIL. Even the Supervisor can't add a refund DIRECTLY
--           with the public key (or call issue_refund): only our server can.
-- EXPECT: an ERROR: "permission denied for table refunds".
--         (Swap to the commented-out line: "permission denied for function
--          issue_refund".)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'supervisor' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.refunds (order_id, payment_id, method, amount, reason, refunded_by, business_day)
values (1001, 1, 'CASH', 100, 'Sneaky direct refund', (select auth.uid()), current_date);
-- select public.issue_refund(1001, 100, 'Sneaky direct refund', 0, (select auth.uid()));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 14: a CANCELLED order that was paid by Lynk (verified, then
--           cancelled) is refunded in full: allowed, but its refund is NOT
--           taken off sales (the order was never in sales).
-- EXPECT: 1 row: ok true, pay_status REFUNDED, d_gross 0, d_refunds 0,
--         d_net 0.
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.supervisor() returns uuid language sql as $$
  select id from public.profiles where role = 'supervisor' order by created_at limit 1 $$;
create function pg_temp.today()
returns table (gross numeric, refunds numeric, net numeric) language sql as $$
  select (s->>'gross_sales')::numeric, (s->>'refunds')::numeric, (s->>'net_sales')::numeric
    from (select public.report_summary(public.jamaica_midnight(public.jamaica_day(now())),
                                       public.jamaica_midnight(public.jamaica_day(now()) + 1)) as s) x
$$;
create temp table t_before on commit drop as select * from pg_temp.today();
select set_config('t.lynk', public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    '21212121-2121-4121-8121-212121212102', 'PICKUP', null, now() + interval '30 minutes', false, 1200, 0, 'LYNK',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Test item', 'size', null, 'unit_price', 1200,
      'quantity', 1, 'note', '', 'line_total', 1200, 'extras', '[]'::jsonb)))::text, true);
-- ===== SETUP END =====

select public.verify_lynk_payment(current_setting('t.lynk')::bigint, pg_temp.supervisor());
select public.change_order_status(current_setting('t.lynk')::bigint, 'PENDING', 'CANCELLED',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), false);
select set_config('t.ok', public.issue_refund(current_setting('t.lynk')::bigint, 1200,
  'Order cancelled, Lynk money sent back', 0, pg_temp.supervisor())::text, true);

select current_setting('t.ok') as ok,
       (select status from public.payments where order_id = current_setting('t.lynk')::bigint) as pay_status,
       a.gross - b.gross as d_gross, a.refunds - b.refunds as d_refunds, a.net - b.net as d_net
  from pg_temp.today() a, t_before b;

rollback;
