/*
 * src/lib/order-status.ts
 *
 * WHAT: The order statuses (SDS class OrderStatus) as code: their exact names,
 *       which ones count as "active" (still in the queue), and friendly labels
 *       for screens.
 *
 * LAYER: Application layer (shared values). Browser-safe: the staff queue
 *        (a browser component) and the server both use it.
 *
 * The names MUST match the database enum public.order_status (migration 0006)
 * and CLAUDE.md exactly. Do not rename them.
 *   Pickup:   PENDING -> IN_PROGRESS -> READY_FOR_PICKUP -> COMPLETED
 *   Delivery: PENDING -> IN_PROGRESS -> READY_FOR_PICKUP -> BEING_DELIVERED -> COMPLETED
 *   End states also allowed: CANCELLED, ABANDONED.
 * This file names the statuses, the normal path (statusSteps, nextStatus) and
 * the 20-minute Abandoned wait. The server's CHECK lives in
 * src/lib/orders/status-rules.ts, and the database's in migration 0011.
 */

import type { Fulfilment } from "@/lib/order-rules";

export type OrderStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "READY_FOR_PICKUP"
  | "BEING_DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "ABANDONED";

/*
 * FR-03: orders that are still being worked on, so they stay in the live
 * queue. COMPLETED, CANCELLED and ABANDONED leave it (they go to "Past
 * Orders", Step 26).
 */
export const ACTIVE_STATUSES: OrderStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "READY_FOR_PICKUP",
  "BEING_DELIVERED",
];

/*
 * FR-03: finished orders. They leave the queue and are listed under
 * "Past Orders" (Step 26), and their status can't change any more.
 */
export const FINAL_STATUSES: OrderStatus[] = ["COMPLETED", "CANCELLED", "ABANDONED"];

export function isFinalStatus(status: OrderStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

/*
 * statusSteps(fulfilment) -> the normal PATH an order walks, in order.
 *   Pickup:   PENDING -> IN_PROGRESS -> READY_FOR_PICKUP -> COMPLETED
 *   Delivery: PENDING -> IN_PROGRESS -> READY_FOR_PICKUP -> BEING_DELIVERED -> COMPLETED
 * Step 28: the server rule (status-rules.ts) compares POSITIONS on this path:
 * a lower position = "going backwards", two or more ahead = "skipping a step".
 * CANCELLED and ABANDONED are not on the path: they are exits, with their
 * own rules. (The database trigger in migration 0011 has the same two lists.)
 */
export function statusSteps(fulfilment: Fulfilment): OrderStatus[] {
  return fulfilment === "DELIVERY"
    ? ["PENDING", "IN_PROGRESS", "READY_FOR_PICKUP", "BEING_DELIVERED", "COMPLETED"]
    : ["PENDING", "IN_PROGRESS", "READY_FOR_PICKUP", "COMPLETED"];
}

/*
 * nextStatus(current, fulfilment) -> the ONE next step on the path, or null
 * if there is none (the order is finished).
 * Used by BOTH the status buttons (to show only the next step) and the server
 * (status-rules.ts, to allow only the next step), so they can never disagree.
 * (Cancel and Abandoned are extra choices, not "the next step".)
 */
export function nextStatus(current: OrderStatus, fulfilment: Fulfilment): OrderStatus | null {
  const steps = statusSteps(fulfilment);
  const position = steps.indexOf(current); // -1 = not on the path (Cancelled, Abandoned)
  if (position === -1) return null;
  return steps[position + 1] ?? null; // nothing after COMPLETED -> null
}

/*
 * SR-5.5: a PICKUP order may be marked ABANDONED only this many minutes (or
 * more) after it became READY_FOR_PICKUP. The database trigger (migration
 * 0011) uses the same number: if you ever change it, change it in BOTH places.
 */
export const ABANDON_AFTER_MINUTES = 20;

/* What each status is called on screen, e.g. READY_FOR_PICKUP -> "Ready for pickup". */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  READY_FOR_PICKUP: "Ready for pickup",
  BEING_DELIVERED: "Being delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  ABANDONED: "Abandoned",
};

// ---- Payments (SDS class Payment) ----------------------------------------------

/*
 * Names MUST match the database (payments.method / payments.status, 0006,
 * 0010, 0021).
 *   method: LYNK or CASH (never card details: Security).
 *   status: UNPAID -> PAID -> REFUNDED. Cash is marked PAID at the counter
 *           handover (Step 27) or by the driver (Step 33); Lynk when the
 *           Supervisor verifies it (Step 38a). REFUNDED = the Supervisor
 *           refunded ALL of it (Step 38b); a partly refunded payment stays PAID.
 */
export type PaymentMethod = "LYNK" | "CASH";
export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  LYNK: "Lynk",
  CASH: "Cash",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PAID: "Paid",
  REFUNDED: "Refunded",
};
