-- =============================================================================
-- supabase/tests/0008_staff_order_details_checks.sql
--
-- WHAT: Manual checks for migration 0008_staff_order_details.sql (Step 25).
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Every block ends with "rollback", so nothing is changed.
--
-- NEEDS: a 'customer' who has placed at least one order, a 'counter_staff'
--   account, and at least one other staff account ('manager',
--   'delivery_personnel' or 'supervisor').
--
-- "Acting as a user": set_config('request.jwt.claims', ...) + "set local role
--   authenticated" make RLS apply exactly as in the app (same as 0006/0007).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: counter staff can see a customer's name and phone for an order,
--          and the order's payment method.
-- EXPECT: 1 row with the order id, the customer's full_name and phone (not
--         empty), and method LYNK or CASH.
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select o.id, p.full_name, p.phone, pay.method
from public.orders o
join public.profiles p on p.id = o.customer_id
join public.payments pay on pay.order_id = o.id
order by o.id desc
limit 1;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: counter staff can NOT see other staff accounts, nor customers
--          who never ordered (least privilege).
-- EXPECT: 1 row: other_staff_visible = 0 and customers_without_orders_visible = 0.
--         (Their OWN profile is still visible, so it's left out of the count.)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'counter_staff' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select
  (select count(*) from public.profiles
    where role <> 'customer' and id <> (select auth.uid())) as other_staff_visible,
  (select count(*) from public.profiles p
    where p.role = 'customer'
      and not exists (select 1 from public.orders o where o.customer_id = p.id))
    as customers_without_orders_visible;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: a customer still sees ONLY their own profile and payments.
-- EXPECT: 1 row: other_profiles_visible = 0 and other_payments_visible = 0.
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'customer' order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select
  (select count(*) from public.profiles where id <> (select auth.uid())) as other_profiles_visible,
  (select count(*) from public.payments pay
    join public.orders o on o.id = pay.order_id
   where o.customer_id <> (select auth.uid())) as other_payments_visible;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: other staff roles still see no customers and no payments
--          (strict role access; drivers get the phone in FR-04 later).
-- EXPECT: 1 row: the role tested, customers_visible = 0, payments_visible = 0.
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles
           where role in ('manager', 'delivery_personnel', 'supervisor')
           order by created_at limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

select public.current_user_role() as tested_role,
       (select count(*) from public.profiles where role = 'customer') as customers_visible,
       (select count(*) from public.payments) as payments_visible;

rollback;
