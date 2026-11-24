/*
 * src/lib/menu.ts   (SERVER ONLY)
 *
 * WHAT: getMenuItems(): loads all menu items from the menu_items table.
 *
 * LAYER: Application layer. Pages (Presentation) call getMenuItems(); it reads
 *        the menu_items table (Data layer) through the public connection.
 *
 * WHY here and not inside the page? The Menu page and the Home page both need
 * menu items. One shared function means one place to change if the table
 * changes, and both pages always agree.
 *
 * SERVER ONLY: this file uses 'use cache' and the database, so it must never
 * be imported by browser code ("use client" components). The types and
 * display helpers (formatPrice, allergenText, ...) live in menu-helpers.ts,
 * which is safe for both.
 */

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { MenuItem, PriceOption, Size } from "@/lib/menu-helpers";

/*
 * MenuItemDbRow: what one row looks like when it comes back FROM the database.
 * Used only inside this file, for the conversion below.
 * Prices may be null (a size not offered, or "price" on a sized item).
 */
type MenuItemDbRow = {
  id: number;
  name: string;
  description: string;
  ingredients: string;
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
function toPriceOptions(row: MenuItemDbRow): PriceOption[] {
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
  // Step 40a: REMOVED items (is_archived) are left out: they only stay in the
  // table for old orders and reports.
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      "id, name, description, ingredients, price, price_small, price_medium, price_large, category, allergens, is_available, is_daily_special, is_made_to_order"
    )
    .eq("is_archived", false)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    // Logged on the server (in the terminal), never shown to customers.
    console.error("getMenuItems failed:", error.message);
    throw new Error("Could not load the menu.");
  }

  // Convert each database row (snake_case) into our MenuItem (camelCase).
  return (data as MenuItemDbRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    ingredients: row.ingredients ?? "",
    priceOptions: toPriceOptions(row),
    category: row.category,
    allergens: row.allergens,
    isAvailable: row.is_available,
    isDailySpecial: row.is_daily_special,
    isMadeToOrder: row.is_made_to_order,
  }));
}
