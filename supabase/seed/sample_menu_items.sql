-- =============================================================================
-- supabase/seed/sample_menu_items.sql
--
-- WHAT: Adds the 8 SAMPLE menu items (the same ones as src/lib/sample-menu.ts)
--       to the menu_items table, so the menu pages have data to show.
--
-- LAYER: Data layer (test data only, not part of the database structure).
--
-- WHY a separate "seed" file? A migration builds the STRUCTURE (tables, rules).
--      Seed data is just starting content. Keeping them apart means we can
--      later replace these made-up items with The Spot's real menu without
--      touching the migration.
--
-- NOTE: These are NOT The Spot's real items or prices (prices in J$).
--
-- HOW TO RUN: AFTER 0002_menu_items.sql. SQL Editor -> New query -> paste ->
--      Run. Run it ONCE, or you will get the 8 items twice.
--      (The SQL Editor runs as the database owner, so RLS does not block it.)
-- =============================================================================

insert into public.menu_items
  (name, description, price, category, allergens,
   is_available, is_daily_special, is_made_to_order, sort_order)
values
  ('Jerk Chicken Meal',
   'Quarter jerk chicken with rice & peas, coleslaw and festival.',
   1200.00, 'Meals', '{Gluten,Milk}', true, true, false, 1),

  ('Curry Goat Meal',
   'Tender curry goat with white rice and steamed vegetables.',
   1500.00, 'Meals', '{}', true, false, false, 2),

  ('Fried Chicken Meal',
   'Two pieces of crispy fried chicken with rice & peas.',
   1100.00, 'Meals', '{Gluten,Egg}', true, false, false, 3),

  -- Unavailable on purpose: shows how a greyed-out item looks (FR-01).
  ('Escovitch Fish Meal',
   'Fried fish topped with pickled peppers and onions, with bammy.',
   1600.00, 'Meals', '{Fish}', false, false, false, 4),

  -- Made to order: a pickup order with fries needs at least 15 min (FR-01).
  ('Seasoned Fries',
   'Fresh-cut fries tossed in our house seasoning.',
   400.00, 'Sides', '{}', true, false, true, 5),

  ('Festival (3 pcs)',
   'Sweet fried dumplings, golden outside and soft inside.',
   250.00, 'Sides', '{Gluten,Milk}', true, false, false, 6),

  ('Fresh Sorrel',
   'Chilled sorrel drink with ginger.',
   300.00, 'Drinks', '{}', true, true, false, 7),

  ('Carrot Juice',
   'Fresh carrot juice blended with milk and nutmeg.',
   350.00, 'Drinks', '{Milk}', true, false, false, 8);
