/*
 * src/components/StaffQueue.tsx
 *
 * WHAT: The counter staff's LIVE order queue (FR-03): one card per active
 *       order, oldest at the top, so new orders appear at the BOTTOM as
 *       Pending. Each card: Order ID, items (size, extras, meal notes), order
 *       time, "Ready by", pickup or delivery (and where), and status.
 *       Tapping a card opens that order's full details (Step 25).
 *
 * LAYER: Presentation. The orders come from getActiveOrders()
 *        (src/lib/orders/get-queue.ts, Application layer), loaded on the server.
 *
 * LIVE (FR-01: new orders in the staff queue within 3 seconds): handled by
 * <OrderLiveRefresh> (Realtime -> router.refresh(), see that file). When it
 * refreshes, the server builds this list again with the latest orders.
 *
 * No "use client" since Step 25: the live part moved into OrderLiveRefresh,
 * so this list is drawn on the server and arrives as plain HTML.
 *
 * NOT HERE YET: status buttons and "Past Orders" (Step 26); the server's
 * status rules (Step 28).
 */

import Link from "next/link";
import OrderLiveRefresh from "@/components/OrderLiveRefresh";
import StatusBadge from "@/components/StatusBadge";
import { formatJamaicaTime } from "@/lib/order-rules";
import type { QueueOrder } from "@/lib/orders/get-queue";

type Props = {
  orders: QueueOrder[];
  loadError: boolean; // true = the server couldn't read the queue
};

export default function StaffQueue({ orders, loadError }: Props) {
  return (
    <section aria-labelledby="queue-title">
      <div className="flex items-center justify-between gap-3 pt-6">
        <h1 id="queue-title" className="text-3xl font-extrabold">
          Order queue
        </h1>
        {/* Listens to ALL orders; shows "● Live". */}
        <OrderLiveRefresh channelName="staff-queue" />
      </div>
      <p className="mt-1 text-sm text-stone-600">
        Active orders, oldest first. New orders appear at the bottom. Tap an order for details.
      </p>

      {loadError && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          We couldn&apos;t load the order queue. Check the connection and refresh the page.
        </p>
      )}

      {!loadError && orders.length === 0 && (
        <p className="mt-6 rounded-xl bg-white p-6 text-center text-stone-600 shadow-sm">
          No active orders right now. New orders will appear here automatically.
        </p>
      )}

      {/* The vertical queue (FR-03). <ol> = an ordered list: the order matters. */}
      <ol className="mt-4 flex flex-col gap-3">
        {orders.map((order) => (
          <li key={order.id}>
            <OrderCard order={order} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/*
 * OrderCard: one order in the queue. The WHOLE card is a link to the order's
 * details (Step 25): a big tap target, easy on a phone.
 * PHONES (staff use smartphones): everything stacked; the Order ID and status
 * stay on the top line so they're seen first.
 */
function OrderCard({ order }: { order: QueueOrder }) {
  const readyBy = order.isAsap
    ? `ASAP (about ${formatJamaicaTime(order.requestedTime)})`
    : formatJamaicaTime(order.requestedTime);

  return (
    <Link
      href={`/staff/orders/${order.id}`}
      aria-label={`Order ${order.id}, view details`}
      className="block rounded-xl bg-white p-4 shadow-sm ring-brand hover:ring-2 focus-visible:ring-2"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-extrabold">#{order.id}</h2>
        <StatusBadge status={order.status} />
      </div>

      {/* Order time, Ready by, pickup or delivery. */}
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div className="flex gap-1">
          <dt className="text-stone-500">Ordered</dt>
          <dd className="font-semibold">{formatJamaicaTime(order.createdAt)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-stone-500">Ready by</dt>
          <dd className="font-semibold">{readyBy}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="sr-only">Pickup or delivery</dt>
          <dd className="font-semibold">
            {order.fulfilment === "DELIVERY"
              ? `Delivery: ${order.locationName ?? "location missing"}`
              : "Pickup"}
          </dd>
        </div>
      </dl>

      {/* Items, with extras and meal notes (the kitchen needs the notes). */}
      <ul className="mt-3 flex flex-col gap-2 border-t border-stone-100 pt-3">
        {order.items.map((item) => (
          <li key={item.id}>
            <p className="font-semibold">
              {item.quantity} × {item.name}
              {item.size && ` (${item.size})`}
            </p>
            {item.extras.length > 0 && (
              <p className="text-sm text-stone-600">+ {item.extras.join(", ")}</p>
            )}
            {item.note && (
              <p className="mt-1 break-words rounded bg-amber-50 px-2 py-1 text-sm text-amber-950">
                Note: &quot;{item.note}&quot;
              </p>
            )}
          </li>
        ))}
      </ul>
    </Link>
  );
}
