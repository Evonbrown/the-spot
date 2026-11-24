/*
 * src/lib/orders/get-queue.ts   (SERVER ONLY)
 *
 * WHAT: getActiveOrders(): loads every ACTIVE order (Pending, In progress,
 *       Ready for pickup, Being delivered) with its items, extras and
 *       delivery location, OLDEST FIRST, for the counter staff queue (FR-03).
 *       getPastOrders() (Step 26): TODAY's finished orders, NEWEST first,
 *       for the "Past Orders" section.
 *
 * LAYER: Application layer. The /staff page (Presentation) calls it; it reads
 *        the order tables (Data layer).
 *
 * WHY the normal LOGGED-IN connection (not the secret key)?
 *   RLS decides who may see orders (migration 0007: counter staff see all).
 *   If someone who isn't counter staff ever reached this code, the database
 *   would simply return their own orders (customers) or none at all, never
 *   everyone's. The secret key would skip that protection, so it's not used.
 *
 * NOT CACHED: the queue must always be up to date (it is re-read every time
 * Realtime reports a change).
 */

import "server-only";
import { connection } from "next/server";
import type { Size } from "@/lib/menu-helpers";
import { ACTIVE_STATUSES, FINAL_STATUSES, type OrderStatus } from "@/lib/order-status";
import { jamaicaDayStart, type Fulfilment } from "@/lib/order-rules";
import { createClient } from "@/lib/supabase/server";

/*
 * QueueOrder: one card in the staff queue.
 * Plain values only (numbers, text, lists), because the page hands this to a
 * BROWSER component, and only plain values can travel from server to browser.
 */
export type QueueOrder = {
  id: number; // Order ID, e.g. 1004
  createdAt: number; // when it was placed (ms since 1970)
  status: OrderStatus;
  fulfilment: Fulfilment;
  locationName: string | null; // delivery only, e.g. "UWI Mona"
  requestedTime: number; // "Ready by" (ms since 1970)
  isAsap: boolean;
  items: {
    id: number;
    name: string;
    size: Size | null;
    quantity: number;
    note: string; // meal note: the kitchen must see dietary instructions
    extras: string[]; // extra names, e.g. ["Coleslaw (Sample)"]
  }[];
};

// What comes back FROM the database (snake_case).
type QueueRow = {
  id: number;
  created_at: string;
  status: OrderStatus;
  fulfilment: Fulfilment;
  requested_time: string;
  is_asap: boolean;
  delivery_locations: { name: string } | null;
  order_items: {
    id: number;
    item_name: string;
    size: Size | null;
    quantity: number;
    note: string;
    order_item_customizations: { id: number; customization_name: string }[];
  }[];
};

/*
 * getActiveOrders() -> the active orders, oldest first.
 * FR-03: "New orders at the bottom as PENDING": sorting OLDEST first puts the
 * newest at the bottom. (Order ID as a tie-break: same second = lower ID first.)
 * THROWS if the database can't be reached; the page shows a message.
 */
export async function getActiveOrders(): Promise<QueueOrder[]> {
  const supabase = await createClient();

  // One query; Supabase follows the links to location, items and extras.
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, created_at, status, fulfilment, requested_time, is_asap,
       delivery_locations ( name ),
       order_items ( id, item_name, size, quantity, note,
         order_item_customizations ( id, customization_name ) )`
    )
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    // Logged in the terminal for us, never shown to staff as-is.
    console.error("getActiveOrders failed:", error.message);
    throw new Error("Could not load the order queue.");
  }

  // Convert to our camelCase shape. Items and extras sorted by id, so they
  // appear in the order the customer added them.
  return (data as unknown as QueueRow[]).map((row) => ({
    id: row.id,
    createdAt: Date.parse(row.created_at),
    status: row.status,
    fulfilment: row.fulfilment,
    locationName: row.delivery_locations?.name ?? null,
    requestedTime: Date.parse(row.requested_time),
    isAsap: row.is_asap,
    items: [...row.order_items]
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
  }));
}

// ---- Past Orders (Step 26) ----------------------------------------------------

/* PastOrder: one row in "Past Orders" (a short line; details are one tap away). */
export type PastOrder = {
  id: number;
  createdAt: number;
  status: OrderStatus; // COMPLETED, CANCELLED or ABANDONED
  fulfilment: Fulfilment;
  locationName: string | null;
};

type PastRow = {
  id: number;
  created_at: string;
  status: OrderStatus;
  fulfilment: Fulfilment;
  delivery_locations: { name: string } | null;
};

/*
 * getPastOrders() -> TODAY's finished orders (Completed, Cancelled, Abandoned),
 * NEWEST first, for "Past Orders" on /staff (FR-03).
 * WHY today only (decision)? FR-06: counter staff may only see the current
 * day's sales, and without a limit the list would grow forever.
 * "Today" = since midnight JAMAICA time (the server runs on UTC).
 * await connection(): this uses the current time, so Next.js must work it out
 * for each real visit, never ahead of time (see get-profile.ts).
 * THROWS if the database can't be reached; the page shows a message.
 */
export async function getPastOrders(): Promise<PastOrder[]> {
  await connection();
  const todayStart = new Date(jamaicaDayStart(Date.now())).toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, status, fulfilment, delivery_locations ( name )")
    .in("status", FINAL_STATUSES)
    .gte("created_at", todayStart)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    console.error("getPastOrders failed:", error.message);
    throw new Error("Could not load past orders.");
  }

  return (data as unknown as PastRow[]).map((row) => ({
    id: row.id,
    createdAt: Date.parse(row.created_at),
    status: row.status,
    fulfilment: row.fulfilment,
    locationName: row.delivery_locations?.name ?? null,
  }));
}
