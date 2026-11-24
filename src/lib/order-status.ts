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
 * This file names the statuses and the normal next step (nextStatus). The
 * server's CHECK lives in src/lib/orders/status-rules.ts (full rules: Step 28).
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
 * nextStatus(current, fulfilment) -> the ONE next step, or null if finished.
 *   Pickup:   PENDING -> IN_PROGRESS -> READY_FOR_PICKUP -> COMPLETED
 *   Delivery: PENDING -> IN_PROGRESS -> READY_FOR_PICKUP -> BEING_DELIVERED -> COMPLETED
 * Used by BOTH the status buttons (to show only the next step) and the server
 * (status-rules.ts, to allow only the next step), so they can never disagree.
 * (Cancel and, later, Abandoned are extra choices, not "the next step".)
 */
export function nextStatus(current: OrderStatus, fulfilment: Fulfilment): OrderStatus | null {
  switch (current) {
    case "PENDING":
      return "IN_PROGRESS";
    case "IN_PROGRESS":
      return "READY_FOR_PICKUP";
    case "READY_FOR_PICKUP":
      // The one place pickup and delivery differ.
      return fulfilment === "DELIVERY" ? "BEING_DELIVERED" : "COMPLETED";
    case "BEING_DELIVERED":
      return "COMPLETED";
    default:
      return null; // COMPLETED, CANCELLED, ABANDONED: finished
  }
}

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
