-- =============================================================================
-- supabase/tests/0028_drop_off_details_checks.sql
--
-- WHAT: Manual checks for migration 0028_drop_off_details.sql (Step 41,
--       FR-01 SR-1.3 / AC-2 / TS-2.2): delivery orders need drop-off details
--       (3-200 characters), pickup orders have none, older delivery orders
--       still work, and who can read the details.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks marked "SHOULD FAIL" are supposed to give the error shown. Every
--   block ends with "rollback", so nothing is left behind.
--
-- NEEDS: TWO 'customer' profiles, a 'counter_staff' profile, TWO
--   'delivery_personnel' profiles, the menu (with "Pepsi") and an active
--   delivery location. Today must not be closed (Step 36).
--
-- Most blocks use the same SETUP: a helper that places a J$220 Pepsi order
-- for delivery (or pickup) with the given drop-off details.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: a DELIVERY order with drop-off details saves them (spaces at the
--          ends removed).
-- EXPECT: 1 row: fulfilment DELIVERY, drop_off_details "Chancellor Hall, Block B".
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP (copied in the blocks that need it) =====
create function pg_temp.place(p_req uuid, p_fulfilment text, p_drop_off text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, p_fulfilment,
    case when p_fulfilment = 'DELIVERY'
      then (select id from public.delivery_locations where is_active order by sort_order limit 1) end,
    now() + interval '30 minutes', false, 220,
    case when p_fulfilment = 'DELIVERY' then 200 else 0 end,
    'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
      'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
    p_drop_off)
$$;
-- ===== SETUP END =====

select set_config('t.order', pg_temp.place('28282828-2828-4828-8828-282828282801', 'DELIVERY', '  Chancellor Hall, Block B  ')::text, true);

select fulfilment, drop_off_details from public.orders where id = current_setting('t.order')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: SHOULD FAIL. A DELIVERY order WITHOUT drop-off details is refused.
-- EXPECT: an ERROR: "Add drop-off details (building, room or landmark)."
--         (Try '   ' (only spaces) instead of null: the same error.)
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.place(p_req uuid, p_fulfilment text, p_drop_off text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, p_fulfilment,
    case when p_fulfilment = 'DELIVERY'
      then (select id from public.delivery_locations where is_active order by sort_order limit 1) end,
    now() + interval '30 minutes', false, 220,
    case when p_fulfilment = 'DELIVERY' then 200 else 0 end,
    'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
      'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
    p_drop_off)
$$;
-- ===== SETUP END =====

select pg_temp.place('28282828-2828-4828-8828-282828282802', 'DELIVERY', null);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: SHOULD FAIL. Drop-off details can be at most 200 characters.
-- EXPECT: an ERROR: new row for relation "orders" violates check constraint
--         "orders_drop_off_details_length".
--         (Try 'AB' (2 characters): the same error, the minimum is 3.)
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.place(p_req uuid, p_fulfilment text, p_drop_off text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, p_fulfilment,
    case when p_fulfilment = 'DELIVERY'
      then (select id from public.delivery_locations where is_active order by sort_order limit 1) end,
    now() + interval '30 minutes', false, 220,
    case when p_fulfilment = 'DELIVERY' then 200 else 0 end,
    'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
      'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
    p_drop_off)
$$;
-- ===== SETUP END =====

select pg_temp.place('28282828-2828-4828-8828-282828282803', 'DELIVERY', repeat('x', 201));

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: a PICKUP order never keeps drop-off details: create_order leaves
--          them out, and the database refuses them if someone tries later.
-- EXPECT (as written): 1 row: fulfilment PICKUP, drop_off_details (null).
--         Then uncomment the UPDATE line and run again: an ERROR: new row for
--         relation "orders" violates check constraint
--         "orders_drop_off_details_delivery_only".
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.place(p_req uuid, p_fulfilment text, p_drop_off text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, p_fulfilment,
    case when p_fulfilment = 'DELIVERY'
      then (select id from public.delivery_locations where is_active order by sort_order limit 1) end,
    now() + interval '30 minutes', false, 220,
    case when p_fulfilment = 'DELIVERY' then 200 else 0 end,
    'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
      'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
    p_drop_off)
$$;
-- ===== SETUP END =====

select set_config('t.order', pg_temp.place('28282828-2828-4828-8828-282828282804', 'PICKUP', 'Front counter')::text, true);
-- update public.orders set drop_off_details = 'Front counter' where id = current_setting('t.order')::bigint;

