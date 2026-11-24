/*
 * src/components/StaffQueue.tsx
 *
 * WHAT: The counter staff's LIVE order queue (FR-03): one card per active
 *       order, oldest at the top, so new orders appear at the BOTTOM as
 *       Pending. Each card: Order ID, items (size, extras, meal notes), order
 *       time, "Ready by", pickup or delivery (and where), and status.
 *
 * LAYER: Presentation. The orders come from getActiveOrders()
 *        (src/lib/orders/get-queue.ts, Application layer), loaded on the server.
 *
 * HOW "LIVE" WORKS (FR-01: new orders in the staff queue within 3 seconds):
 *   1. This component SUBSCRIBES to Supabase Realtime: "tell me whenever a
 *      row in the orders table is added or changed".
 *   2. When a message arrives, it calls router.refresh(): Next.js asks the
 *      server to build the /staff page again, which reads the queue fresh
 *      and sends the new cards. Nothing else on the page is reset.
 *   WHY refresh instead of using the message itself? The message only holds
 *   the orders ROW, not its items. Re-reading means the queue is always built
 *   ONE way, so the first load and the live updates can never disagree.
 *   Realtime checks RLS for each listener, so only counter staff hear about
 *   every order (migration 0007).
 *
 * NOT HERE YET: status buttons and "Past Orders" (Step 26); the server's
 * status rules (Step 28).
 *
 * "use client" = it runs in the browser, because the Realtime connection
 * lives in the browser.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import { formatJamaicaTime } from "@/lib/order-rules";
import type { QueueOrder } from "@/lib/orders/get-queue";
import { createClient } from "@/lib/supabase/client";

type Props = {
  orders: QueueOrder[];
  loadError: boolean; // true = the server couldn't read the queue
};

// Connection state for the small label at the top.
type LiveState = "connecting" | "live" | "reconnecting";

// A colour per status, so staff can scan the queue at a glance.
// (Colour is never the ONLY signal: the status is always written out too.)
const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  IN_PROGRESS: "bg-sky-100 text-sky-900",
  READY_FOR_PICKUP: "bg-green-100 text-green-900",
  BEING_DELIVERED: "bg-violet-100 text-violet-900",
  COMPLETED: "bg-stone-100 text-stone-700",
  CANCELLED: "bg-stone-100 text-stone-700",
  ABANDONED: "bg-stone-100 text-stone-700",
};

export default function StaffQueue({ orders, loadError }: Props) {
  const router = useRouter();
  const [live, setLive] = useState<LiveState>("connecting");

  /*
   * The Realtime subscription.
   * Runs when the queue appears. The function it returns ("cleanup") runs
   * when the queue disappears: it closes the connection, so a hidden or
   * closed page doesn't keep listening. (In this Next.js version a page you
   * leave is HIDDEN, not removed; the cleanup still runs then, and the
   * subscription starts again when you come back.)
   */
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("staff-queue")
      .on(
        "postgres_changes",
        // "*" = any change: INSERT (new order) or UPDATE (e.g. status).
        { event: "*", schema: "public", table: "orders" },
        () => router.refresh()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLive("live");
          // Also re-read once on (re)connecting: catches any order placed
          // while we were disconnected or the page was hidden.
          router.refresh();
        } else {
          // CHANNEL_ERROR, TIMED_OUT or CLOSED: Supabase keeps retrying.
          setLive("reconnecting");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <section aria-labelledby="queue-title">
      <div className="flex items-center justify-between gap-3 pt-6">
        <h1 id="queue-title" className="text-3xl font-extrabold">
          Order queue
        </h1>
        {/* role="status": screen readers announce when this changes. */}
        <p role="status" className="text-sm font-semibold">
          {live === "live" ? (
            <span className="text-green-700">● Live</span>
          ) : live === "connecting" ? (
            <span className="text-stone-500">Connecting…</span>
          ) : (
            <span className="text-red-700">Reconnecting… (refresh if this stays)</span>
          )}
        </p>
      </div>
      <p className="mt-1 text-sm text-stone-600">
        Active orders, oldest first. New orders appear at the bottom.
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
 * OrderCard: one order in the queue.
 * PHONES (staff use smartphones): everything stacked; the Order ID and status
 * stay on the top line so they're seen first.
 */
function OrderCard({ order }: { order: QueueOrder }) {
  const readyBy = order.isAsap
    ? `ASAP (about ${formatJamaicaTime(order.requestedTime)})`
    : formatJamaicaTime(order.requestedTime);

  return (
    <article className="rounded-xl bg-white p-4 shadow-sm" aria-label={`Order ${order.id}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-extrabold">#{order.id}</h2>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${STATUS_STYLES[order.status]}`}>
          {STATUS_LABELS[order.status]}
        </span>
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
    </article>
  );
}
