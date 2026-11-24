/*
 * src/lib/orders/delivery-actions.ts
 *
 * WHAT: Two Server Actions for deliveries (FR-04):
 *       assignDriver() (Step 31, SR-4.1 / AC-1, TS-4.1.2): behind the
 *         "Assign driver" box on the staff order details page. It assigns a
 *         delivery order to a driver, or changes the driver, saving it with
 *         the database function assign_delivery().
 *       updateDeliveryStatus() (Step 33, SR-4.2 / SR-4.3 / SR-4.4, SAF-1,
 *         FR-06): behind the DRIVER's buttons: "Mark Being delivered" and the
 *         handover (typed Order ID + "cash received"), saved with
 *         driver_change_delivery_status() (migration 0015).
 *
 * LAYER: Application layer. The box (Presentation) only calls it; the rule
 *        is checkDriverAssignment() (delivery-rules.ts); the save is the
 *        database function (Data layer, migration 0013), which checks again.
 *
 * WHY A SERVER ACTION? Staff can't write the deliveries table (only SELECT
 * is granted), and a request can be sent without our page. So every
 * assignment comes through here, and only the server (secret key) may run
 * assign_delivery(). Same pattern as status changes (status-actions.ts).
 *
 * "use server" = the browser can ask the server to run this, but the code
 * itself never goes to the browser.
 */
"use server";

import { getCurrentProfile } from "@/lib/auth/get-profile";
import { STATUS_LABELS, type OrderStatus, type PaymentMethod, type PaymentStatus } from "@/lib/order-status";
import type { Fulfilment } from "@/lib/order-rules";
import { checkDriverAssignment, checkDriverStatusChange } from "@/lib/orders/delivery-rules";
import { DAY_CLOSED_MESSAGE, isDayClosedError } from "@/lib/reports/closeout-rules";
import {
  cashToCollect,
  checkHandover,
  checkStatusChange,
  needsHandover,
  readHandover,
  type PaymentForHandover,
} from "@/lib/orders/status-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/* What the box gets back: ok, or a message to show. */
export type AssignDriverResult = { ok: true } | { ok: false; error: string };

const SOMEONE_ELSE =
  "The driver for this order was just changed by someone else. The page now shows the latest driver.";

// A profile id is a UUID, e.g. "3f2b8c1e-...". The browser can send anything,
// so we check the shape before using it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * assignDriver(orderId, seenDriverId, newDriverId)
 *   seenDriverId = the driver staff SAW on the page (null = "No driver yet").
 *     If it has changed since (another staff member), we stop and say so.
 *   newDriverId  = the driver they chose.
 * Steps 1-5 below; nothing is saved unless all pass.
 */
