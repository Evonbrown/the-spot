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
 * (The "only forward" rules are Step 28, on the server. This file only names them.)
 */

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
