/*
 * src/lib/orders/get-my-orders.ts   (SERVER ONLY)
 *
 * WHAT: getMyOrders(customerId): the logged-in customer's OWN orders for the
 *       "My orders" page (Step 29, FR-05 SR-5.1): Order ID, when it was
 *       placed, total, current status and pickup/delivery. Newest first.
 *
 * LAYER: Application layer. The page (Presentation) calls it; it reads the
 *        orders table (Data layer) through RLS.
 *
 * WHY the normal LOGGED-IN connection (not the secret key)?
 *   FR-05: "Customers can only see their own orders." RLS (migration 0006)
 *   already hides everyone else's orders from a customer. We ALSO filter by
 *   customer_id ourselves ("our own lock, on top of RLS"), so even a mistake
 *   in one of the two would not show another person's orders.
 *
 * NOT CACHED: orders are private and their status changes.
 */

import "server-only";
import type { OrderStatus } from "@/lib/order-status";
import type { Fulfilment } from "@/lib/order-rules";
import { createClient } from "@/lib/supabase/server";

/* One row of the "My orders" list. */
export type MyOrder = {
  id: number; // the Order ID, e.g. 1004
  createdAt: number; // when it was placed (milliseconds since 1970)
  total: number;
  status: OrderStatus;
  fulfilment: Fulfilment;
};

/*
 * How many orders the list shows. A customer with years of lunches could
 * have hundreds; the newest 50 keep the page fast on a phone (PR-1/PR-3).
 */
export const MY_ORDERS_LIMIT = 50;

/*
 * getMyOrders(customerId) -> the customer's newest orders, newest first.
 * THROWS if the database can't be reached (the page shows "try again").
 */
export async function getMyOrders(customerId: string): Promise<MyOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, total, status, fulfilment")
    .eq("customer_id", customerId) // our own lock, on top of RLS
    .order("created_at", { ascending: false }) // newest first
    .limit(MY_ORDERS_LIMIT);

  if (error) {
    console.error("getMyOrders failed:", error.message);
    throw new Error("Could not load your orders.");
  }

  // Database names (snake_case) -> ours (camelCase).
  // Number(...) because exact numeric columns can arrive as text ("1200.00").
  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: Date.parse(row.created_at),
    total: Number(row.total),
    status: row.status as OrderStatus,
    fulfilment: row.fulfilment as Fulfilment,
  }));
}
