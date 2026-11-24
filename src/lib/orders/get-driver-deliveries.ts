/*
 * src/lib/orders/get-driver-deliveries.ts   (SERVER ONLY)
 *
 * WHAT: getDriverDeliveries(driverId): the logged-in driver's deliveries for
 *       their screen (Step 32, FR-04 SR-4.2 view part / AC-2, TS-4.1.3), in
 *       two groups:
 *         toDeliver = unfinished orders, EARLIEST ready-by first (decision:
 *                     what's needed soonest is on top);
 *         doneToday = today's Completed / Cancelled ones, newest first
 *                     (decision: a cancelled one tells the driver not to go).
 *       Each with everything needed to deliver: Order ID, status, drop-off
 *       location, ready-by, customer name + phone, items, total, payment.
 *
 * LAYER: Application layer. /driver (Presentation) calls it; it reads the
 *        deliveries and order tables (Data layer) through RLS.
 *
 * WHY the driver's OWN login (not the secret key)? RLS (migration 0014) lets
 * a driver read only deliveries where driver_id is them, and only those
 * orders, items, payments and customers. We ALSO filter by driver_id
 * ourselves ("our own lock, on top of RLS").
 *
 * NOT CACHED: deliveries change (assigned, moved, status) and are private.
 */

import "server-only";
import { connection } from "next/server";
import type { Size } from "@/lib/menu-helpers";
import {
  ACTIVE_STATUSES,
  FINAL_STATUSES,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/order-status";
import { jamaicaDayStart } from "@/lib/order-rules";
import { createClient } from "@/lib/supabase/server";

/* One delivery card on the driver's screen. */
export type DriverDelivery = {
  orderId: number;
  status: OrderStatus;
  dropOffLocation: string; // copied when it was assigned (Step 31)
  requestedTime: number; // "Ready by" (ms since 1970)
  isAsap: boolean;
  createdAt: number; // when the order was placed
  total: number;
  customerName: string | null;
  customerPhone: string | null;
  payment: { method: PaymentMethod; status: PaymentStatus; amount: number } | null;
  items: {
    id: number;
    name: string;
    size: Size | null;
    quantity: number;
    note: string;
    extras: string[];
  }[];
};

export type DriverDeliveries = {
  toDeliver: DriverDelivery[];
  doneToday: DriverDelivery[];
};

// ---- What comes back FROM the database (snake_case) -------------------------
type PaymentRow = { method: PaymentMethod; status: PaymentStatus; amount: number | string };
type DeliveryRow = {
  drop_off_location: string;
  orders: {
    id: number;
    status: OrderStatus;
    requested_time: string;
    is_asap: boolean;
    created_at: string;
    total: number | string;
    profiles: { full_name: string | null; phone: string | null } | null;
    payments: PaymentRow | PaymentRow[] | null; // one-to-one: object or list of one
    order_items: {
      id: number;
      item_name: string;
      size: Size | null;
      quantity: number;
      note: string;
      order_item_customizations: { id: number; customization_name: string }[];
    }[];
  };
};

/*
 * The ONE query both groups use. We start FROM deliveries (mine) and follow
 * the link to the order and its customer, payment, items and extras.
 * "orders!inner" = only deliveries whose order passes the filters we add on
 * "orders.status" / "orders.created_at" below.
 */
const DELIVERY_COLUMNS = `drop_off_location,
  orders!inner ( id, status, requested_time, is_asap, created_at, total,
    profiles ( full_name, phone ),
    payments ( method, status, amount ),
    order_items ( id, item_name, size, quantity, note,
      order_item_customizations ( id, customization_name ) ) )`;

/*
 * getDriverDeliveries(driverId) -> { toDeliver, doneToday }.
 * await connection(): "today" uses the current time, so Next.js must work it
 * out for each real visit (see get-queue.ts).
 * THROWS if the database can't be reached; the page shows a message.
 */
export async function getDriverDeliveries(driverId: string): Promise<DriverDeliveries> {
  await connection();
  const todayStart = new Date(jamaicaDayStart(Date.now())).toISOString();
  const supabase = await createClient();

  // Both groups at the same time.
  const [activeResult, doneResult] = await Promise.all([
    supabase
      .from("deliveries")
      .select(DELIVERY_COLUMNS)
      .eq("driver_id", driverId) // our own lock, on top of RLS
      .in("orders.status", ACTIVE_STATUSES),
    supabase
      .from("deliveries")
      .select(DELIVERY_COLUMNS)
      .eq("driver_id", driverId)
      .in("orders.status", FINAL_STATUSES)
      .gte("orders.created_at", todayStart), // today (Jamaica time) only
  ]);

  if (activeResult.error || doneResult.error) {
    console.error(
      "getDriverDeliveries failed:",
      activeResult.error?.message ?? doneResult.error?.message
    );
    throw new Error("Could not load your deliveries.");
  }

  const toDeliver = (activeResult.data as unknown as DeliveryRow[])
    .map(toDriverDelivery)
    // Earliest ready-by first; Order ID breaks ties.
    .sort((a, b) => a.requestedTime - b.requestedTime || a.orderId - b.orderId);

  const doneToday = (doneResult.data as unknown as DeliveryRow[])
    .map(toDriverDelivery)
    .sort((a, b) => b.createdAt - a.createdAt || b.orderId - a.orderId); // newest first

  return { toDeliver, doneToday };
}

/* Database row (snake_case) -> our DriverDelivery (camelCase). */
function toDriverDelivery(row: DeliveryRow): DriverDelivery {
  const order = row.orders;
  const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
  return {
    orderId: order.id,
    status: order.status,
    dropOffLocation: row.drop_off_location,
    requestedTime: Date.parse(order.requested_time),
    isAsap: order.is_asap,
    createdAt: Date.parse(order.created_at),
    total: Number(order.total), // exact numeric can arrive as text
    customerName: order.profiles?.full_name ?? null,
    customerPhone: order.profiles?.phone ?? null,
    payment: payment
      ? { method: payment.method, status: payment.status, amount: Number(payment.amount) }
      : null,
    items: [...order.order_items]
      .sort((a, b) => a.id - b.id)
      .map((item) => ({
        id: item.id,
        name: item.item_name,
        size: item.size,
        quantity: item.quantity,
        note: item.note,
        extras: [...item.order_item_customizations]
          .sort((a, b) => a.id - b.id)
          .map((extra) => extra.customization_name),
      })),
  };
}
