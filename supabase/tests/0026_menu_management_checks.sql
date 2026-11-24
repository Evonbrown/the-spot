-- =============================================================================
-- supabase/tests/0026_menu_management_checks.sql
--
-- WHAT: Manual checks for migration 0026_menu_management.sql (Step 40a): the
--       Manager can add, change and remove ("archive") menu items with their
--       OWN login; others can't; an ordered item can't be deleted (so the app
--       hides it); and the tidiness rules.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks marked "SHOULD FAIL" are supposed to give the error shown. Every
--   block ends with "rollback", so nothing is left behind.
--
-- NEEDS: a 'manager', a 'counter_staff' and a 'customer' profile, and the
--   menu (with "Pepsi").
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: the MANAGER (logged in as them) adds an item, changes its price
--          and ingredients, then archives it.
-- EXPECT: 1 row: name "Test Jerk Pork", price_large 1600, ingredients
--         "Pork, scallion, pimento", allergens null (not confirmed),
--         is_archived true.
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'manager' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.menu_items (name, description, price_medium, price_large, category, allergens, sort_order)
values ('Test Jerk Pork', 'Test item', 1200, 1500, 'Pork & Beef', null, 9999);

update public.menu_items
   set price_large = 1600, ingredients = 'Pork, scallion, pimento'
 where name = 'Test Jerk Pork';
update public.menu_items set is_archived = true where name = 'Test Jerk Pork';

select name, price_large, ingredients, allergens, is_archived
  from public.menu_items where name = 'Test Jerk Pork';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: SHOULD FAIL. Counter staff can't add menu items (Manager only).
-- EXPECT: an ERROR: new row violates row-level security policy for table
--         "menu_items".
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.menu_items (name, price, category) values ('Sneaky item', 100, 'Sodas');

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: a CUSTOMER's change or delete simply changes NOTHING (RLS hides the
--          rows from them for writing).
-- EXPECT: 1 row: updated 0, deleted 0.
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'customer' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

with u as (update public.menu_items set price = 1 where name = 'Pepsi' returning 1)
select set_config('t.updated', (select count(*) from u)::text, true);
with d as (delete from public.menu_items where name = 'Pepsi' returning 1)
select set_config('t.deleted', (select count(*) from d)::text, true);

select current_setting('t.updated') as updated, current_setting('t.deleted') as deleted;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: SHOULD FAIL. An item that has been ORDERED can't be deleted, even
--          by the Manager: old orders point at it. (The app then hides it with
--          is_archived = true instead.)
-- EXPECT: an ERROR: update or delete on table "menu_items" violates foreign key
--         constraint ... on table "order_items".
-- -----------------------------------------------------------------------------
begin;

-- One test order with Pepsi, so Pepsi has been "ordered".
select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '26262626-2626-4626-8626-262626262601', 'PICKUP', null, now() + interval '30 minutes', false,
  220, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Pepsi'),
    'item_name', 'Pepsi', 'size', null, 'unit_price', 220,
    'quantity', 1, 'note', '', 'line_total', 220, 'extras', '[]'::jsonb)));

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'manager' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

delete from public.menu_items where name = 'Pepsi';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: an item that was NEVER ordered can really be deleted (Manager).
-- EXPECT: 1 row: deleted 1, still_there 0.
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'manager' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.menu_items (name, price, category, sort_order) values ('Test Never Ordered', 150, 'Sodas', 9999);
with d as (delete from public.menu_items where name = 'Test Never Ordered' returning 1)
select set_config('t.deleted', (select count(*) from d)::text, true);

select current_setting('t.deleted') as deleted,
       (select count(*) from public.menu_items where name = 'Test Never Ordered') as still_there;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: SHOULD FAIL. A blank name isn't allowed.
-- EXPECT: an ERROR: new row for relation "menu_items" violates check constraint
--         "menu_items_name_length".
-- -----------------------------------------------------------------------------
begin;

insert into public.menu_items (name, price, category) values ('   ', 100, 'Sodas');

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: SHOULD FAIL. An item can't have a single price AND sizes (0003).
-- EXPECT: an ERROR: new row for relation "menu_items" violates check constraint
--         "menu_items_one_pricing_style".
-- -----------------------------------------------------------------------------
begin;

insert into public.menu_items (name, price, price_large, category) values ('Test Both', 100, 900, 'Chicken');

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 8: the new columns on existing items: ingredients empty, nothing
--          archived yet.
-- EXPECT: 1 row: items (your menu's count, e.g. 56), with_ingredients 0,
--         archived 0.
-- -----------------------------------------------------------------------------
begin;

select count(*) as items,
       count(*) filter (where ingredients <> '') as with_ingredients,
       count(*) filter (where is_archived) as archived
  from public.menu_items;

rollback;
