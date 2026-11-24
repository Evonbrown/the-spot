/*
 * src/lib/orders/status-actions.ts
 *
 * WHAT: updateOrderStatus(): the Server Action behind the status buttons on
 *       the staff order details page (Step 26, FR-03 SR-3.4 / SR-3.5 / AC-3).
 *       It checks who is asking and whether the change is allowed, then saves
 *       the new status AND its history row with change_order_status().
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
import { checkStatusChange } from "@/lib/orders/status-rules";
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
 * updateOrderStatus(orderId, seenStatus, newStatus)
 *   seenStatus = the status the staff member SAW when they tapped. If the
 *   order has moved on since then (another staff member, another tab), we
 *   stop and say so, instead of applying the tap to a different step.
 * Steps 1-4 below; nothing is saved unless all pass.
 */
export async function updateOrderStatus(
  rawOrderId: unknown,
  rawSeenStatus: unknown,
  rawNewStatus: unknown
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
  // orders, 0007), not the secret key: least privilege.
  const supabase = await createClient();
  const { data: order, error: readError } = await supabase
    .from("orders")
    .select("status, fulfilment")
    .eq("id", orderId)
    .maybeSingle();

  if (readError) {
    console.error("updateOrderStatus: could not read the order:", readError.message);
    return { ok: false, error: "We couldn't reach the database. Please try again." };
  }
  if (!order) return { ok: false, error: "Order not found." };

  const current = order as { status: OrderStatus; fulfilment: Fulfilment };
  if (current.status !== rawSeenStatus) return { ok: false, error: SOMEONE_ELSE };

  // THE rule (Step 26 minimum; Step 28 adds the full rules in this function).
  const ruleError = checkStatusChange(current, rawNewStatus);
  if (ruleError) return { ok: false, error: ruleError };

  // ---- 4. SAVE: status + history together (one transaction, 0009) ----
  // Only if the status is STILL current.status (someone may tap at the same
  // moment); the function then returns false and nothing changes.
  const admin = createAdminClient();
  const { data: changed, error: saveError } = await admin.rpc("change_order_status", {
    p_order_id: orderId,
    p_expected_status: current.status,
    p_new_status: rawNewStatus,
    p_changed_by: profile.id, // who changed it (from the login cookie)
  });

  if (saveError) {
    console.error("updateOrderStatus: change_order_status failed:", saveError.message);
    return { ok: false, error: "We couldn't save the change. Please try again." };
  }
  if (changed !== true) return { ok: false, error: SOMEONE_ELSE };

  return { ok: true };
}
