/*
 * src/lib/reports/get-item-volume.ts   (SERVER ONLY)
 *
 * WHAT: The Item Volume Report (Step 35, FR-06 SR-6.4 / AC-6.4): each menu
 *       item AND SIZE sold in a day or range (decision: "Fry Chicken
 *       (Large)" and "Fry Chicken (Small)" are separate lines), with its
 *       category, quantity sold and revenue. Counted orders only (PAID, not
 *       cancelled / abandoned), worked out BY THE DATABASE
 *       (item_volume_report, migration 0017). Manager only.
 *         readItemFilters(params, categories) -> the filters from the address,
 *                                                checked (anything unknown =
 *                                                "all" / the default sort);
 *         getItemVolume(start, end, filters)  -> the lines, or a message.
 *
 * LAYER: Application layer. /manager (Presentation) calls it; the maths
 *        happens in the Data layer.
 */

import "server-only";
import type { Size } from "@/lib/menu-helpers";
import type { Fulfilment } from "@/lib/order-rules";
import { safeMessage } from "@/lib/reports/get-sales-summary";
import { createClient } from "@/lib/supabase/server";

/* One line of the report. */
export type ItemVolumeLine = {
  menuItemId: number;
  name: string; // as saved with the orders, e.g. "Fry Chicken"
  size: Size | null; // null = single-price item (e.g. Pepsi)
  category: string;
  quantity: number;
  revenue: number; // price as charged, incl. extras on those lines
};

export type ItemSort = "quantity" | "revenue" | "name";
export const ITEM_SORTS: { value: ItemSort; label: string }[] = [
  { value: "quantity", label: "Quantity (highest first)" },
  { value: "revenue", label: "Revenue (highest first)" },
  { value: "name", label: "Name (A-Z)" },
];

/* The report's filters. null = "all". */
export type ItemFilters = {
  category: string | null;
  fulfilment: Fulfilment | null; // PICKUP / DELIVERY
  sort: ItemSort;
};

/*
 * readItemFilters(params, categories) -> safe filters.
 * The address can contain anything, so only KNOWN values are used; anything
 * else falls back to "all" (or the default sort, highest quantity first).
 */
export function readItemFilters(
  params: { category?: string; type?: string; sort?: string },
  categories: string[]
): ItemFilters {
  const category = params.category && categories.includes(params.category) ? params.category : null;
  const fulfilment = params.type === "PICKUP" || params.type === "DELIVERY" ? params.type : null;
  const sort = ITEM_SORTS.some((s) => s.value === params.sort) ? (params.sort as ItemSort) : "quantity";
  return { category, fulfilment, sort };
}

/*
 * getItemVolume(start, end, filters) -> { lines } or { error }.
 * Filtering and sorting happen in the database too (one quick query).
 */
export async function getItemVolume(
  start: string,
  end: string,
  filters: ItemFilters
): Promise<{ lines: ItemVolumeLine[] } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("item_volume_report", {
    p_start: start,
    p_end: end,
    p_fulfilment: filters.fulfilment,
    p_category: filters.category,
    p_sort: filters.sort,
  });

  if (error) {
    console.error("getItemVolume failed:", error.message);
    return { error: safeMessage(error.message, "We couldn't load the item report. Please try again.") };
  }

  type Row = {
    menu_item_id: number;
    item_name: string;
    size: Size | null;
    category: string;
    quantity: number | string;
    revenue: number | string;
  };
  return {
    lines: ((data ?? []) as Row[]).map((row) => ({
      menuItemId: row.menu_item_id,
      name: row.item_name,
      size: row.size,
      category: row.category,
      quantity: Number(row.quantity), // big counts can arrive as text
      revenue: Number(row.revenue),
    })),
  };
}
