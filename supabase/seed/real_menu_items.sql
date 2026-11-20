-- =============================================================================
-- supabase/seed/real_menu_items.sql
--
-- WHAT: Replaces whatever is in menu_items with The Spot's REAL menu, copied
--       from photos of the menu boards (see the-spot-real-menu.md, Nov 2026).
--       16 food items (sized) + 40 drinks (single price) = 56 items.
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
--   - sort_order follows the board, in steps of 10 (food 10, 20, ...; drinks
--     1010, 1020, ...). The gaps let the Manager slot a new item in between
--     later without renumbering everything.
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
  ('Fry Chicken',        '', 'Food',  750.00,  950.00, 1200.00, null, true,  false, false,  10),
  ('Bar-B-Fry Chicken',  '', 'Food',  750.00,  950.00, 1200.00, null, true,  false, false,  20),
  ('Brown Stew Chicken', '', 'Food',  750.00,  950.00, 1200.00, null, true,  false, false,  30),
  ('Stew Beef',          '', 'Food',    null, 1100.00, 1350.00, null, true,  false, false,  40),
  ('Stew Pork',          '', 'Food',    null, 1100.00, 1350.00, null, true,  false, false,  50),
  -- Medium was changed on the board from 1200 to 1250.
  -- Large is UNCONFIRMED: the board is hard to read (1500 or 1600). Check with the client.
  ('Curry Goat',         '', 'Food',    null, 1250.00, 1500.00, null, true,  false, false,  60),
  ('Cow Foot',           '', 'Food',    null, 1000.00, 1250.00, null, true,  false, false,  70),
  ('Fish',               '', 'Food',    null,    null, 1500.00, null, true,  false, false,  80),
  -- Daily specials: unavailable until the Manager switches them on for their day.
  ('Oxtail',    'Thursdays only',  'Food', null,    null, 1800.00, null, false, true, false,  90),
  ('Stew Peas', 'Wednesdays only', 'Food', null, 1100.00, 1300.00, null, false, true, false, 100),
  -- Made-to-order (fries): a pickup order with it needs at least 15 min (FR-01).
  ('Chicken & Fries',    '', 'Food',    null, 1150.00, 1400.00, null, true,  false, true,  110),
  ('Beef Mix Chicken',   '', 'Food',    null,    null, 1550.00, null, true,  false, false, 120),
  ('Pork Mix Chicken',   '', 'Food',    null,    null, 1550.00, null, true,  false, false, 130),
  ('Goat Mix Chicken',   '', 'Food',    null,    null, 1650.00, null, true,  false, false, 140),
  ('Fish Mix Chicken',   '', 'Food',    null,    null, 1650.00, null, true,  false, false, 150),
  ('Barbeque Pig Tail',  '', 'Food',    null, 1200.00, 1400.00, null, true,  false, false, 160);


-- -----------------------------------------------------------------------------
-- DRINKS: single price. The size columns stay NULL.
-- Drinks sold in two sizes are separate items, exactly as the board lists them.
-- is_available = false marks the alcohol items (not sold online for now).
-- -----------------------------------------------------------------------------
insert into public.menu_items
  (name, description, category, price,
   allergens, is_available, is_daily_special, is_made_to_order, sort_order)
values
  ('Pepsi',                 '', 'Drinks',  220.00, null, true,  false, false, 1010),
  ('D&G Soda',              '', 'Drinks',  220.00, null, true,  false, false, 1020),
  ('Ting',                  '', 'Drinks',  220.00, null, true,  false, false, 1030),
  ('Ginger Beer',           '', 'Drinks',  220.00, null, true,  false, false, 1040),
  ('Tropics',               '', 'Drinks',  220.00, null, true,  false, false, 1050),
  ('Bigga Soda',            '', 'Drinks',  200.00, null, true,  false, false, 1060),
  ('Schweppes (Large)',     '', 'Drinks',  220.00, null, true,  false, false, 1070),
  ('Minute Maid',           '', 'Drinks',  220.00, null, true,  false, false, 1080),
  ('Sparkling Water',       '', 'Drinks',  220.00, null, true,  false, false, 1090),
  ('Squeeze (Large)',       '', 'Drinks',  180.00, null, true,  false, false, 1100),
  ('Squeeze (Small)',       '', 'Drinks',  130.00, null, true,  false, false, 1110),
  ('Cran Wata',             '', 'Drinks',  170.00, null, true,  false, false, 1120),
  ('Sprite (Large)',        '', 'Drinks',  220.00, null, true,  false, false, 1130),
  ('Sprite (Small)',        '', 'Drinks',  130.00, null, true,  false, false, 1140),
  ('Water (1.5L)',          '', 'Drinks',  200.00, null, true,  false, false, 1150),
  ('Water (600ml)',         '', 'Drinks',  130.00, null, true,  false, false, 1160),
  ('Ocean Splash (Small)',  '', 'Drinks',  170.00, null, true,  false, false, 1170),
  ('Ocean Splash (Large)',  '', 'Drinks',  320.00, null, true,  false, false, 1180),
  ('Arizona',               '', 'Drinks',  450.00, null, true,  false, false, 1190), -- changed from 400
  ('I Kool Water (500ml)',  '', 'Drinks',  100.00, null, true,  false, false, 1200),
  ('I Kool Water (1.5L)',   '', 'Drinks',  200.00, null, true,  false, false, 1210),
  ('Zesti',                 '', 'Drinks',  300.00, null, true,  false, false, 1220),
  ('Dragon Stout',          '', 'Drinks',  400.00, null, false, false, false, 1230), -- alcohol
  ('Heineken',              '', 'Drinks',  400.00, null, false, false, false, 1240), -- alcohol
  ('Sorrel Beer',           '', 'Drinks',  400.00, null, false, false, false, 1250), -- alcohol
  ('Red Stripe Beer',       '', 'Drinks',  400.00, null, false, false, false, 1260), -- alcohol
  ('Guinness',              '', 'Drinks',  400.00, null, false, false, false, 1270), -- alcohol
  ('Malta',                 '', 'Drinks',  350.00, null, true,  false, false, 1280),
  ('Smirnoff Ice',          '', 'Drinks',  400.00, null, false, false, false, 1290), -- alcohol
  ('Red Bull',              '', 'Drinks',  500.00, null, true,  false, false, 1300),
  ('Power',                 '', 'Drinks',  220.00, null, true,  false, false, 1310),
  ('Magnum',                '', 'Drinks',  500.00, null, false, false, false, 1320), -- alcohol
  ('Flask Rum',             '', 'Drinks', 1500.00, null, false, false, false, 1330), -- alcohol
  ('Flask Appleton',        '', 'Drinks', 1500.00, null, false, false, false, 1340), -- alcohol
  ('Flask Campari',         '', 'Drinks', 1500.00, null, false, false, false, 1350), -- alcohol
  ('Tropical Rhythm',       '', 'Drinks',  420.00, null, true,  false, false, 1360),
  ('Gatorade',              '', 'Drinks',  350.00, null, true,  false, false, 1370), -- changed from 300
  ('Monster',               '', 'Drinks',  350.00, null, true,  false, false, 1380), -- changed from 250
  ('Red Label Wine',        '', 'Drinks',  370.00, null, false, false, false, 1390), -- alcohol
  ('Cran Juice',            '', 'Drinks',  400.00, null, true,  false, false, 1400);

commit;
