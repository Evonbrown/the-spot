/*
 * src/lib/orders/status-actions.ts
 *
 * WHAT: updateOrderStatus(): the Server Action behind the status buttons on
 *       the staff order details page (Step 26, FR-03 SR-3.4 / SR-3.5 / AC-3).
 *       It checks who is asking and whether the change is allowed, then saves
 *       the new status AND its history row with change_order_status().
 *       Step 27: completing a PICKUP order also checks the Order ID the
 *       customer gives (SAF-1) and, for unpaid cash, "cash received"; the
 *       cash payment then becomes PAID in the same transaction (FR-06).
 *       Step 33: for DELIVERY orders counter staff can't mark Being delivered
 *       (the driver does); they keep Cancel and a backup "Complete" with the
 *       same handover check (decision B).
 *       Step 28: the full rules (forward only, finished orders locked,
 *       Abandoned only 20+ minutes after Ready for pickup). The database
 *       trigger (migration 0011) checks them again when saving.
 *
 * LAYER: Application layer. The buttons (Presentation) only call it; the
 *        rule is checkStatusChange() (status-rules.ts); the save is the
 *        database function (Data layer, migration 0009).
 *
 * WHY A SERVER ACTION? Staff can't change the orders table directly (only
 * SELECT is granted), and a request can be sent without our buttons. So
 * every status change comes through here, where the rules are checked, and
 * only the server (secret key) may run change_order_status().
 *
 * "use server" = the browser can ask the server to run this function, but the
 * code itself never goes to the browser.
 */
"use server";

