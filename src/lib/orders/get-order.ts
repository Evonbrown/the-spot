/*
 * src/lib/orders/get-order.ts   (SERVER ONLY)
 *
 * WHAT: Loads ONE order with everything a details screen shows: its items
 *       (size, extras, note), totals, pickup/delivery and location, the
 *       times, the status and the payment method.
 *         getOrderForCustomer(id, customerId) -> the customer's confirmation
 *                                                page (Part 22)
 *         getOrderForStaff(id)                -> the counter staff's order
 *                                                details page (Step 25), which
 *                                                ALSO shows the customer's
 *                                                name and phone
 *       Both share ONE query and ONE conversion, so they always read an
 *       order the same way.
 *
 * LAYER: Application layer. Pages (Presentation) call it; it reads the order
 *        tables (Data layer).
 *
 * WHY the normal LOGGED-IN connection (not the secret key)?
 *   RLS decides what each person may read:
 *     - customers: only their OWN orders (migration 0006, FR-05);
 *     - counter staff: all orders (0007), plus the customer's name/phone and
 *       the payment (0008).
 *   Someone else's order simply "doesn't exist" for a customer. The secret
 *   key would skip that protection, so it is NOT used here.
 *
 * NOT CACHED: orders are private and change (status), so they're read fresh.
 */

import "server-only";
import type { Size } from "@/lib/menu-helpers";
import type { OrderStatus } from "@/lib/order-status";
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
 * OrderDetails: everything a details screen needs.
 * Prices are the COPIES saved with the order (Part 19), so a later menu price
 * change never changes what this customer was charged.
 */
export type OrderDetails = {
  id: number; // the Order ID, e.g. 1001
  createdAt: number; // when it was placed (milliseconds since 1970)
  status: OrderStatus;
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

/*
 * StaffOrderDetails: the same, plus WHO ordered (SR-3.2: staff may need to
 * call the customer). customer is null only if their profile can't be read.
 */
export type StaffOrderDetails = OrderDetails & {
  customer: { name: string | null; phone: string | null } | null;
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
  status: OrderStatus;
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
type StaffOrderRow = OrderRow & {
  profiles: { full_name: string | null; phone: string | null } | null;
};

/*
 * The ONE query both versions use. "Embedded" related rows: Supabase follows
 * the links (foreign keys) from orders to its location, payment, items and
 * extras, all in one trip to the database.
 */
const ORDER_COLUMNS = `id, created_at, status, fulfilment, requested_time, is_asap,
  items_total, delivery_fee, total,
  delivery_locations ( name, fee_confirmed ),
  payments ( method ),
  order_items ( id, item_name, size, unit_price, quantity, note, line_total,
    order_item_customizations ( id, customization_name, extra_price ) )`;

/*
 * parseOrderId("1001") -> 1001, or null if it isn't a plain whole number.
 * (e.g. /orders/abc). Small enough to be an exact JavaScript number.
 */
function parseOrderId(idText: string): number | null {
  return /^\d{1,15}$/.test(idText) ? Number(idText) : null;
}

/*
 * toOrderDetails(row): database row (snake_case) -> our OrderDetails (camelCase).
 * Number(...) because exact numeric columns can arrive as text ("1200.00").
 * Items and extras are sorted by id, so they appear in the order the
 * customer added them.
 */
function toOrderDetails(row: OrderRow): OrderDetails {
  const payment = Array.isArray(row.payments) ? row.payments[0] : row.payments;
  return {
    id: row.id,
    createdAt: Date.parse(row.created_at),
    status: row.status,
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

/*
 * getOrderForCustomer(idText, customerId) -> the order, or null.
 * null when the id isn't a number, there's no such order, OR it belongs to
 * someone else (RLS hides it). The page shows the SAME "Order not found" for
 * all of these, so nobody can find out which order numbers exist.
 * THROWS if the database can't be reached (the page shows a "try again" message).
 */
export async function getOrderForCustomer(
  idText: string,
  customerId: string
): Promise<OrderDetails | null> {
  const id = parseOrderId(idText);
  if (id === null) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", id)
    .eq("customer_id", customerId) // our own lock, on top of RLS
    .maybeSingle(); // 0 rows -> data is null (not an error)

  if (error) {
    console.error("getOrderForCustomer failed:", error.message);
    throw new Error("Could not load the order.");
  }
  return data ? toOrderDetails(data as unknown as OrderRow) : null;
}

/*
 * getOrderForStaff(idText) -> the order with the customer's name and phone,
 * or null if the id isn't a number or there's no such order.
 * Only call it after requireRole(["counter_staff"]): RLS also enforces that
 * (anyone else gets null or only their own order), but the page check gives
 * the right "no access" screen.
 * "profiles ( full_name, phone )" follows orders.customer_id to the customer's
 * profile (allowed for counter staff by migration 0008).
 * THROWS if the database can't be reached.
 */
export async function getOrderForStaff(idText: string): Promise<StaffOrderDetails | null> {
  const id = parseOrderId(idText);
  if (id === null) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`${ORDER_COLUMNS}, profiles ( full_name, phone )`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getOrderForStaff failed:", error.message);
    throw new Error("Could not load the order.");
  }
  if (!data) return null;

  const row = data as unknown as StaffOrderRow;
  return {
    ...toOrderDetails(row),
    customer: row.profiles ? { name: row.profiles.full_name, phone: row.profiles.phone } : null,
  };
}
