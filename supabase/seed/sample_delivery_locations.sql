-- =============================================================================
-- supabase/seed/sample_delivery_locations.sql
--
-- WHAT: Adds The Spot's 3 delivery locations (FR-01), each with a SAMPLE
--       delivery fee of J$200.
--
-- LAYER: Data layer (starting content, not structure).
--
-- WHY SAMPLE? The real delivery fee isn't known yet. fee_confirmed = false
--      makes the checkout page show "(sample, not final)" next to the fee.
--      When the client gives the real fee, the Manager edits delivery_fee and
--      sets fee_confirmed = true (Table Editor now, Manager screen in step 7).
--      The location NAMES are real (from the SRS); only the fee is a sample.
--
-- HOW TO RUN: AFTER 0005_delivery_locations.sql. SQL Editor -> New query ->
--      paste -> Run. Safe to run again: it empties the table first, in one
--      all-or-nothing transaction.
-- =============================================================================

begin;

-- Empty the table and restart ids at 1. Safe now because no orders point at
-- delivery locations yet. Once orders exist (Part 19+), Postgres will refuse
-- this, which protects order history.
truncate table public.delivery_locations restart identity;

insert into public.delivery_locations (name, delivery_fee, fee_confirmed, is_active, sort_order)
values
  ('UWI Mona',     200.00, false, true, 10),  -- SAMPLE fee
  ('UTech',        200.00, false, true, 20),  -- SAMPLE fee
  ('UWI Hospital', 200.00, false, true, 30);  -- SAMPLE fee

commit;
