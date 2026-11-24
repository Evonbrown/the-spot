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
 * ALSO HERE (Step 27, bottom of the file): checkPickupHandover(), the SAF-1
 * Order ID check and "cash received" check when a PICKUP order is completed.
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

import { formatPrice } from "@/lib/menu-helpers";
import {
  isFinalStatus,
  nextStatus,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/order-status";
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

// =============================================================================
// STEP 27 (Deja): the PICKUP HANDOVER check (SAF-1, FR-06)
// =============================================================================

/*
 * needsPickupHandover(order, newStatus) -> true when completing a PICKUP
 * order: then staff must type the Order ID the customer gives them (SAF-1:
 * "Order ID confirmed before handover").
 * Delivery orders are handed over by the driver (Build step 6), so they
 * don't need it here.
 */
export function needsPickupHandover(order: OrderForStatusCheck, newStatus: OrderStatus): boolean {
  return newStatus === "COMPLETED" && order.fulfilment === "PICKUP";
}

/* What staff entered in the handover form. */
export type PickupHandover = {
  typedOrderId: string; // what the customer said / showed, typed by staff
  cashReceived: boolean; // the "Cash received (J$X)" tick box
};

/* The order's payment, read FRESH from the database by the server. */
export type PaymentForHandover = {
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
};

/*
 * cashToCollect(payment) -> true if staff must collect cash at this handover:
 * a CASH payment that is still UNPAID. (Lynk: the Supervisor verifies it
 * later, Build step 7. Already paid: nothing to collect.)
 */
export function cashToCollect(payment: PaymentForHandover | null): boolean {
  return payment !== null && payment.method === "CASH" && payment.status === "UNPAID";
}

/*
 * checkPickupHandover(orderId, payment, handover) -> null if OK, or a message.
 * Used by the SERVER (status-actions.ts), which decides, and by the page for
 * an instant hint before sending (the server checks again anyway).
 *   1. SAF-1: the typed Order ID must match this order. "#1004", " 1004 "
 *      and "1004" all count; anything else is blocked.
 *   2. FR-06: for an unpaid CASH order, "cash received" must be ticked, so the
 *      payment can be marked PAID in the same step.
 */
export function checkPickupHandover(
  orderId: number,
  payment: PaymentForHandover | null,
  handover: PickupHandover
): string | null {
  // Tidy what was typed: remove spaces and a leading "#".
  const typed = handover.typedOrderId.trim().replace(/^#\s*/, "");
  if (typed === "") {
    return "Type the Order ID the customer gives you.";
  }
  if (typed !== String(orderId)) {
    return `That Order ID doesn't match this order (#${orderId}). Check you have the right bag, and ask the customer to show their order number.`;
  }

  if (payment === null) {
    return "This order has no payment record. Ask a manager before handing it over.";
  }
  if (cashToCollect(payment) && !handover.cashReceived) {
    return `Confirm the cash was received (${formatPrice(payment.amount)}) before completing the order.`;
  }

  return null;
}
