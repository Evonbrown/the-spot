-- =============================================================================
-- supabase/migrations/0014_driver_access.sql   (Build step 6, Step 32)
--
-- WHAT: Lets a DELIVERY PERSON (role delivery_personnel) READ what their own
--       driver screen needs (FR-04 SR-4.2 view part / AC-2, TS-4.1.3):
--         1. their OWN deliveries;
--         2. the orders of those deliveries;
--         3. those orders' items and extras;
--         4. those orders' payments (to know if cash must be collected);
--         5. the CUSTOMERS of those orders (name + phone, to call them).
--       delivery_locations is already readable by everyone (0005).
--
-- LAYER: Data layer (Supabase Postgres), protected by Row Level Security.
--
-- READ-ONLY: no new grants. Drivers still can't change anything; marking
--   Being delivered / Completed comes in Step 33, through the server.
--
-- "MY deliveries" = deliveries.driver_id is the logged-in user. If staff move
--   a delivery to another driver (Step 31), the first driver simply can't see
--   it any more.
--
-- NO LOOP (RLS rules that call each other in a circle make queries fail):
--   profiles rule -> looks at orders -> orders rule looks at deliveries ->
--   deliveries rule only compares driver_id with auth.uid(). Nothing points
--   back, so there is no circle.
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0014_driver_access_checks.sql block by block.
-- =============================================================================


-- 1. deliveries: my own.
create policy "Drivers can read their own deliveries"
  on public.deliveries
  for select
  to authenticated
  using (driver_id = (select auth.uid()));


-- 2. orders: the ones assigned to me.
create policy "Drivers can read orders assigned to them"
  on public.orders
  for select
  to authenticated
  using (exists (
    select 1 from public.deliveries d
    where d.order_id = orders.id
      and d.driver_id = (select auth.uid())
  ));


-- 3. order items and their extras, of orders assigned to me.
create policy "Drivers can read items of orders assigned to them"
  on public.order_items
  for select
  to authenticated
  using (exists (
    select 1 from public.deliveries d
    where d.order_id = order_items.order_id
      and d.driver_id = (select auth.uid())
  ));

create policy "Drivers can read extras of orders assigned to them"
  on public.order_item_customizations
  for select
  to authenticated
  using (exists (
    select 1
    from public.order_items oi
    join public.deliveries d on d.order_id = oi.order_id
    where oi.id = order_item_customizations.order_item_id
      and d.driver_id = (select auth.uid())
  ));


-- 4. payments of orders assigned to me (method, status, amount: "collect
--    cash?"). Still read-only: marking cash PAID is Step 33, via the server.
create policy "Drivers can read payments of orders assigned to them"
  on public.payments
  for select
  to authenticated
  using (exists (
    select 1 from public.deliveries d
    where d.order_id = payments.order_id
      and d.driver_id = (select auth.uid())
  ));


-- 5. profiles: ONLY the customers of orders assigned to me (least privilege:
--    not other staff, not other customers). Everyone can still read their
--    own profile (0001).
create policy "Drivers can read customers of their deliveries"
  on public.profiles
  for select
  to authenticated
  using (
    role = 'customer'
    and exists (
      select 1
      from public.orders o
      join public.deliveries d on d.order_id = o.id
      where o.customer_id = profiles.id
        and d.driver_id = (select auth.uid())
    )
  );
