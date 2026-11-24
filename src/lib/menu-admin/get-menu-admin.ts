/*
 * src/lib/menu-admin/get-menu-admin.ts   (SERVER ONLY)
 *
 * WHAT: Reads menu items for the Manager's "Menu" screen (Step 40a, QA-3):
 *         getAdminMenuItems() -> EVERY item, including unavailable and
 *                                REMOVED (archived) ones, in menu order;
 *         getAdminMenuItem(id) -> one item for the Edit form (or null).
 *
 * LAYER: Application layer. NOT cached (unlike the customer menu, menu.ts):
 *        the Manager must always see the very latest version, including
 *        their own change a second ago.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";

/* One item as the Manager's screen needs it (all the columns). */
export type AdminMenuItem = {
  id: number;
  name: string;
  description: string;
  ingredients: string;
  category: string;
  price: number | null; // single-price items
  priceSmall: number | null;
  priceMedium: number | null;
  priceLarge: number | null;
  allergens: string[] | null; // null = not confirmed
  isAvailable: boolean;
  isDailySpecial: boolean;
  isMadeToOrder: boolean;
  isArchived: boolean; // removed from the menu (kept for old orders)
  sortOrder: number;
  updatedAt: string; // when it was last saved (used to spot two Managers editing at once)
};

const COLUMNS =
  "id, name, description, ingredients, category, price, price_small, price_medium, price_large, allergens, is_available, is_daily_special, is_made_to_order, is_archived, sort_order, updated_at";

type Row = {
  id: number;
  name: string;
  description: string;
  ingredients: string | null;
  category: string;
  price: number | string | null;
  price_small: number | string | null;
  price_medium: number | string | null;
  price_large: number | string | null;
  allergens: string[] | null;
  is_available: boolean;
  is_daily_special: boolean;
  is_made_to_order: boolean;
  is_archived: boolean;
  sort_order: number;
  updated_at: string;
};

/* null stays null; "1200.00" -> 1200. */
const money = (value: number | string | null) => (value === null ? null : Number(value));

function toAdminItem(row: Row): AdminMenuItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ingredients: row.ingredients ?? "",
    category: row.category,
    price: money(row.price),
    priceSmall: money(row.price_small),
    priceMedium: money(row.price_medium),
    priceLarge: money(row.price_large),
    allergens: row.allergens,
    isAvailable: row.is_available,
    isDailySpecial: row.is_daily_special,
    isMadeToOrder: row.is_made_to_order,
    isArchived: row.is_archived,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

/* Every item, in menu order. THROWS if the database can't be reached. */
export async function getAdminMenuItems(): Promise<AdminMenuItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_items")
    .select(COLUMNS)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    console.error("getAdminMenuItems failed:", error.message);
    throw new Error("Could not load the menu.");
  }
  return (data as Row[]).map(toAdminItem);
}

/* One item, or null if there's no such id. THROWS on a database problem. */
export async function getAdminMenuItem(id: number): Promise<AdminMenuItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("menu_items").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    console.error("getAdminMenuItem failed:", error.message);
    throw new Error("Could not load the item.");
  }
  return data ? toAdminItem(data as Row) : null;
}

/*
 * categoriesInMenuOrder(items) -> ["Chicken", "Pork & Beef", ...]: each
 * category once, in the order its first item appears (removed items don't
 * count). Used for the form's category list.
 */
export function categoriesInMenuOrder(items: AdminMenuItem[]): string[] {
  return [...new Set(items.filter((item) => !item.isArchived).map((item) => item.category))];
}