export async function assignDriver(
  rawOrderId: unknown,
  rawSeenDriverId: unknown,
  rawNewDriverId: unknown
): Promise<AssignDriverResult> {
  // ---- 1. WHO: counter staff only (strict role access) ----
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  if (profile.role !== "counter_staff") {
    return { ok: false, error: "Only counter staff can assign drivers." };
  }

  // ---- 2. SHAPE ----
  if (!Number.isSafeInteger(rawOrderId) || (rawOrderId as number) <= 0) {
    return { ok: false, error: "That order number isn't valid." };
  }
  if (rawSeenDriverId !== null && (typeof rawSeenDriverId !== "string" || !UUID.test(rawSeenDriverId))) {
    return { ok: false, error: "Please refresh the page and try again." };
  }
  if (typeof rawNewDriverId !== "string" || !UUID.test(rawNewDriverId)) {
    return { ok: false, error: "Choose a driver from the list." };
  }
  const orderId = rawOrderId as number;
  const seenDriverId = rawSeenDriverId as string | null;
  const newDriverId = rawNewDriverId;

  // ---- 3. FRESH READS (staff's own login, RLS: 0007 + 0013) ----
  // The order with its current delivery row, and the chosen person's role.
  const supabase = await createClient();
  const [orderResult, driverResult] = await Promise.all([
    supabase
      .from("orders")
      .select("status, fulfilment, deliveries ( driver_id )")
      .eq("id", orderId)
      .maybeSingle(),
    // Counter staff can only read DELIVERY STAFF profiles (and customers
    // with orders), so another staff member's id simply isn't found here.
    supabase.from("profiles").select("role").eq("id", newDriverId).maybeSingle(),
  ]);

  if (orderResult.error || driverResult.error) {
    console.error(
      "assignDriver: read failed:",
      orderResult.error?.message ?? driverResult.error?.message
    );
    return { ok: false, error: "We couldn't reach the database. Please try again." };
  }
  if (!orderResult.data) return { ok: false, error: "Order not found." };

  const row = orderResult.data as unknown as {
    status: OrderStatus;
    fulfilment: Fulfilment;
    // One-to-one: Supabase may give one object or a list of one.
    deliveries: { driver_id: string } | { driver_id: string }[] | null;
  };
  const delivery = Array.isArray(row.deliveries) ? row.deliveries[0] : row.deliveries;
  const currentDriverId = delivery?.driver_id ?? null;

  // Changed since staff looked? Then don't apply their choice.
  if (currentDriverId !== seenDriverId) return { ok: false, error: SOMEONE_ELSE };

  // ---- 4. THE RULE ----
  const ruleError = checkDriverAssignment(
    { id: orderId, status: row.status, fulfilment: row.fulfilment },
    currentDriverId,
    newDriverId,
    driverResult.data?.role === "delivery_personnel"
  );
  if (ruleError) return { ok: false, error: ruleError };

  // ---- 5. SAVE (server only, one transaction; the function checks again) ----
  const admin = createAdminClient();
  const { data: saved, error: saveError } = await admin.rpc("assign_delivery", {
    p_order_id: orderId,
    p_expected_driver_id: currentDriverId,
    p_driver_id: newDriverId,
    p_assigned_by: profile.id, // who assigned it (from the login cookie)
  });

  if (saveError) {
    console.error("assignDriver: assign_delivery failed:", saveError.message);
    // Step 36: the day is closed (locked): say so, don't just "try again".
    if (isDayClosedError(saveError.message)) return { ok: false, error: DAY_CLOSED_MESSAGE };
    return { ok: false, error: "We couldn't save the driver. Please try again." };
  }
  if (saved !== true) return { ok: false, error: SOMEONE_ELSE };

  return { ok: true };
}


// =============================================================================
// Step 33: the DRIVER's buttons
// =============================================================================

/* What the driver's buttons get back: ok, or a message to show. */
export type DeliveryStatusResult = { ok: true } | { ok: false; error: string };

const ALL_STATUSES = Object.keys(STATUS_LABELS) as OrderStatus[];
const isStatus = (value: unknown): value is OrderStatus =>
  typeof value === "string" && (ALL_STATUSES as string[]).includes(value);

const STATUS_CHANGED =
  "This order was just updated by someone else. Your list now shows its latest status.";

/*
 * updateDeliveryStatus(orderId, seenStatus, newStatus, handover?)
 *   seenStatus = the status the driver SAW (if it changed since, we stop).
 *   newStatus  = BEING_DELIVERED ("Leaving now") or COMPLETED (handover).
 *   handover   = for COMPLETED: the Order ID the customer gave and the
 *                "Cash received (J$X)" tick.
 * Steps 1-6 below; nothing is saved unless all pass.
 */
