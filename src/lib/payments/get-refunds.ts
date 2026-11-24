/*
 * src/lib/payments/get-refunds.ts   (SERVER ONLY)
 *
 * WHAT: Reads what the Supervisor's "Refunds" box shows (Step 38b, UC-07,
 *       SDS class Refund):
 *         findOrderForRefund(text, myId) -> one order looked up by its Order
 *                                           ID: customer, payment, refunds so
 *                                           far and what can still be
 *                                           refunded; or a message;
 *         getRefundsToday(myId)          -> every refund issued TODAY
 *                                           (Jamaica), newest first.
 *
 * LAYER: Application layer. Read with the Supervisor's OWN login: RLS lets
 *        the Supervisor read orders, payments and customers who ordered
 *        (0020) and refunds (0021).
 *
 * Each THROWS if the database can't be reached; the page shows a message.
 */

import "server-only";
import { connection } from "next/server";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/order-status";
import { refundableAmount } from "@/lib/payments/supervisor-rules";
import { createClient } from "@/lib/supabase/server";

/* One earlier refund of an order (or one of today's refunds). */
export type RefundLine = {
  id: number;
  orderId: number;
  method: PaymentMethod;
  amount: number;
  reason: string;
  refundedAt: number; // milliseconds since 1970
  byMe: boolean; // issued by the Supervisor who is looking
};

/* The looked-up order, with its money figures. */
export type RefundOrder = {
  orderId: number;
  placedAt: number;
  status: OrderStatus;
  total: number;
  customerName: string | null;
  customerPhone: string | null;
  method: PaymentMethod;
  payStatus: PaymentStatus;
  paid: number; // the payment amount
  refunded: number; // all refunds so far
  refundable: number; // paid - refunded (0 if unpaid)
  refunds: RefundLine[]; // oldest first
};

// What the database sends back (snake_case).
type RefundRow = {
  id: number;
  order_id: number;
  method: PaymentMethod;
  amount: number | string;
  reason: string;
  refunded_at: string;
  refunded_by: string;
};
type PaymentRow = { method: PaymentMethod; status: PaymentStatus; amount: number | string };
type OrderRow = {
  id: number;
  created_at: string;
  status: OrderStatus;
  total: number | string;
  profiles: { full_name: string | null; phone: string | null } | null;
  payments: PaymentRow | PaymentRow[] | null; // one-to-one: object or list of one
  refunds: RefundRow[] | null;
};

/* A database refund row -> our RefundLine. */
function toRefundLine(row: RefundRow, myId: string): RefundLine {
  return {
    id: row.id,
    orderId: row.order_id,
    method: row.method,
    amount: Number(row.amount),
    reason: row.reason,
    refundedAt: Date.parse(row.refunded_at),
    byMe: row.refunded_by === myId,
  };
}

/*
 * findOrderForRefund(text, myId) -> { order } or { error } (a message to
 * show, e.g. "Order #9999 not found."). Empty text -> null (nothing looked
 * up yet).
 * Refunds are added up in CENTS, so the totals are exact.
 */
export async function findOrderForRefund(
  text: string | undefined,
  myId: string
): Promise<{ order: RefundOrder } | { error: string } | null> {
  const cleaned = (text ?? "").replace(/^#/, "").trim();
  if (cleaned === "") return null;
  if (!/^\d{1,15}$/.test(cleaned)) return { error: "Type the Order ID as a number, e.g. 1043." };
  const id = Number(cleaned);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, created_at, status, total, profiles ( full_name, phone ),
       payments ( method, status, amount ),
       refunds ( id, order_id, method, amount, reason, refunded_at, refunded_by )`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("findOrderForRefund failed:", error.message);
    throw new Error("Could not load the order.");
  }
  if (!data) return { error: `Order #${id} not found.` };

  const row = data as unknown as OrderRow;
  const payment = Array.isArray(row.payments) ? row.payments[0] : row.payments;
  if (!payment) return { error: `Order #${id} has no payment record.` };

  const refunds = (row.refunds ?? [])
    .map((r) => toRefundLine(r, myId))
    .sort((a, b) => a.refundedAt - b.refundedAt || a.id - b.id);
  const refunded = refunds.reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100;
  const paid = Number(payment.amount);

  return {
    order: {
      orderId: row.id,
      placedAt: Date.parse(row.created_at),
      status: row.status,
      total: Number(row.total),
      customerName: row.profiles?.full_name ?? null,
      customerPhone: row.profiles?.phone ?? null,
      method: payment.method,
      payStatus: payment.status,
      paid,
      refunded,
      // Nothing can be refunded until the order is paid.
      refundable: payment.status === "UNPAID" ? 0 : refundableAmount(paid, refunded),
      refunds,
    },
  };
}

/*
 * getRefundsToday(myId): refunds whose business day is TODAY (Jamaica).
 * await connection(): uses the current time (see get-profile.ts).
 */
export async function getRefundsToday(myId: string): Promise<RefundLine[]> {
  await connection();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(Date.now());

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("refunds")
    .select("id, order_id, method, amount, reason, refunded_at, refunded_by")
    .eq("business_day", today)
    .order("refunded_at", { ascending: false });

  if (error) {
    console.error("getRefundsToday failed:", error.message);
    throw new Error("Could not load today's refunds.");
  }
  return (data as RefundRow[]).map((row) => toRefundLine(row, myId));
}
