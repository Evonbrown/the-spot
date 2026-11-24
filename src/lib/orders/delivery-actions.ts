/*
 * src/lib/orders/delivery-actions.ts
 *
 * WHAT: assignDriver(): the Server Action behind the "Assign driver" box on
 *       the staff order details page (Step 31, FR-04 SR-4.1 / AC-1,
 *       TS-4.1.2). It assigns a delivery order to a driver, or changes the
 *       driver, saving it with the database function assign_delivery().
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
import type { OrderStatus } from "@/lib/order-status";
import type { Fulfilment } from "@/lib/order-rules";
import { checkDriverAssignment } from "@/lib/orders/delivery-rules";
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
    return { ok: false, error: "We couldn't save the driver. Please try again." };
  }
  if (saved !== true) return { ok: false, error: SOMEONE_ELSE };

  return { ok: true };
}