import { getCurrentProfile } from "@/lib/auth/get-profile";
import { STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import type { Fulfilment } from "@/lib/order-rules";
import { counterDeliveryProblem } from "@/lib/orders/delivery-rules";
import {
  cashToCollect,
  checkHandover,
  checkStatusChange,
  findReadyForPickupAt,
  needsHandover,
  readHandover,
  type OrderForStatusCheck,
  type PaymentForHandover,
} from "@/lib/orders/status-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/* What the buttons get back: ok, or a message to show. */
export type StatusChangeResult = { ok: true } | { ok: false; error: string };

const ALL_STATUSES = Object.keys(STATUS_LABELS) as OrderStatus[];
const isStatus = (value: unknown): value is OrderStatus =>
  typeof value === "string" && (ALL_STATUSES as string[]).includes(value);

const SOMEONE_ELSE =
  "This order was just updated by someone else. The page now shows its latest status.";

/*
 * updateOrderStatus(orderId, seenStatus, newStatus, handover?)
 *   seenStatus = the status the staff member SAW when they tapped. If the
 *   order has moved on since then (another staff member, another tab), we
 *   stop and say so, instead of applying the tap to a different step.
 *   handover   = when completing an order (pickup, Step 27; delivery backup,
 *   Step 33): the Order ID the customer gave and the "cash received" tick.
 * Steps 1-5 below; nothing is saved unless all pass.
 */
export async function updateOrderStatus(
  rawOrderId: unknown,
  rawSeenStatus: unknown,
  rawNewStatus: unknown,
  rawHandover?: unknown
): Promise<StatusChangeResult> {
  // ---- 1. WHO: counter staff only (strict role access) ----
  // The id comes from the signed login cookie, never from the browser.
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  if (profile.role !== "counter_staff") {
    return { ok: false, error: "Only counter staff can change an order's status." };
  }

  // ---- 2. SHAPE: a real order number and real status names ----
  // (The browser can send anything, so we check by hand.)
  if (!Number.isSafeInteger(rawOrderId) || (rawOrderId as number) <= 0) {
    return { ok: false, error: "That order number isn't valid." };
  }
  if (!isStatus(rawSeenStatus) || !isStatus(rawNewStatus)) {
    return { ok: false, error: "That status isn't valid." };
  }
  const orderId = rawOrderId as number;

  // ---- 3. FRESH ORDER + THE RULE ----
  // Read with the staff member's OWN login (RLS: counter staff may read
  // orders, 0007, their history, 0011, and deliveries, 0013), not the secret key: least
  // privilege. The history tells us WHEN it became Ready for pickup, for the
  // 20-minute Abandoned rule (Step 28). It is read fresh here: the time the
  // browser shows is never trusted.
  const supabase = await createClient();
  const { data: order, error: readError } = await supabase
    .from("orders")
    .select("status, fulfilment, order_status_history ( status, changed_at ), deliveries ( id )")
    .eq("id", orderId)
    .maybeSingle();

  if (readError) {
    console.error("updateOrderStatus: could not read the order:", readError.message);
    return { ok: false, error: "We couldn't reach the database. Please try again." };
  }
  if (!order) return { ok: false, error: "Order not found." };

  const row = order as {
    status: OrderStatus;
    fulfilment: Fulfilment;
    order_status_history: { status: OrderStatus; changed_at: string }[] | null;
    // Step 31: its delivery row, if a driver is assigned (one object, or a
    // list of one, or nothing).
    deliveries: { id: number } | { id: number }[] | null;
  };
  const current: OrderForStatusCheck = {
    id: orderId,
    status: row.status,
    fulfilment: row.fulfilment,
    readyForPickupAt: findReadyForPickupAt(row.order_status_history),
    hasDriver: Array.isArray(row.deliveries) ? row.deliveries.length > 0 : row.deliveries !== null,
  };
  if (current.status !== rawSeenStatus) return { ok: false, error: SOMEONE_ELSE };

  // THE rule (Step 28: forward only, finished locked, Abandoned after 20 min).
  // Date.now() = the SERVER's clock, never a time sent by the browser.
  const ruleError = checkStatusChange(current, rawNewStatus, Date.now());
  if (ruleError) return { ok: false, error: ruleError };

  // Step 33 (decision B): for DELIVERY orders the driver marks Being
  // delivered; counter staff only keep Cancel and the backup "Complete".
  const deliveryProblem = counterDeliveryProblem(current, rawNewStatus);
  if (deliveryProblem) return { ok: false, error: deliveryProblem };

  // ---- 4. HANDOVER (SAF-1 + FR-06) ----
  // Completing an order (pickup at the counter, Step 27, or the delivery
  // backup, Step 33) needs the customer's Order ID and, for unpaid cash, the
  // "cash received" tick. The payment is read FRESH (staff may read payments,
  // 0008); the browser's idea of it is never trusted.
  let cashReceived = false;
  if (needsHandover(rawNewStatus)) {
    const handover = readHandover(rawHandover);
    if (!handover) return { ok: false, error: "Type the Order ID the customer gives you." };

    const { data: paymentRow, error: payError } = await supabase
      .from("payments")
      .select("method, status, amount")
      .eq("order_id", orderId)
      .maybeSingle();
    if (payError) {
      console.error("updateOrderStatus: could not read the payment:", payError.message);
      return { ok: false, error: "We couldn't reach the database. Please try again." };
    }
    const payment: PaymentForHandover | null = paymentRow
      ? {
          method: paymentRow.method,
          status: paymentRow.status,
          amount: Number(paymentRow.amount), // exact numeric can arrive as text
        }
      : null;

    const handoverError = checkHandover(orderId, payment, handover);
    if (handoverError) return { ok: false, error: handoverError };

    // Unpaid cash + ticked -> mark it PAID in the same transaction.
    // (Lynk stays UNPAID: the Supervisor verifies it, Build step 7.)
    cashReceived = cashToCollect(payment);
  }

  // ---- 5. SAVE: status + history (+ cash PAID) together, one transaction ----
  // Only if the status is STILL current.status (someone may tap at the same
  // moment); the function then returns false and nothing changes.
  const admin = createAdminClient();
  const { data: changed, error: saveError } = await admin.rpc("change_order_status", {
    p_order_id: orderId,
    p_expected_status: current.status,
    p_new_status: rawNewStatus,
    p_changed_by: profile.id, // who changed it (and, for cash, who received it)
    p_cash_received: cashReceived,
  });

  // If the database trigger (0011) refused it, we land here too. That should
  // only happen if the rules above and the trigger ever disagree (e.g. at
  // exactly 20:00 the two clocks differ by a fraction of a second): the
  // database has the final say, and staff can simply try again.
  if (saveError) {
    console.error("updateOrderStatus: change_order_status failed:", saveError.message);
    return { ok: false, error: "We couldn't save the change. Please try again." };
  }
  if (changed !== true) return { ok: false, error: SOMEONE_ELSE };

  return { ok: true };
}
