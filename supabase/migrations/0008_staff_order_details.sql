-- =============================================================================
-- supabase/migrations/0008_staff_order_details.sql   (Build step 4, Step 25)
--
-- WHAT: Lets COUNTER STAFF read the two extra things the order details page
--       needs (FR-03, SR-3.2 / AC-1):
--         1. the customer's name and phone (profiles), but ONLY for
--            customers who have placed an order;
--         2. the payment row of any order (for the method, Lynk or Cash).
--
-- LAYER: Data layer (Supabase Postgres), protected by Row Level Security.
--
-- WHY SO NARROW ("least privilege")? Counter staff need to call a customer
--   about their order, but they have no reason to read other STAFF or
--   MANAGER accounts, or customers who never ordered. So the rule only opens
--   profiles that have an order. Email addresses are not in profiles at all
--   (they live in Supabase Auth), so they stay hidden.
--
-- STILL READ-ONLY: no new grants. Staff can't change profiles (only your own
--   name/phone, from 0001) or payments (marking PAID comes in Build step 7).
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0008_staff_order_details_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. profiles: counter staff may read CUSTOMERS WHO HAVE AN ORDER.
--
--    Policies add up: everyone can still read their OWN profile (0001); this
--    adds one more case for counter staff.
--
--    NO LOOP: this rule looks at orders; the orders rule (0007) calls
--    current_user_role(), which reads profiles as its OWNER ("security
--    definer", 0002) and so skips RLS. The rules never call each other in a
--    circle.
--    (select ...) around current_user_role(): worked out once per query, not
--    once per row.
-- -----------------------------------------------------------------------------
create policy "Counter staff can read customers who have orders"
  on public.profiles
  for select
  to authenticated
  using (
    (select public.current_user_role()) = 'counter_staff'
    and role = 'customer'
    and exists (select 1 from public.orders o where o.customer_id = profiles.id)
  );


-- -----------------------------------------------------------------------------
-- 2. payments: counter staff may read the payment of any order (method).
--    Customers can still only read their own (0006).
-- -----------------------------------------------------------------------------
create policy "Counter staff can read all payments"
  on public.payments
  for select
  to authenticated
  using ((select public.current_user_role()) = 'counter_staff');
