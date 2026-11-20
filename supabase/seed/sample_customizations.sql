-- =============================================================================
-- supabase/seed/sample_customizations.sql
--
-- WHAT: Adds 7 SAMPLE extras (4 sides, 3 sauces) to the customizations table.
--
-- LAYER: Data layer (starting content, not structure).
--
-- WHY SAMPLES? We don't know The Spot's real extras or prices yet. FR-02 still
--      needs some to build and test the options panel and the cart. Every name
--      ends in "(Sample)" so customers and testers can see they aren't real.
--      The Manager will replace them with the real ones (Table Editor now,
--      the Manager screen in Build step 7).
--
-- LEFT OUT ON PURPOSE: a fries side. Fries are made-to-order, so choosing them
--      would have to trigger the 15-minute lead time (FR-01). We'll only add
--      that rule if the client's real extras include fries.
--
-- HOW TO RUN: AFTER 0004_customizations.sql. SQL Editor -> New query -> paste
--      -> Run. Safe to run again: it empties the table first (inside one
--      transaction, so it's all-or-nothing, like real_menu_items.sql).
-- =============================================================================

begin;

-- Empty the table and restart ids at 1. Safe now because no orders use
-- customizations yet. Once orders exist (Build step 3), Postgres will refuse
-- this, which protects order history.
truncate table public.customizations restart identity;

insert into public.customizations (name, kind, extra_price, is_available, sort_order)
values
  -- Sides -------------------------------------------------------------------
  ('Extra rice & peas (Sample)', 'side',  200.00, true, 10),
  ('Coleslaw (Sample)',          'side',  150.00, true, 20),
  ('Festival (Sample)',          'side',  150.00, true, 30),
  ('Plantain (Sample)',          'side',  150.00, true, 40),

  -- Sauces ------------------------------------------------------------------
  ('Extra gravy (Sample)',       'sauce',  50.00, true, 110),
  ('Jerk sauce (Sample)',        'sauce',  50.00, true, 120),
  ('Pepper sauce (Sample)',      'sauce',   0.00, true, 130);  -- 0 = shown as "Free"

commit;
