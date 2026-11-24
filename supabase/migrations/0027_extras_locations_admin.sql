-- =============================================================================
-- supabase/migrations/0027_extras_locations_admin.sql   (Build step 8, Step 40b)
--
-- WHAT: What the Manager's "Extras" and "Delivery" tabs need (SRS QA-3:
--       "... and delivery locations editable by the Manager without code
--       changes"):
--         1. customizations.is_archived: an extra REMOVED from the menu but
--            kept, because old orders point at it (the same idea as menu
--            items in 0026);
--         2. tidiness rules: extra and location names can't be blank, and
--            have a maximum length.
--
-- LAYER: Data layer (Supabase Postgres).
--
-- NO NEW PERMISSIONS: the Manager may already add, change and delete extras
--   (0004) and delivery locations (0005); everyone else may only read them.
--
-- DELIVERY LOCATIONS ARE NEVER DELETED in the app: old orders point at them
--   (orders.delivery_location_id, 0006). The Manager switches one OFF
--   (is_active = false) instead, which already hides it at checkout (0005).
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0027_extras_locations_admin_checks.sql block by block.
-- =============================================================================

alter table public.customizations
  add column is_archived boolean not null default false;

alter table public.customizations
  add constraint customizations_name_length check (char_length(btrim(name)) between 1 and 60);

alter table public.delivery_locations
  add constraint delivery_locations_name_length check (char_length(btrim(name)) between 1 and 60);
