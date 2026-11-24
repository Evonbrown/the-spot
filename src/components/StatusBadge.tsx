/*
 * src/components/StatusBadge.tsx
 *
 * WHAT: The coloured status label, e.g. "Pending" or "Ready for pickup".
 *       Used by the staff queue (Step 24) and the order details (Step 25).
 *
 * LAYER: Presentation. Names and labels come from src/lib/order-status.ts.
 *
 * WHY one shared piece? Staff learn the colours ("amber = Pending"); every
 * screen must use the SAME colour for the same status. Colour is never the
 * only signal: the status is always written out too (accessibility).
 */

import { STATUS_LABELS, type OrderStatus } from "@/lib/order-status";

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  IN_PROGRESS: "bg-sky-100 text-sky-900",
  READY_FOR_PICKUP: "bg-green-100 text-green-900",
  BEING_DELIVERED: "bg-violet-100 text-violet-900",
  COMPLETED: "bg-stone-100 text-stone-700",
  CANCELLED: "bg-stone-100 text-stone-700",
  ABANDONED: "bg-stone-100 text-stone-700",
};

export default function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
