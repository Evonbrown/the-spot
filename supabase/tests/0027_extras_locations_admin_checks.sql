-- =============================================================================
-- supabase/tests/0027_extras_locations_admin_checks.sql
--
-- WHAT: Manual checks for migration 0027_extras_locations_admin.sql (Step 40b):
--       the Manager edits extras and delivery locations with their OWN login;
--       others can't; a used extra / location can't be deleted (so the app
--       hides / switches it off); names must be unique and not blank.
--
-- HOW TO USE: Supabase SQL Editor. Paste this file, then HIGHLIGHT ONE BLOCK
--   (from "begin;" to "rollback;") and press Run, one block at a time.
--   Blocks marked "SHOULD FAIL" are supposed to give the error shown. Every
--   block ends with "rollback", so nothing is left behind.
--
-- NEEDS: a 'manager', a 'counter_staff' and a 'customer' profile, the menu
--   (with "Fry Chicken" and "Pepsi"), at least one extra and one active
--   delivery location.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCK 1: the MANAGER adds an extra, renames it (e.g. dropping "(Sample)"),
--          changes its price and archives it; adds a delivery location,
--          confirms its fee and switches it off.
-- EXPECT: 2 rows:
--   extra     "Test Gravy"   price 150   archived/off true
--   location  "Test Campus"  fee 300     confirmed true, archived/off true
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'manager' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.customizations (name, kind, extra_price, sort_order) values ('Test Gravy (Sample)', 'sauce', 100, 9999);
update public.customizations set name = 'Test Gravy', extra_price = 150 where name = 'Test Gravy (Sample)';
update public.customizations set is_archived = true where name = 'Test Gravy';

insert into public.delivery_locations (name, delivery_fee, sort_order) values ('Test Campus', 250, 9999);
update public.delivery_locations set delivery_fee = 300, fee_confirmed = true where name = 'Test Campus';
update public.delivery_locations set is_active = false where name = 'Test Campus';

select 'extra' as what, name, extra_price as price, null::boolean as confirmed, is_archived as archived_or_off
  from public.customizations where name = 'Test Gravy'
union all
select 'location', name, delivery_fee, fee_confirmed, not is_active
  from public.delivery_locations where name = 'Test Campus';

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 2: SHOULD FAIL. Counter staff can't add extras (Manager only).
-- EXPECT: an ERROR: new row violates row-level security policy for table
--         "customizations".
--         (Swap to the commented-out line: the same error for
--          "delivery_locations".)
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'counter_staff' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.customizations (name, kind, extra_price) values ('Sneaky sauce', 'sauce', 0);
-- insert into public.delivery_locations (name, delivery_fee) values ('Sneaky place', 0);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 3: a CUSTOMER's changes simply change NOTHING (RLS).
-- EXPECT: 1 row: extras_updated 0, locations_updated 0.
-- -----------------------------------------------------------------------------
begin;

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'customer' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

with u as (update public.customizations set extra_price = 0 returning 1)
select set_config('t.extras', (select count(*) from u)::text, true);
with u as (update public.delivery_locations set delivery_fee = 0 returning 1)
select set_config('t.locations', (select count(*) from u)::text, true);

select current_setting('t.extras') as extras_updated, current_setting('t.locations') as locations_updated;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 4: SHOULD FAIL. An extra that has been ORDERED can't be deleted (old
--          orders point at it), even by the Manager. (The app hides it.)
-- EXPECT: an ERROR: update or delete on table "customizations" violates
--         foreign key constraint ... on table "order_item_customizations".
-- -----------------------------------------------------------------------------
begin;

-- A test order: Fry Chicken (Large) with the first extra.
select set_config('t.extra', (select id from public.customizations order by sort_order, id limit 1)::text, true);
select public.create_order(
  (select id from public.profiles where role = 'customer' order by created_at limit 1),
  '27272727-2727-4727-8727-272727272701', 'PICKUP', null, now() + interval '30 minutes', false,
  1300, 0, 'CASH',
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from public.menu_items where name = 'Fry Chicken'),
    'item_name', 'Fry Chicken', 'size', 'Large', 'unit_price', 1200,
    'quantity', 1, 'note', '', 'line_total', 1300,
    'extras', jsonb_build_array(jsonb_build_object(
      'customization_id', current_setting('t.extra')::bigint, 'customization_name', 'Test extra', 'extra_price', 100)))));

select set_config('request.jwt.claims', json_build_object('sub',
  (select id from public.profiles where role = 'manager' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

delete from public.customizations where id = current_setting('t.extra')::bigint;

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 5: SHOULD FAIL. Two delivery locations can't have the same name.
-- EXPECT: an ERROR: duplicate key value violates unique constraint
--         "delivery_locations_name_unique".
-- -----------------------------------------------------------------------------
begin;

insert into public.delivery_locations (name, delivery_fee)
values ((select name from public.delivery_locations order by sort_order limit 1), 200);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 6: SHOULD FAIL. A blank extra name isn't allowed.
-- EXPECT: an ERROR: new row for relation "customizations" violates check
--         constraint "customizations_name_length".
-- -----------------------------------------------------------------------------
begin;

insert into public.customizations (name, kind, extra_price) values ('  ', 'side', 0);

rollback;


-- -----------------------------------------------------------------------------
-- BLOCK 7: the new column on existing extras: nothing archived yet.
-- EXPECT: 1 row: extras (your count), archived 0.
-- -----------------------------------------------------------------------------
begin;

select count(*) as extras, count(*) filter (where is_archived) as archived from public.customizations;

rollback;
