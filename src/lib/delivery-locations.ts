/*
 * src/lib/delivery-locations.ts   (SERVER ONLY)
 *
 * WHAT: getDeliveryLocations(): loads the ACTIVE delivery locations (and their
 *       fees) from the delivery_locations table.
 *
 * LAYER: Application layer. Pages (Presentation) call it; it reads the
 *        delivery_locations table (Data layer) through the public connection.
 *
 * WHY: FR-01 (deliver only to these places), FR-02 (delivery fee), and
 *      Maintainability (the Manager edits them without code changes).
 *
 * SERVER ONLY, like menu.ts: it uses 'use cache' and the database. The
 * DeliveryLocation TYPE lives in store-info.ts, which is browser-safe.
 */

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { DeliveryLocation } from "@/lib/store-info";

/* What one row looks like when it comes back FROM the database. */
type DeliveryLocationDbRow = {
  id: number;
  name: string;
  delivery_fee: number | string;
  fee_confirmed: boolean;
};

/*
 * getDeliveryLocations()
 * Returns only ACTIVE locations, in sort_order. (Inactive ones stay in the
 * table so old orders still point to a real place, but customers can't pick them.)
 *
 * CACHING: like the menu: a saved copy refreshed about every minute (PR-1),
 * labelled "delivery-locations" so the Manager screen (step 7) can refresh it
 * immediately after an edit.
 * NOTE: placing an order (Part 21) will NOT trust this cached copy: the server
 * reads the location and fee fresh from the database at that moment.
 *
 * Throws if the database can't be reached (errors are not cached).
 */
export async function getDeliveryLocations(): Promise<DeliveryLocation[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("delivery-locations");

  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("delivery_locations")
    .select("id, name, delivery_fee, fee_confirmed")
    .eq("is_active", true) // only places we currently deliver to
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    // Logged on the server (in the terminal), never shown to customers.
    console.error("getDeliveryLocations failed:", error.message);
    throw new Error("Could not load the delivery locations.");
  }

  // Convert database names (snake_case) to our code names (camelCase).
  return (data as DeliveryLocationDbRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    deliveryFee: Number(row.delivery_fee),
    feeConfirmed: row.fee_confirmed,
  }));
}
