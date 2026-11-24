/*
 * src/lib/orders/status-rules.ts
 *
 * WHAT: checkStatusChange(order, newStatus): THE server rule for whether an
 *       order's status may change to newStatus. Returns null if allowed, or
 *       a message saying why not.
 *
 * LAYER: Application layer (business rules). The updateOrderStatus server
 *        action (status-actions.ts) calls it BEFORE anything is saved.
 *        The buttons only SHOW the next step; this is what ENFORCES it,
 *        because a request can be sent without the buttons.
 *
 * STEP 26 (Deja) = the MINIMUM (decision):
 *   - a finished order (Completed, Cancelled, Abandoned) can't change;
 *   - otherwise only the ONE next step (nextStatus) or CANCELLED is allowed.
 *
 * =========================================================================
 * STEP 28 (Evon, FR-03 / FR-05): the FULL rules go HERE, in this function.
 *   CLAUDE.md: "Status may only move forward; reject skips and backwards
 *   moves with an error message. A pickup order can be marked ABANDONED only
 *   20 minutes or more after it became READY_FOR_PICKUP."
 *   To add:
 *     1. a clear message for each kind of mistake (skipping a step, moving
 *        backwards, changing a finished order) instead of the one general
 *        message below;
 *     2. ABANDONED: pickup orders only, and only 20+ minutes after they
 *        became READY_FOR_PICKUP. When that happened is in
 *        order_status_history (changed_at), so this function will need that
 *        time passed in (e.g. order.readyForPickupAt);
 *     3. anything stricter the team decides (e.g. a database-level guard).
 *   Keep it ONE function, so every way of changing a status (staff buttons
 *   now, the driver screen in Build step 6) goes through the same rules.
 * =========================================================================
 */

import { isFinalStatus, nextStatus, type OrderStatus } from "@/lib/order-status";
import type { Fulfilment } from "@/lib/order-rules";

/* What the rule needs to know about the order (read fresh from the database). */
export type OrderForStatusCheck = {
  status: OrderStatus;
  fulfilment: Fulfilment;
};

export function checkStatusChange(
  order: OrderForStatusCheck,
  newStatus: OrderStatus
): string | null {
  // Finished orders stay finished.
  if (isFinalStatus(order.status)) {
    return "This order is already finished, so its status can't change.";
  }

  // Cancel is allowed at any stage before the order is finished.
  if (newStatus === "CANCELLED") return null;

  // Otherwise only the one next step (no skipping, no going back).
  if (newStatus === nextStatus(order.status, order.fulfilment)) return null;

  // STEP 28: replace this general message with specific ones (see above).
  return "That status change isn't allowed.";
}