select fulfilment, drop_off_details from public.orders where id = current_setting('t.order')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: an OLDER delivery order (made before Step 41, so no drop-off
--          details) can still change status. (We imitate one by clearing the
--          details as the SQL Editor's owner.)
-- EXPECT: 1 row: changed true, status IN_PROGRESS, drop_off_details (null).
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.place(p_req uuid, p_fulfilment text, p_drop_off text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, p_fulfilment,
    case when p_fulfilment = 'DELIVERY'
      then (select id from public.delivery_locations where is_active order by sort_order limit 1) end,
    now() + interval '30 minutes', false, 220,
    case when p_fulfilment = 'DELIVERY' then 200 else 0 end,
    'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
      'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
    p_drop_off)
$$;
-- ===== SETUP END =====

select set_config('t.order', pg_temp.place('28282828-2828-4828-8828-282828282805', 'DELIVERY', 'Old order test')::text, true);
update public.orders set drop_off_details = null where id = current_setting('t.order')::bigint;

select set_config('t.changed', public.change_order_status(current_setting('t.order')::bigint, 'PENDING', 'IN_PROGRESS',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), false)::text, true);

select current_setting('t.changed') as changed, status, drop_off_details
  from public.orders where id = current_setting('t.order')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: who can READ the details. The order is assigned to the FIRST
--          driver. Then we look as: the assigned driver, the OTHER driver,
--          counter staff, the customer who ordered, and ANOTHER customer.
-- EXPECT: 1 row:
--   assigned_driver  "Chancellor Hall, Block B"
--   other_driver     (empty: can't see the order)
--   counter_staff    "Chancellor Hall, Block B"
--   own_customer     "Chancellor Hall, Block B"
--   other_customer   (empty)
-- -----------------------------------------------------------------------------
begin;

-- ===== SETUP =====
create function pg_temp.place(p_req uuid, p_fulfilment text, p_drop_off text)
returns bigint language sql as $$
  select public.create_order(
    (select id from public.profiles where role = 'customer' order by created_at limit 1),
    p_req, p_fulfilment,
    case when p_fulfilment = 'DELIVERY'
      then (select id from public.delivery_locations where is_active order by sort_order limit 1) end,
    now() + interval '30 minutes', false, 220,
    case when p_fulfilment = 'DELIVERY' then 200 else 0 end,
    'CASH',
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
      'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
      'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)),
    p_drop_off)
$$;
-- ===== SETUP END =====

select set_config('t.order', pg_temp.place('28282828-2828-4828-8828-282828282806', 'DELIVERY', 'Chancellor Hall, Block B')::text, true);
select public.assign_delivery(current_setting('t.order')::bigint, null,
  (select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1),
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1));

-- Look as each person in turn ("reset role" = back to the SQL Editor's own role).
create function pg_temp.look_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.look_as((select id from public.profiles where role = 'delivery_personnel' order by created_at limit 1));
set local role authenticated;
select set_config('t.driver1', coalesce((select drop_off_details from public.orders where id = current_setting('t.order')::bigint), ''), true);
reset role;

select pg_temp.look_as((select id from public.profiles where role = 'delivery_personnel' order by created_at offset 1 limit 1));
set local role authenticated;
select set_config('t.driver2', coalesce((select drop_off_details from public.orders where id = current_setting('t.order')::bigint), ''), true);
reset role;

select pg_temp.look_as((select id from public.profiles where role = 'counter_staff' order by created_at limit 1));
set local role authenticated;
select set_config('t.staff', coalesce((select drop_off_details from public.orders where id = current_setting('t.order')::bigint), ''), true);
reset role;

select pg_temp.look_as((select id from public.profiles where role = 'customer' order by created_at limit 1));
set local role authenticated;
select set_config('t.own', coalesce((select drop_off_details from public.orders where id = current_setting('t.order')::bigint), ''), true);
reset role;

select pg_temp.look_as((select id from public.profiles where role = 'customer' order by created_at offset 1 limit 1));
set local role authenticated;
select set_config('t.other', coalesce((select drop_off_details from public.orders where id = current_setting('t.order')::bigint), ''), true);
reset role;

select current_setting('t.driver1') as assigned_driver, current_setting('t.driver2') as other_driver,
       current_setting('t.staff') as counter_staff, current_setting('t.own') as own_customer,
       current_setting('t.other') as other_customer;

rollback;
