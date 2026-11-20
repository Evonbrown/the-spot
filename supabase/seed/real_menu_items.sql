-- =============================================================================
-- supabase/seed/real_menu_items.sql
--
-- WHAT: Replaces whatever is in menu_items with The Spot's REAL menu, copied
--       from photos of the menu boards (see the-spot-real-menu.md, Nov 2026).
--       16 food items (sized) + 40 drinks (single price) = 56 items,
--       in 8 categories.
--
-- LAYER: Data layer (starting content, not structure).
--
-- WHY: FR-01 needs the real items and prices. Following the decisions in
--      CLAUDE.md ("Decisions made"), until the client answers our questions:
--   - Left out (no price on the board): Snapper Fish, Boom (Large), Boom
--     (Small), Supligen, True Juice. The database can't store an item without
--     a price (rule menu_items_one_pricing_style).
--   - allergens = NULL for EVERY item -> "please ask at the counter" (SAF-2).
--     Nothing is confirmed yet, so we never claim "None".
--   - Alcohol: listed but is_available = false (online alcohol sales not decided).
--   - Oxtail / Stew Peas: daily specials, start unavailable. The Manager
--     switches is_available on for their day (Thursday / Wednesday).
--   - Only Chicken & Fries is made-to-order (15 min pickup lead time).
--   - Where the board shows a changed price, the NEW price is used.
--
-- CATEGORIES (Usability: order in under 3 minutes). Smaller groups help
--   customers find things fast. The menu page builds its sections from the
--   "category" text, in sort_order, so no code lists these names.
--
-- SORT ORDER: each category has its own block of numbers, in steps of 10:
--     Chicken 110-140, Pork & Beef 210-260, Goat & Fish 310-320, Mixes 410-440,
--     Sodas 1110-1200, Water & Juice 1210-1350, Energy & Sports 1410-1440,
--     Alcohol 1510-1610.
--   Why blocks? The page shows categories in the order their first item
--   appears, so a category's items must sit next to each other. The gaps let
--   the Manager slot a new item in (e.g. 115) without renumbering everything.
--
-- HOW TO RUN: AFTER migrations 0002 and 0003. SQL Editor -> New query ->
--      paste this whole file -> Run. Safe to run again: it empties the table
--      first, so you never get duplicates.
-- =============================================================================


-- "begin ... commit" = a TRANSACTION: all of it happens, or none of it does.
-- If any row breaks a rule (e.g. a typo leaves an item with no price), Postgres
-- cancels everything, so the old menu stays and we never get half a menu.
begin;

-- Empty the table and restart the id numbers at 1.
-- Safe now because no orders point at menu items yet. Once orders exist
-- (Build step 3), Postgres will REFUSE this, which protects order history.
truncate table public.menu_items restart identity;


-- -----------------------------------------------------------------------------
-- FOOD: sized items. "price" stays NULL; a NULL size = not offered.
-- -----------------------------------------------------------------------------
insert into public.menu_items
  (name, description, category, price_small, price_medium, price_large,
   allergens, is_available, is_daily_special, is_made_to_order, sort_order)
values
  -- Chicken -----------------------------------------------------------------
  ('Fry Chicken',        '', 'Chicken',      750.00,  950.00, 1200.00, null, true,  false, false, 110),
  ('Bar-B-Fry Chicken',  '', 'Chicken',      750.00,  950.00, 1200.00, null, true,  false, false, 120),
  ('Brown Stew Chicken', '', 'Chicken',      750.00,  950.00, 1200.00, null, true,  false, false, 130),
  -- Made-to-order (fries): a pickup order with it needs at least 15 min (FR-01).
  ('Chicken & Fries',    '', 'Chicken',        null, 1150.00, 1400.00, null, true,  false, true,  140),

  -- Pork & Beef -------------------------------------------------------------
  ('Stew Beef',          '', 'Pork & Beef',    null, 1100.00, 1350.00, null, true,  false, false, 210),
  ('Stew Pork',          '', 'Pork & Beef',    null, 1100.00, 1350.00, null, true,  false, false, 220),
  ('Cow Foot',           '', 'Pork & Beef',    null, 1000.00, 1250.00, null, true,  false, false, 230),
  -- Daily specials: unavailable until the Manager switches them on for their day.
  ('Oxtail',    'Thursdays only',  'Pork & Beef', null,    null, 1800.00, null, false, true, false, 240),
  ('Stew Peas', 'Wednesdays only', 'Pork & Beef', null, 1100.00, 1300.00, null, false, true, false, 250),
  ('Barbeque Pig Tail',  '', 'Pork & Beef',    null, 1200.00, 1400.00, null, true,  false, false, 260),

  -- Goat & Fish (merged: on their own each would be a 1-item section) --------
  -- Curry Goat: Medium was changed on the board from 1200 to 1250.
  -- Large is UNCONFIRMED: the board is hard to read (1500 or 1600). Check with the client.
  ('Curry Goat',         '', 'Goat & Fish',    null, 1250.00, 1500.00, null, true,  false, false, 310),
  ('Fish',               '', 'Goat & Fish',    null,    null, 1500.00, null, true,  false, false, 320),

  -- Mixes -------------------------------------------------------------------
  ('Beef Mix Chicken',   '', 'Mixes',          null,    null, 1550.00, null, true,  false, false, 410),
  ('Pork Mix Chicken',   '', 'Mixes',          null,    null, 1550.00, null, true,  false, false, 420),
  ('Goat Mix Chicken',   '', 'Mixes',          null,    null, 1650.00, null, true,  false, false, 430),
  ('Fish Mix Chicken',   '', 'Mixes',          null,    null, 1650.00, null, true,  false, false, 440);


