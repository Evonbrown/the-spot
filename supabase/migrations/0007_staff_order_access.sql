-- =============================================================================
-- supabase/migrations/0007_staff_order_access.sql   (Build step 4, Step 24)
--
-- WHAT: 1. Lets COUNTER STAFF read every order, its items and their extras,
--          so the live queue on /staff can show them (FR-03).
--       2. Turns on Supabase Realtime for the orders table, so the queue
--          hears about new and changed orders within seconds (FR-01: new
--          orders appear in the staff queue within 3 seconds).
--
-- LAYER: Data layer (Supabase Postgres), protected by Row Level Security.
--
-- WHY READ-ONLY? Staff still can't insert, update or delete orders with the
--   public key (the grants in 0006 only allow SELECT). Changing a status will
--   go through a SERVER rule (Step 28: "status can only move forward"), never
--   straight from the browser.
--
-- WHY ONLY counter_staff? Decision: strict role access, each role sees only
--   what its own screen needs. Drivers (FR-04), the Manager (FR-06) and the
--   Supervisor (Lynk payments) get their own rules in their own build steps.
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0007_staff_queue_checks.sql one block at a time.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. RLS: counter staff may READ all orders, items and extras.
--
--    Policies ADD UP: a row is visible if ANY policy allows it. So customers
--    still see only their own orders (policies from 0006), and counter staff
--    now also see everyone's.
--
--    current_user_role() is our helper from 0002 ("what role is asking?").
--    Wrapping it in "(select ...)" makes Postgres work it out ONCE per query
--    instead of once per row, which keeps the queue fast (PR-3: busy lunch).
-- -----------------------------------------------------------------------------
create policy "Counter staff can read all orders"
  on public.orders
  for select
  to authenticated
  using ((select public.current_user_role()) = 'counter_staff');

create policy "Counter staff can read all order items"
  on public.order_items
  for select
  to authenticated
  using ((select public.current_user_role()) = 'counter_staff');

create policy "Counter staff can read all order extras"
  on public.order_item_customizations
  for select
  to authenticated
  using ((select public.current_user_role()) = 'counter_staff');


-- -----------------------------------------------------------------------------
-- 2. Realtime for orders.
--
--    "supabase_realtime" is the list ("publication") of tables whose changes
--    Supabase sends out to connected browsers. Adding orders means: whenever
--    an order is added (new order) or changed (status), every browser that
--    subscribed gets a short message.
--
--    SAFE BECAUSE: Realtime checks RLS for EACH listener. A customer listening
--    to orders only hears about their OWN orders; counter staff hear about all
--    of them (policy above); visitors who aren't logged in hear nothing.
--    (Customers will use this for live tracking in Build step 5, FR-05.)
--
--    Only the orders table is added: items are saved in the SAME transaction
--    as the order, so by the time the message arrives they are already there.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.orders;
