/*
 * src/lib/orders/get-order.ts   (SERVER ONLY)
 *
 * WHAT: getOrderForCustomer(id, customerId): loads ONE order with everything
 *       the confirmation page shows: its items (size, extras, note), totals,
 *       pickup/delivery and location, the time and the payment method.
 *
 * LAYER: Application layer. The confirmation page (Presentation) calls it; it
 *        reads the order tables (Data layer).
 *
 * WHY the normal LOGGED-IN connection (not the secret key)?
 *   FR-05: customers can only see their own orders. The logged-in connection
 *   sends the customer's login cookie, so Row Level Security (migration 0006,
 *   section 10) only ever returns THEIR orders. Someone else's order simply
 *   "doesn't exist" for them. We also filter by customer_id ourselves: two
 *   locks instead of one ("defence in depth").
 *   The secret key would skip RLS, so it is NOT used here.
 *
 * NOT CACHED: an order is private to one customer, so it is read fresh on
 * every visit (no 'use cache').
 */

import "server-only";
import type { Size } from "@/lib/menu-helpers";
import type { Fulfilment } from "@/lib/order-rules";
import { createClient } from "@/lib/supabase/server";

/* One extra on an order item, as saved when the order was placed. */
export type OrderExtra = { name: string; extraPrice: number };

/* One order item, e.g. "2 × Fry Chicken (Large) + Coleslaw", with its note. */
export type OrderItemDetails = {
  id: number;
  name: string;
  size: Size | null;
  unitPrice: number;
  quantity: number;
  note: string;
  lineTotal: number;
  extras: OrderExtra[];
};

/*
 * OrderDetails: everything the confirmation page needs.
 * Prices are the COPIES saved with the order (Part 19), so a later menu price
 * change never changes what this customer was charged.
 */
export type OrderDetails = {
  id: number; // the Order ID, e.g. 1001
  createdAt: number; // when it was placed (milliseconds since 1970)
  fulfilment: Fulfilment; // "PICKUP" | "DELIVERY"
  deliveryLocation: { name: string; feeConfirmed: boolean } | null; // delivery only
  requestedTime: number; // when it should be ready / delivered
  isAsap: boolean; // true = "As soon as possible"
  itemsTotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: "LYNK" | "CASH" | null; // null only if the payment row is missing
  items: OrderItemDetails[];
};

// ---- What comes back FROM the database (snake_case) -------------------------
type ExtraRow = { id: number; customization_name: string; extra_price: number | string };
type ItemRow = {
  id: number;
  item_name: string;
  size: Size | null;
  unit_price: number | string;
  quantity: number;
  note: string;
  line_total: number | string;
  order_item_customizations: ExtraRow[];
};
type PaymentRow = { method: "LYNK" | "CASH" };
type OrderRow = {
  id: number;
  created_at: string;
  fulfilment: Fulfilment;
  requested_time: string;
  is_asap: boolean;
  items_total: number | string;
  delivery_fee: number | string;
  total: number | string;
  delivery_locations: { name: string; fee_confirmed: boolean } | null;
  // Supabase gives a one-to-one link as one object; we also accept a list
  // of one, to be safe.
  payments: PaymentRow | PaymentRow[] | null;
  order_items: ItemRow[];
};

/*
 * getOrderForCustomer(idText, customerId) -> the order, or null.
 * null when:
 *   - the id isn't a whole number (e.g. /orders/abc),
 *   - there is no such order, OR
 *   - it belongs to someone else (RLS hides it).
 * The page shows the SAME "Order not found" for all of these, so nobody can
 * find out which order numbers exist by trying them.
 * THROWS if the database can't be reached (the page shows a "try again" message).
 */
export async function getOrderForCustomer(
  idText: string,
  customerId: string
): Promise<OrderDetails | null> {
  // Only plain digits, and small enough to be an exact JavaScript number.
  if (!/^\d{1,15}$/.test(idText)) return null;
  const id = Number(idText);

  const supabase = await createClient();

  // ONE query with "embedded" related rows: Supabase follows the links
  // (foreign keys) from orders to its location, payment, items and extras.
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, created_at, fulfilment, requested_time, is_asap,
       items_total, delivery_fee, total,
       delivery_locations ( name, fee_confirmed ),
       payments ( method ),
       order_items ( id, item_name, size, unit_price, quantity, note, line_total,
         order_item_customizations ( id, customization_name, extra_price ) )`
    )
    .eq("id", id)
    .eq("customer_id", customerId) // our own lock, on top of RLS
    .maybeSingle(); // 0 rows -> data is null (not an error)

  if (error) {
    // Logged in the terminal for us, never shown to customers.
    console.error("getOrderForCustomer failed:", error.message);
    throw new Error("Could not load the order.");
  }
  if (!data) return null;

  const row = data as unknown as OrderRow;
  const payment = Array.isArray(row.payments) ? row.payments[0] : row.payments;

  // Convert to our camelCase shape. Number(...) because exact numeric columns
  // can arrive as text ("1200.00"). Items and extras are sorted by id, so they
  // appear in the same order the customer added them.
  return {
    id: row.id,
    createdAt: Date.parse(row.created_at),
    fulfilment: row.fulfilment,
    deliveryLocation: row.delivery_locations
      ? { name: row.delivery_locations.name, feeConfirmed: row.delivery_locations.fee_confirmed }
      : null,
    requestedTime: Date.parse(row.requested_time),
    isAsap: row.is_asap,
    itemsTotal: Number(row.items_total),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    paymentMethod: payment?.method ?? null,
    items: [...row.order_items]
      .sort((a, b) => a.id - b.id)
      .map((item) => ({
        id: item.id,
        name: item.item_name,
        size: item.size,
        unitPrice: Number(item.unit_price),
        quantity: item.quantity,
        note: item.note,
        lineTotal: Number(item.line_total),
        extras: [...item.order_item_customizations]
          .sort((a, b) => a.id - b.id)
          .map((extra) => ({ name: extra.customization_name, extraPrice: Number(extra.extra_price) })),
      })),
  };
}
