/*
 * src/lib/payments/get-lynk-payments.ts   (SERVER ONLY)
 *
 * WHAT: Reads the two lists on the Supervisor screen (Step 38a, FR-02):
 *         getLynkToCheck()      -> every UNPAID Lynk payment whose order is
 *                                  still going (not cancelled / abandoned),
 *                                  OLDEST first (the customer who has waited
 *                                  longest is checked first);
 *         getLynkVerifiedToday() -> Lynk payments verified TODAY (Jamaica),
 *                                  newest first, so the Supervisor can see
 *                                  what's done.
 *
 * LAYER: Application layer. Read with the Supervisor's OWN login: RLS
 *        (migration 0020) lets the Supervisor read all orders and payments,
 *        and the name + phone of customers who have an order.
 *
 * Each THROWS if the database can't be reached; the page shows a message.
 */

import "server-only";
import { connection } from "next/server";
import type { OrderStatus } from "@/lib/order-status";
import type { Fulfilment } from "@/lib/order-rules";
import { jamaicaDayStart } from "@/lib/order-rules";
import { createClient } from "@/lib/supabase/server";

/* One Lynk payment to check. */
export type LynkToCheck = {
  orderId: number; // also the Lynk reference the customer typed
  amount: number; // J$
  orderedAt: number; // milliseconds since 1970
  orderStatus: OrderStatus;
  fulfilment: Fulfilment;
  customerName: string | null;
  customerPhone: string | null;
  notReceived: { at: number; note: string | null } | null; // the flag, if any
};

/* One Lynk payment verified today. */
export type LynkVerified = {
  orderId: number;
  amount: number;
  verifiedAt: number;
  byMe: boolean; // verified by the Supervisor who is looking
};

// What the database sends back (snake_case; the order is ONE object).
type OrderPart = {
  id: number;
  created_at: string;
  status: OrderStatus;
  fulfilment: Fulfilment;
  profiles: { full_name: string | null; phone: string | null } | null;
};
type ToCheckRow = {
  order_id: number;
  amount: number | string;
  not_received_at: string | null;
  not_received_note: string | null;
  orders: OrderPart;
};

/*
 * getLynkToCheck():
 *   "orders!inner ( ... )" = follow the payment to its order AND keep only
 *   payments whose order matches the filter on orders (an "inner join").
 *   ".not('orders.status', 'in', ...)" = leave out cancelled and abandoned
 *   orders: there's nothing to collect for those.
 */
export async function getLynkToCheck(): Promise<LynkToCheck[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select(
      `order_id, amount, not_received_at, not_received_note,
       orders!inner ( id, created_at, status, fulfilment, profiles ( full_name, phone ) )`
    )
    .eq("method", "LYNK")
    .eq("status", "UNPAID")
    .not("orders.status", "in", "(CANCELLED,ABANDONED)")
    .order("order_id", { ascending: true }); // Order IDs grow over time = oldest first

  if (error) {
    console.error("getLynkToCheck failed:", error.message);
    throw new Error("Could not load the Lynk payments.");
  }

  return (data as unknown as ToCheckRow[]).map((row) => ({
    orderId: row.order_id,
    amount: Number(row.amount),
    orderedAt: Date.parse(row.orders.created_at),
    orderStatus: row.orders.status,
    fulfilment: row.orders.fulfilment,
    customerName: row.orders.profiles?.full_name ?? null,
    customerPhone: row.orders.profiles?.phone ?? null,
    notReceived: row.not_received_at
      ? { at: Date.parse(row.not_received_at), note: row.not_received_note }
      : null,
  }));
}

/*
 * getLynkVerifiedToday(myId): Lynk payments with paid_at since midnight
 * TODAY (Jamaica time). await connection(): it uses the current time, so it
 * must be worked out for each real visit (see get-profile.ts).
 */
export async function getLynkVerifiedToday(myId: string): Promise<LynkVerified[]> {
  await connection();
  const todayStart = new Date(jamaicaDayStart(Date.now())).toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("order_id, amount, paid_at, paid_by")
    .eq("method", "LYNK")
    .eq("status", "PAID")
    .gte("paid_at", todayStart)
    .order("paid_at", { ascending: false });

  if (error) {
    console.error("getLynkVerifiedToday failed:", error.message);
    throw new Error("Could not load today's verified payments.");
  }

  type Row = { order_id: number; amount: number | string; paid_at: string; paid_by: string | null };
  return (data as Row[]).map((row) => ({
    orderId: row.order_id,
    amount: Number(row.amount),
    verifiedAt: Date.parse(row.paid_at),
    byMe: row.paid_by === myId,
  }));
}
