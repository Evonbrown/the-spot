/*
 * src/lib/menu.ts
 *
 * WHAT: Everything the app needs to READ the menu: the MenuItem type,
 *       getMenuItems() (loads items from the menu_items table), a helper that
 *       lists the categories, and formatPrice().
 *
 * LAYER: Application layer. Pages (Presentation) call getMenuItems(); it reads
 *        the menu_items table (Data layer) through the public connection.
 *
 * WHY here and not inside the page? The Menu page and the Home page both need
 * menu items. One shared function means one place to change if the table
 * changes, and both pages always agree.
 */

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

/*
 * The three sizes on The Spot's menu board, in display order.
 */
export type Size = "Small" | "Medium" | "Large";

/*
 * PriceOption: one price a customer can choose for an item.
 *   Sized item (Fry Chicken):  { size: "Small", price: 750 }, { size: "Medium", ... }
 *   Single-price item (Pepsi): { size: null, price: 220 }   (null = no size)
 * This is NOT a new database class: it's just a handy shape for the pages,
 * built from MenuItem's price columns (decision "Option C").
 */
export type PriceOption = {
  size: Size | null;
  price: number; // J$. Stored EXACTLY in the database as numeric(10,2)
};

/*
 * MenuItem: what ONE menu item looks like in our code (SDS class: MenuItem).
 * The database uses snake_case names (is_available); TypeScript code usually
 * uses camelCase (isAvailable). getMenuItems() converts between them, so the
 * rest of the app never has to think about database names.
 */
export type MenuItem = {
  id: number;
  name: string;
  description: string;
  // Always at least 1 option. Only the sizes actually offered are included,
  // in Small -> Medium -> Large order (Fish: just [Large]).
  priceOptions: PriceOption[];
  category: string; // plain text (decision), e.g. "Food"
  // SAF-2: null = NOT CONFIRMED yet ("ask at the counter").
  //        []   = confirmed: no allergens.
  allergens: string[] | null;
  isAvailable: boolean; // FR-01: false = greyed out, cannot be added (instead of stock tracking)
  isDailySpecial: boolean; // FR-01: daily specials are highlighted
  isMadeToOrder: boolean; // FR-01: e.g. fries. Pickup with one needs at least 15 min
};

/*
 * MenuItemRow: what one row looks like when it comes back FROM the database.
 * Used only inside this file, for the conversion below.
 * Prices may be null (a size not offered, or "price" on a sized item).
 */
type MenuItemRow = {
  id: number;
  name: string;
  description: string;
  price: number | string | null;
  price_small: number | string | null;
  price_medium: number | string | null;
  price_large: number | string | null;
  category: string;
  allergens: string[] | null;
  is_available: boolean;
  is_daily_special: boolean;
  is_made_to_order: boolean;
};

/*
 * toPriceOptions(row)
 * Turns the 4 price columns of one row into a simple list.
 *   price 220, sizes empty           -> [{ size: null, price: 220 }]
 *   price empty, medium 1100, large 1350
 *                                    -> [{ Medium, 1100 }, { Large, 1350 }]
 * The database rule menu_items_one_pricing_style (0003) guarantees a row is
 * one style or the other and never has no price at all.
 * Number(...) makes sure each price is a number even if it arrives as text
 * ("1200.00"), which can happen with exact numeric columns.
 */
function toPriceOptions(row: MenuItemRow): PriceOption[] {
  if (row.price !== null) {
    return [{ size: null, price: Number(row.price) }];
  }

  const sizes: [Size, number | string | null][] = [
    ["Small", row.price_small],
    ["Medium", row.price_medium],
    ["Large", row.price_large],
  ];

  return sizes
    .filter(([, price]) => price !== null) // keep only the sizes offered
    .map(([size, price]) => ({ size, price: Number(price) }));
}

/*
 * getMenuItems()
 * Returns ALL menu items (available and unavailable) in sort_order.
 * Unavailable items are included on purpose: FR-01 says they are shown greyed
 * out, not hidden.
 *
 * CACHING (PR-1: menu loads within 3 s; PR-3: 100 customers at lunch):
 *   'use cache'          = Next.js keeps a saved copy of the result, so most
 *                          visits don't need a database query at all.
 *   cacheLife("minutes") = the saved copy is refreshed about every minute, so a
 *                          change in the database shows up within ~1 minute.
 *                          That's safe: at checkout (Build step 3) the server
 *                          re-checks prices and availability anyway.
 *   cacheTag("menu")     = a label on the saved copy. Later, when the Manager
 *                          edits an item in the app (Build step 7), we can throw
 *                          away the "menu" copy immediately.
 *
 * If the database can't be reached, this THROWS an error. A thrown error is not
 * saved in the cache, so the next visit tries again. The pages catch it and
 * show a friendly message.
 */
export async function getMenuItems(): Promise<MenuItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("menu");

  const supabase = createPublicClient();

  // SELECT the columns we need, ordered by sort_order (then id, as a tie-break).
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      "id, name, description, price, price_small, price_medium, price_large, category, allergens, is_available, is_daily_special, is_made_to_order"
    )
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    // Logged on the server (in the terminal), never shown to customers.
    console.error("getMenuItems failed:", error.message);
    throw new Error("Could not load the menu.");
  }

  // Convert each database row (snake_case) into our MenuItem (camelCase).
  return (data as MenuItemRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    priceOptions: toPriceOptions(row),
    category: row.category,
    allergens: row.allergens,
    isAvailable: row.is_available,
    isDailySpecial: row.is_daily_special,
    isMadeToOrder: row.is_made_to_order,
  }));
}

/*
 * getCategories(items)
 * Lists each category once, in the order it first appears (items are already
 * in sort_order). Example: ["Meals", "Sides", "Drinks"].
 * WHY build it from the data? Category is plain text, so if the Manager adds a
 * "Desserts" item, a "Desserts" section appears with no code change
 * (Maintainability).
 */
export function getCategories(items: MenuItem[]): string[] {
  // A Set keeps only unique values, in the order they were added.
  return [...new Set(items.map((item) => item.category))];
}

/*
 * formatPrice(1200) -> "J$1,200"   formatPrice(99.5) -> "J$99.50"
 * One shared function, so every price on the site looks the same.
 * Whole-dollar prices show no cents; other prices always show 2 decimal places.
 */
export function formatPrice(price: number): string {
  const hasCents = !Number.isInteger(price);
  return `J$${price.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
