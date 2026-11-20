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
 * MenuItem: what ONE menu item looks like in our code (SDS class: MenuItem).
 * The database uses snake_case names (is_available); TypeScript code usually
 * uses camelCase (isAvailable). getMenuItems() converts between them, so the
 * rest of the app never has to think about database names.
 */
export type MenuItem = {
  id: number;
  name: string;
  description: string;
  price: number; // J$. Stored EXACTLY in the database as numeric(10,2)
  category: string; // plain text (decision), e.g. "Meals"
  allergens: string[]; // SAF-2: shown on every item. Empty list = no listed allergens
  isAvailable: boolean; // FR-01: false = greyed out, cannot be added (instead of stock tracking)
  isDailySpecial: boolean; // FR-01: daily specials are highlighted
  isMadeToOrder: boolean; // FR-01: e.g. fries. Pickup with one needs at least 15 min
};

/*
 * MenuItemRow: what one row looks like when it comes back FROM the database.
 * Used only inside this file, for the conversion below.
 */
type MenuItemRow = {
  id: number;
  name: string;
  description: string;
  price: number | string;
  category: string;
  allergens: string[];
  is_available: boolean;
  is_daily_special: boolean;
  is_made_to_order: boolean;
};

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
      "id, name, description, price, category, allergens, is_available, is_daily_special, is_made_to_order"
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
    // Number(...) makes sure price is a number even if it arrives as text
    // ("1200.00"), which can happen with exact numeric columns.
    price: Number(row.price),
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
