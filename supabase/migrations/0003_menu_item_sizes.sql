-- =============================================================================
-- supabase/migrations/0003_menu_item_sizes.sql
--
-- WHAT: Lets a menu item have Small / Medium / Large prices, and lets
--       "allergens" mean "not confirmed yet".
--
-- LAYER: Data layer (Supabase Postgres). Changes the existing menu_items table.
--
-- WHY:
--   - The real menu board (the-spot-real-menu.md) sells food in up to 3 sizes
--     with different prices, e.g. Fry Chicken 750 / 950 / 1200. Some dishes
--     only come in some sizes (Fish: Large only).
--   - Decision "Option C": store the size prices as extra COLUMNS on MenuItem.
--     No new table or class (keeps our SDS class names), and each dish stays ONE
--     row, so its description and allergens are written once, not 3 times.
--   - SAF-2: allergens for the real dishes are not known yet. Showing
--     "None listed" would be unsafe, so NULL now means "not confirmed".
--
-- HOW TO RUN: SQL Editor -> New query -> paste this whole file -> Run. ONCE.
--      The 8 sample items keep working: they all have a single "price".
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Add the three size prices.
--    Same exact money type as "price" (numeric(10,2), never float), and the
--    same "no negative prices" rule. An empty (NULL) size = not offered.
-- -----------------------------------------------------------------------------
alter table public.menu_items
  add column price_small  numeric(10, 2)
    constraint menu_items_price_small_not_negative  check (price_small >= 0),
  add column price_medium numeric(10, 2)
    constraint menu_items_price_medium_not_negative check (price_medium >= 0),
  add column price_large  numeric(10, 2)
    constraint menu_items_price_large_not_negative  check (price_large >= 0);


-- -----------------------------------------------------------------------------
-- 2. "price" is now only for SINGLE-price items (e.g. drinks), so it may be
--    empty for sized items (e.g. Fry Chicken).
--    The "price >= 0" rule from 0002 still applies whenever price is filled in.
-- -----------------------------------------------------------------------------
alter table public.menu_items
  alter column price drop not null;


-- -----------------------------------------------------------------------------
-- 3. Each item must use EXACTLY ONE pricing style:
--      single price: price filled in, all 3 size prices empty   (Pepsi: 220)
--      sized:        price empty, at least 1 size price filled  (Fish: Large 1500)
--    This stops two mistakes: an item with NO price at all (it couldn't be
--    ordered), and an item with BOTH styles (which price would we charge?).
--    The database refuses any row that breaks this rule, even from a manager.
-- -----------------------------------------------------------------------------
alter table public.menu_items
  add constraint menu_items_one_pricing_style check (
    (
      price is not null
      and price_small is null and price_medium is null and price_large is null
    )
    or
    (
      price is null
      and (price_small is not null or price_medium is not null or price_large is not null)
    )
  );


-- -----------------------------------------------------------------------------
-- 4. Allergens (SAF-2):
--      NULL         = NOT CONFIRMED yet -> the menu says "ask at the counter".
--      '{}' (empty) = confirmed: no allergens.
--      '{Fish}'     = confirmed allergens.
--    We also remove the old default of '{}', so a NEW item starts as "not
--    confirmed" unless someone enters its allergens. Safer to say "ask" than to
--    wrongly say "none".
-- -----------------------------------------------------------------------------
alter table public.menu_items
  alter column allergens drop not null,
  alter column allergens drop default;