export async function updateDeliveryStatus(
  rawOrderId: unknown,
  rawSeenStatus: unknown,
  rawNewStatus: unknown,
  rawHandover?: unknown
): Promise<DeliveryStatusResult> {
  // ---- 1. WHO: delivery staff only ----
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  if (profile.role !== "delivery_personnel") {
    return { ok: false, error: "Only delivery staff can use these buttons." };
  }

  // ---- 2. SHAPE ----
  if (!Number.isSafeInteger(rawOrderId) || (rawOrderId as number) <= 0) {
    return { ok: false, error: "That order number isn't valid." };
  }
  if (!isStatus(rawSeenStatus) || !isStatus(rawNewStatus)) {
    return { ok: false, error: "That status isn't valid." };
  }
  const orderId = rawOrderId as number;

  // ---- 3. FRESH READ with the driver's OWN login (RLS, migration 0014:
  //         only MY deliveries, their orders and payments) ----
  const supabase = await createClient();
  const { data, error: readError } = await supabase
    .from("orders")
    .select("status, fulfilment, deliveries ( driver_id ), payments ( method, status, amount )")
    .eq("id", orderId)
    .maybeSingle();

  if (readError) {
    console.error("updateDeliveryStatus: could not read the order:", readError.message);
    return { ok: false, error: "We couldn't reach the database. Please try again." };
  }
  // Not found = not (or no longer) assigned to me: RLS hides it.
  if (!data) {
    return { ok: false, error: `Order #${orderId} isn't assigned to you (any more). Your list will update in a moment.` };
  }

  type PaymentRow = { method: PaymentMethod; status: PaymentStatus; amount: number | string };
  const row = data as unknown as {
    status: OrderStatus;
    fulfilment: Fulfilment;
    deliveries: { driver_id: string } | { driver_id: string }[] | null;
    payments: PaymentRow | PaymentRow[] | null;
  };
  const delivery = Array.isArray(row.deliveries) ? row.deliveries[0] : row.deliveries;
  const paymentRow = Array.isArray(row.payments) ? row.payments[0] : row.payments;
  const payment: PaymentForHandover | null = paymentRow
    ? { method: paymentRow.method, status: paymentRow.status, amount: Number(paymentRow.amount) }
    : null;

  if (row.status !== rawSeenStatus) return { ok: false, error: STATUS_CHANGED };

  // ---- 4. THE RULES ----
  // a. what a DRIVER may do (my delivery; only Being delivered / Completed);
  const driverError = checkDriverStatusChange(
    { id: orderId, status: row.status, fulfilment: row.fulfilment },
    rawNewStatus,
    delivery?.driver_id === profile.id
  );
  if (driverError) return { ok: false, error: driverError };

  // b. the normal status rules (Step 28: one step forward, no skipping).
  //    hasDriver = true (it's mine); readyForPickupAt only matters for
  //    Abandoned, which drivers can't choose.
  const ruleError = checkStatusChange(
    { id: orderId, status: row.status, fulfilment: row.fulfilment, readyForPickupAt: null, hasDriver: true },
    rawNewStatus,
    Date.now()
  );
  if (ruleError) return { ok: false, error: ruleError };

  // ---- 5. HANDOVER (SAF-1 + FR-06), the same check as the counter's ----
  let cashReceived = false;
  if (needsHandover(rawNewStatus)) {
    const handover = readHandover(rawHandover);
    if (!handover) return { ok: false, error: "Type the Order ID the customer gives you." };
    const handoverError = checkHandover(orderId, payment, handover);
    if (handoverError) return { ok: false, error: handoverError };
    // Unpaid cash + ticked -> PAID in the same transaction (paid_by = driver).
    // (Lynk stays UNPAID: the Supervisor verifies it, Build step 7.)
    cashReceived = cashToCollect(payment);
  }

  // ---- 6. SAVE (server only, one transaction; the function checks again) ----
  const admin = createAdminClient();
  const { data: changed, error: saveError } = await admin.rpc("driver_change_delivery_status", {
    p_order_id: orderId,
    p_expected_status: row.status,
    p_new_status: rawNewStatus,
    p_driver_id: profile.id, // from the login cookie, never from the browser
    p_cash_received: cashReceived,
  });

  if (saveError) {
    console.error("updateDeliveryStatus: driver_change_delivery_status failed:", saveError.message);
    // Step 36: the day is closed (locked): say so, don't just "try again".
    if (isDayClosedError(saveError.message)) return { ok: false, error: DAY_CLOSED_MESSAGE };
    return { ok: false, error: "We couldn't save that. Please try again." };
  }
  if (changed !== true) return { ok: false, error: STATUS_CHANGED };

  return { ok: true };
}
