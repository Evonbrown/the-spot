/*
 * src/lib/orders/status-rules.ts
 *
 * WHAT: checkStatusChange(order, newStatus, now): THE server rule for whether
 *       an order's status may change to newStatus. Returns null if allowed,
 *       or a message saying why not.
 *
 * LAYER: Application layer (business rules). The updateOrderStatus server
 *        action (status-actions.ts) calls it BEFORE anything is saved.
 *        The buttons only SHOW the next step; this is what ENFORCES it,
 *        because a request can be sent without the buttons.
 *
 * ALSO HERE (Step 27, bottom of the file): checkPickupHandover(), the SAF-1
 * Order ID check and "cash received" check when a PICKUP order is completed.
 *
 * HISTORY: Step 26 (Deja) added the minimum version. Step 28 (FR-05 SR-5.3 /
 * SR-5.5) made it the FULL rules below, with a clear message per mistake.
 *
 * THE SAME RULES ALSO LIVE IN THE DATABASE (Step 28, migration 0011): a
 * "trigger" checks every status change again, so a hand-made request, a
 * future function or a mistake typed into the SQL Editor can't get around
 * them. This file gives staff FRIENDLY messages; the trigger is the safety
 * net. Keep the two in step if a rule ever changes.
 *
 * Keep it ONE function, so every way of changing a status (staff buttons now,
 * the driver screen in Build step 6) goes through the same rules.
 */

