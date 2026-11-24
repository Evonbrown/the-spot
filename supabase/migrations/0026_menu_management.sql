-- =============================================================================
-- supabase/migrations/0026_menu_management.sql   (Build step 8, Step 40a)
--
-- WHAT: What the Manager's "Menu" screen needs (SRS QA-3 Maintainability:
--       "menu items, prices and delivery locations editable by the Manager
--       without code changes"; SAF-2: ingredients and allergens):
--         1. menu_items.ingredients: what's in it (shown on the menu when
--            filled in; empty = not given);
--         2. menu_items.is_archived: "REMOVED from the menu". Different from
--            is_available ("not today"): an archived item is never shown to
--            customers, but it stays in the table so OLD ORDERS and reports
--            that point at it keep working;
--         3. tidiness rules: names and categories can't be blank, and texts
--            have a maximum length.
--
-- LAYER: Data layer (Supabase Postgres).
--
-- NO NEW PERMISSIONS NEEDED: the Manager may already add, change and delete
--   menu items, and everyone else may only read them (RLS, migration 0002).
--   The Manager's screen saves with the Manager's OWN login.
--
-- WHY "HIDE" INSTEAD OF DELETE? order_items points at menu_items (0006). The
--   database REFUSES to delete an item that has been ordered (error 23503,
--   "foreign key violation"), which protects old orders. The app then sets
--   is_archived = true instead.
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0026_menu_management_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. + 2. The new columns.
-- -----------------------------------------------------------------------------
alter table public.menu_items
  add column ingredients text not null default '',
  add column is_archived boolean not null default false;


-- -----------------------------------------------------------------------------
-- 3. Tidiness rules (the server checks the same limits first and shows a
--    friendly message; these make sure nothing else can save bad values).
--    btrim(...) = without spaces at the start / end.
-- -----------------------------------------------------------------------------
alter table public.menu_items
  add constraint menu_items_name_length
    check (char_length(btrim(name)) between 1 and 80),
  add constraint menu_items_category_length
    check (char_length(btrim(category)) between 1 and 40),
  add constraint menu_items_description_length
    check (char_length(description) <= 500),
  add constraint menu_items_ingredients_length
    check (char_length(ingredients) <= 500),
  add constraint menu_items_allergens_count
    check (allergens is null or cardinality(allergens) <= 15);


-- Quick look-up of the items still on the menu (the customer menu reads only those).
create index menu_items_on_menu_idx on public.menu_items (sort_order) where not is_archived;