-- -----------------------------------------------------------------------------
-- DRINKS: single price. The size columns stay NULL.
-- Drinks sold in two sizes are separate items, exactly as the board lists them.
-- -----------------------------------------------------------------------------
insert into public.menu_items
  (name, description, category, price,
   allergens, is_available, is_daily_special, is_made_to_order, sort_order)
values
  -- Sodas -------------------------------------------------------------------
  ('Pepsi',                 '', 'Sodas',            220.00, null, true,  false, false, 1110),
  ('D&G Soda',              '', 'Sodas',            220.00, null, true,  false, false, 1120),
  ('Ting',                  '', 'Sodas',            220.00, null, true,  false, false, 1130),
  ('Ginger Beer',           '', 'Sodas',            220.00, null, true,  false, false, 1140),
  ('Bigga Soda',            '', 'Sodas',            200.00, null, true,  false, false, 1150),
  ('Schweppes (Large)',     '', 'Sodas',            220.00, null, true,  false, false, 1160),
  ('Sprite (Large)',        '', 'Sodas',            220.00, null, true,  false, false, 1170),
  ('Sprite (Small)',        '', 'Sodas',            130.00, null, true,  false, false, 1180),
  ('Malta',                 '', 'Sodas',            350.00, null, true,  false, false, 1190),
  ('Zesti',                 '', 'Sodas',            300.00, null, true,  false, false, 1200),

  -- Water & Juice -----------------------------------------------------------
  ('Water (1.5L)',          '', 'Water & Juice',    200.00, null, true,  false, false, 1210),
  ('Water (600ml)',         '', 'Water & Juice',    130.00, null, true,  false, false, 1220),
  ('I Kool Water (1.5L)',   '', 'Water & Juice',    200.00, null, true,  false, false, 1230),
  ('I Kool Water (500ml)',  '', 'Water & Juice',    100.00, null, true,  false, false, 1240),
  ('Sparkling Water',       '', 'Water & Juice',    220.00, null, true,  false, false, 1250),
  ('Minute Maid',           '', 'Water & Juice',    220.00, null, true,  false, false, 1260),
  ('Squeeze (Large)',       '', 'Water & Juice',    180.00, null, true,  false, false, 1270),
  ('Squeeze (Small)',       '', 'Water & Juice',    130.00, null, true,  false, false, 1280),
  ('Ocean Splash (Large)',  '', 'Water & Juice',    320.00, null, true,  false, false, 1290),
  ('Ocean Splash (Small)',  '', 'Water & Juice',    170.00, null, true,  false, false, 1300),
  ('Arizona',               '', 'Water & Juice',    450.00, null, true,  false, false, 1310), -- changed from 400
  ('Cran Juice',            '', 'Water & Juice',    400.00, null, true,  false, false, 1320),
  ('Cran Wata',             '', 'Water & Juice',    170.00, null, true,  false, false, 1330),
  ('Tropical Rhythm',       '', 'Water & Juice',    420.00, null, true,  false, false, 1340),
  ('Tropics',               '', 'Water & Juice',    220.00, null, true,  false, false, 1350),

  -- Energy & Sports ---------------------------------------------------------
  ('Red Bull',              '', 'Energy & Sports',  500.00, null, true,  false, false, 1410),
  ('Monster',               '', 'Energy & Sports',  350.00, null, true,  false, false, 1420), -- changed from 250
  ('Gatorade',              '', 'Energy & Sports',  350.00, null, true,  false, false, 1430), -- changed from 300
  ('Power',                 '', 'Energy & Sports',  220.00, null, true,  false, false, 1440),

  -- Alcohol: listed but unavailable (online alcohol sales not decided) -------
  ('Red Stripe Beer',       '', 'Alcohol',          400.00, null, false, false, false, 1510),
  ('Heineken',              '', 'Alcohol',          400.00, null, false, false, false, 1520),
  ('Guinness',              '', 'Alcohol',          400.00, null, false, false, false, 1530),
  ('Dragon Stout',          '', 'Alcohol',          400.00, null, false, false, false, 1540),
  ('Sorrel Beer',           '', 'Alcohol',          400.00, null, false, false, false, 1550),
  ('Smirnoff Ice',          '', 'Alcohol',          400.00, null, false, false, false, 1560),
  ('Magnum',                '', 'Alcohol',          500.00, null, false, false, false, 1570),
  ('Red Label Wine',        '', 'Alcohol',          370.00, null, false, false, false, 1580),
  ('Flask Rum',             '', 'Alcohol',         1500.00, null, false, false, false, 1590),
  ('Flask Appleton',        '', 'Alcohol',         1500.00, null, false, false, false, 1600),
  ('Flask Campari',         '', 'Alcohol',         1500.00, null, false, false, false, 1610);

commit;