import { formatPrice } from "@/lib/menu-helpers";
import {
  ABANDON_AFTER_MINUTES,
  isFinalStatus,
  STATUS_LABELS,
  statusSteps,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/order-status";
import { formatJamaicaTime, type Fulfilment } from "@/lib/order-rules";

/* What the rule needs to know about the order (read FRESH from the database). */
export type OrderForStatusCheck = {
  id: number; // the Order ID, for the messages
  status: OrderStatus;
  fulfilment: Fulfilment;
  // When it became READY_FOR_PICKUP (milliseconds since 1970), from
  // order_status_history. null = not ready yet (or no history row).
  readyForPickupAt: number | null;
  // Step 31: does it have a driver (a row in deliveries)? Delivery orders
  // can't become Being delivered without one.
  hasDriver: boolean;
};

const MINUTE = 60_000; // one minute in milliseconds

/*
 * checkStatusChange(order, newStatus, now) -> null if allowed, else a message.
 *   now = the current time (milliseconds). It is passed in (not read inside)
 *   so the rule is easy to test: "pretend it is 19 minutes later".
 * The checks, in order:
 *   1. a finished order (Completed / Cancelled / Abandoned) is LOCKED;
 *   2. choosing the status it already has does nothing, so it's refused;
 *   3. CANCELLED is allowed from any status that isn't finished;
 *   4. ABANDONED has its own rule (checkAbandon, below);
 *   5. everything else must be exactly ONE step forward on the order's path:
 *      not a status from the other path, not backwards, not a skip;
 *   6. Step 31: Being delivered needs a driver.
 */
export function checkStatusChange(
  order: OrderForStatusCheck,
  newStatus: OrderStatus,
  now: number
): string | null {
  const from = STATUS_LABELS[order.status];
  const to = STATUS_LABELS[newStatus];

  // 1. SR-5.3: finished orders stay finished.
  if (isFinalStatus(order.status)) {
    return `Order #${order.id} is already ${from}. Finished orders can't change.`;
  }

  // 2. Nothing would change.
  if (newStatus === order.status) {
    return `Order #${order.id} is already ${from}.`;
  }

  // 3. Cancel: allowed at any stage before the order is finished.
  if (newStatus === "CANCELLED") return null;

  // 4. SR-5.5: Abandoned.
  if (newStatus === "ABANDONED") return checkAbandon(order, now);

  // 5. Forward, one step at a time. Compare positions on the order's path,
  //    e.g. pickup: PENDING(0) IN_PROGRESS(1) READY_FOR_PICKUP(2) COMPLETED(3).
  const steps = statusSteps(order.fulfilment);
  const fromPosition = steps.indexOf(order.status);
  const toPosition = steps.indexOf(newStatus);

  // A status that isn't on this path at all (Being delivered for pickup).
  if (toPosition === -1) {
    const kind = order.fulfilment === "PICKUP" ? "Pickup" : "Delivery";
    return `${kind} orders don't go to ${to}.`;
  }
  // Can't happen with real data (e.g. a pickup order that is "Being
  // delivered"), but if it ever does, refuse rather than guess.
  if (fromPosition === -1) {
    return "That status change isn't allowed.";
  }

  // Lower (or same) position = going backwards.
  if (toPosition < fromPosition) {
    return `Order #${order.id} can't go back from ${from} to ${to}. Statuses only move forward.`;
  }
  // Two or more positions ahead = skipping a step.
  if (toPosition > fromPosition + 1) {
    const next = STATUS_LABELS[steps[fromPosition + 1]];
    return `You can't skip steps. The next step for order #${order.id} is ${next}.`;
  }

  // Step 31 (FR-04): nothing goes "on the road" with nobody responsible for
  // it. (The database trigger in migration 0013 checks this too.)
  if (newStatus === "BEING_DELIVERED" && !order.hasDriver) {
    return `Assign a driver to order #${order.id} before it goes out for delivery.`;
  }

  return null; // exactly one step forward: allowed
}

/*
 * abandonAllowedFrom(order) -> the time (milliseconds) from which this order
 * may be marked ABANDONED, or null if it can't be abandoned at all (not a
 * pickup order, not ready for pickup, or we don't know when it became ready).
 * SR-5.5: READY_FOR_PICKUP time + 20 minutes.
 * The staff page uses it too, to show the button (or the "from 2:36 p.m."
 * hint) at the right moment, so the page and the server can't disagree.
 */
export function abandonAllowedFrom(
  order: Pick<OrderForStatusCheck, "status" | "fulfilment" | "readyForPickupAt">
): number | null {
  if (order.fulfilment !== "PICKUP") return null;
  if (order.status !== "READY_FOR_PICKUP") return null;
  if (order.readyForPickupAt === null) return null;
  return order.readyForPickupAt + ABANDON_AFTER_MINUTES * MINUTE;
}

/*
 * formatAbandonTime(time) -> e.g. "2:36 p.m.", ROUNDED UP to the next whole
 * minute. Why round up? If it became ready at 2:15:40, it's allowed at
 * 2:35:40. Showing "2:35" would invite staff to try at 2:35:10 and be
 * refused; "2:36" is always true.
 */
export function formatAbandonTime(time: number): string {
  return formatJamaicaTime(Math.ceil(time / MINUTE) * MINUTE);
}

/*
 * checkAbandon(order, now) -> null if the order may be marked ABANDONED now.
 * SR-5.5, three conditions, each with its own message:
 *   a. pickup orders only (a delivery order is with the driver, not waiting
 *      at the counter);
 *   b. only from READY_FOR_PICKUP (before that, the food isn't even ready);
 *   c. only when 20 minutes OR MORE have passed since it became ready.
 *      ">=" means: at exactly 20:00 it IS allowed; at 19:59 it is not.
 */
function checkAbandon(order: OrderForStatusCheck, now: number): string | null {
  if (order.fulfilment !== "PICKUP") {
    return "Only pickup orders can be marked Abandoned.";
  }
  if (order.status !== "READY_FOR_PICKUP") {
    return "An order can only be marked Abandoned when it is Ready for pickup.";
  }

  const allowedFrom = abandonAllowedFrom(order);
  if (allowedFrom === null) {
    // Ready, but no history row says WHEN: refuse rather than guess.
    return "We can't tell when this order became ready, so it can't be marked Abandoned.";
  }

  if (now < allowedFrom) {
    // Math.max(0, ...): never show "-1 minutes" if two clocks differ slightly.
    const minutes = Math.max(0, Math.floor((now - (order.readyForPickupAt ?? now)) / MINUTE));
    return `Order #${order.id} has been ready for ${minutes} minute${minutes === 1 ? "" : "s"}. It can be marked Abandoned from ${formatAbandonTime(allowedFrom)} (${ABANDON_AFTER_MINUTES} minutes after it was ready).`;
  }

  return null;
}

/*
 * findReadyForPickupAt(history) -> when the order became READY_FOR_PICKUP
 * (milliseconds), from its order_status_history rows, or null if never.
 * If there were somehow two such rows, the LATEST one counts (the safe
 * choice: the customer gets the longer wait).
 * Shared by the server action and the staff details page, so both read the
 * time the same way.
 */
export function findReadyForPickupAt(
  history: { status: OrderStatus; changed_at: string }[] | null | undefined
): number | null {
  let latest: number | null = null;
  for (const row of history ?? []) {
    if (row.status !== "READY_FOR_PICKUP") continue;
    const time = Date.parse(row.changed_at);
    if (!Number.isNaN(time) && (latest === null || time > latest)) latest = time;
  }
  return latest;
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
export function needsPickupHandover(order: { fulfilment: Fulfilment }, newStatus: OrderStatus): boolean {
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
