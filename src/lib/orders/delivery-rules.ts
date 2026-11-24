/*
 * src/lib/orders/delivery-rules.ts
 *
 * WHAT: The delivery rules (FR-04):
 *       Step 31 (SR-4.1), assigning a driver:
 *         canChangeDriver(order)        -> may this order get / change a driver now?
 *         checkDriverAssignment(...)    -> null if the assignment is allowed,
 *                                          otherwise a message saying why not.
 *       Step 33 (SR-4.2 / SR-4.4), moving a delivery forward:
 *         checkDriverStatusChange(...)  -> what the DRIVER may do;
 *         counterDeliveryProblem(...)   -> what COUNTER STAFF may no longer do.
 *
 * LAYER: Application layer (business rules). Browser-safe: the "Assign
 *        driver" box uses canChangeDriver() to decide whether to show itself,
 *        and the SERVER action (delivery-actions.ts) uses both to DECIDE.
 *        The database function assign_delivery() (migration 0013) checks the
 *        same rules again, so a hand-made request can't get around them.
 */

import { STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import type { Fulfilment } from "@/lib/order-rules";

/*
 * The statuses in which the driver may be set or changed: everything BEFORE
 * the order leaves. Once it is Being delivered (or finished), the driver is
 * locked. (Same list as assign_delivery() in migration 0013.)
 */
export const DRIVER_CHANGE_STATUSES: OrderStatus[] = ["PENDING", "IN_PROGRESS", "READY_FOR_PICKUP"];

/* What the rule needs to know about the order (read FRESH by the server). */
export type OrderForDriverCheck = {
  id: number;
  status: OrderStatus;
  fulfilment: Fulfilment;
};

/*
 * canChangeDriver(order) -> true for a DELIVERY order that hasn't left yet.
 * The page uses it to show or hide the "Assign driver" box.
 */
export function canChangeDriver(order: Pick<OrderForDriverCheck, "status" | "fulfilment">): boolean {
  return order.fulfilment === "DELIVERY" && DRIVER_CHANGE_STATUSES.includes(order.status);
}

/*
 * checkDriverAssignment(order, currentDriverId, newDriverId, newIsDriver)
 *   currentDriverId = who has it now (null = no driver yet)
 *   newDriverId     = who staff chose
 *   newIsDriver     = is that person really delivery staff? (the server looks
 *                     this up in the database; never trusted from the browser)
 * One clear message for each kind of mistake.
 */
export function checkDriverAssignment(
  order: OrderForDriverCheck,
  currentDriverId: string | null,
  newDriverId: string,
  newIsDriver: boolean
): string | null {
  // SR-4.1: only delivery orders go to a driver.
  if (order.fulfilment !== "DELIVERY") {
    return `Order #${order.id} is a pickup order, so it doesn't need a driver.`;
  }

  // Only before it leaves (decision: the driver can change until then).
  if (!DRIVER_CHANGE_STATUSES.includes(order.status)) {
    return order.status === "BEING_DELIVERED"
      ? `Order #${order.id} has already left with its driver, so the driver can't change now.`
      : `Order #${order.id} is already ${STATUS_LABELS[order.status]}, so it can't get a driver.`;
  }

  // The chosen person must really be delivery staff.
  if (!newIsDriver) {
    return "That person isn't on the delivery staff. Choose a driver from the list.";
  }

  // Nothing would change.
  if (currentDriverId === newDriverId) {
    return "That driver is already assigned to this order.";
  }

  return null;
}

// =============================================================================
// Step 33: WHO may move a DELIVERY order forward (FR-04 SR-4.2 / SR-4.4)
// =============================================================================

/*
 * The steps a DRIVER may take (on their own screen):
 *   READY_FOR_PICKUP -> BEING_DELIVERED  ("Leaving now")
 *   BEING_DELIVERED  -> COMPLETED        (the handover, with the Order ID)
 * Cancel / Abandoned stay with counter staff.
 */
export const DRIVER_STATUSES: OrderStatus[] = ["BEING_DELIVERED", "COMPLETED"];

/*
 * checkDriverStatusChange(order, newStatus, isMine) -> null if the DRIVER may
 * ask for this change, otherwise a message. (The normal status rules, Step
 * 28's checkStatusChange(), are checked TOO: no skipping, no going back.)
 *   isMine = this delivery is assigned to the logged-in driver (read fresh
 *            from the deliveries table by the server).
 */
export function checkDriverStatusChange(
  order: OrderForDriverCheck,
  newStatus: OrderStatus,
  isMine: boolean
): string | null {
  if (order.fulfilment !== "DELIVERY" || !isMine) {
    return `Order #${order.id} isn't assigned to you (any more). Your list will update in a moment.`;
  }
  if (!DRIVER_STATUSES.includes(newStatus)) {
    return "Drivers can only mark an order Being delivered or Completed. Ask the counter for anything else.";
  }
  return null;
}

/*
 * counterDeliveryProblem(order, newStatus) -> null if COUNTER STAFF may make
 * this change, otherwise a message. Decision B (Step 33):
 *   - "Being delivered" is the DRIVER leaving, so only the driver marks it;
 *   - counter staff keep Cancel, and "Completed" as a BACKUP (e.g. the
 *     driver's phone died), with the same Order ID + cash handover check.
 * Pickup orders: nothing changes (null).
 */
export function counterDeliveryProblem(
  order: Pick<OrderForDriverCheck, "id" | "fulfilment">,
  newStatus: OrderStatus
): string | null {
  if (order.fulfilment === "DELIVERY" && newStatus === "BEING_DELIVERED") {
    return `The driver marks order #${order.id} Being delivered on their own screen when they leave.`;
  }
  return null;
}
