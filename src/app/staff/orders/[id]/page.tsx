/*
 * src/app/staff/orders/[id]/page.tsx   ->   http://localhost:3000/staff/orders/1004
 *
 * WHAT: One order's FULL details for counter staff (FR-03, SR-3.2 / AC-1):
 *       Order ID and status, customer name and phone, every item (size,
 *       extras with prices, meal note, line total), pickup or delivery
 *       location, ready-by time, order time, payment method and totals.
 *       VIEW ONLY: status buttons come in Step 26.
 *
 * LAYER: Presentation. requireRole (Application layer) does the access check;
 *        getOrderForStaff (Application layer) reads through RLS (Data layer,
 *        migrations 0007 + 0008).
 *
 * WHO: counter_staff ONLY (strict role screens). Works for ANY order, not
 * only active ones, so "Past Orders" (Step 26) can link here too.
 *
 * WHY a page of its own (decision) instead of a panel over the queue?
 *   - Phones: a full screen is easier to read, and Back returns to the queue.
 *   - Privacy: the customer's phone number is only loaded when staff open
 *     THIS order, not sent for every order in the queue.
 *
 * LIVE: <OrderLiveRefresh orderId=...> listens to THIS order only, so a status
 * change made elsewhere appears without refreshing.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import OrderLiveRefresh from "@/components/OrderLiveRefresh";
import StatusBadge from "@/components/StatusBadge";
import { requireRole } from "@/lib/auth/require-role";
import { formatExtraPrice, formatPrice } from "@/lib/menu-helpers";
import { formatJamaicaDateTime, formatJamaicaTime } from "@/lib/order-rules";
import { getOrderForStaff, type StaffOrderDetails } from "@/lib/orders/get-order";

export const metadata: Metadata = {
  title: "Order details",
};

/*
 * The address part (params) is only known when someone visits, so everything
 * that uses it sits inside <Suspense> (same pattern as /orders/[id]).
 * ALL content is inside the guarded component: nothing is sent before the
 * role check passes.
 */
export default function StaffOrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12">
      <Link
        href="/staff"
        className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand hover:underline"
      >
        ← Back to queue
      </Link>
      <Suspense
        fallback={
          <div className="mt-2 flex flex-col gap-4" aria-hidden="true">
            <div className="h-24 animate-pulse rounded-xl bg-stone-200" />
            <div className="h-64 animate-pulse rounded-xl bg-stone-200" />
          </div>
        }
      >
        <StaffOrderContent params={params} />
      </Suspense>
    </main>
  );
}

/*
 * StaffOrderContent (runs on the server, per visit, and again on each live
 * refresh).
 * 1. Guard: not logged in -> /login (and back), wrong role -> /no-access.
 * 2. Load the order. Not a number or no such order -> "Order not found".
 */
async function StaffOrderContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["counter_staff"], { returnTo: `/staff/orders/${encodeURIComponent(id)}` });

  let order: StaffOrderDetails | null;
  try {
    order = await getOrderForStaff(id);
  } catch {
    return <Message title="We couldn't load this order" text="Check the connection and refresh the page." />;
  }
  if (!order) {
    return <Message title="Order not found" text="Check the order number and try again." />;
  }

  return <OrderDetails order={order} />;
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-2 rounded-xl bg-white p-6 text-center shadow-sm">
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-stone-600">{text}</p>
    </div>
  );
}

/* The details themselves. PHONES: one column. */
function OrderDetails({ order }: { order: StaffOrderDetails }) {
  const isDelivery = order.fulfilment === "DELIVERY";
  const readyBy = order.isAsap
    ? `ASAP (about ${formatJamaicaTime(order.requestedTime)})`
    : formatJamaicaTime(order.requestedTime);

  return (
    <>
      {/* ---- Order ID + status (+ live label) ---- */}
      <section className="mt-2 rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-4xl font-extrabold">#{order.id}</h1>
          <StatusBadge status={order.status} />
        </div>
        <div className="mt-1 flex justify-end">
          {/* Listens to THIS order only. */}
          <OrderLiveRefresh channelName={`staff-order-${order.id}`} orderId={order.id} />
        </div>
      </section>

      {/* ---- Customer, fulfilment, times, payment ---- */}
      <section className="mt-4 rounded-xl bg-white p-5 shadow-sm">
        {/* dl = label + value pairs (screen readers announce them as such). */}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-stone-500">Customer</dt>
            <dd className="font-semibold">{order.customer?.name || "Name not given"}</dd>
            <dd>
              {order.customer?.phone ? (
                // tel: link = tapping it on a phone offers to call the number.
                <a
                  href={`tel:${order.customer.phone.replace(/[^\d+]/g, "")}`}
                  className="inline-flex min-h-11 items-center font-semibold text-brand underline"
                >
                  {order.customer.phone}
                </a>
              ) : (
                <span className="text-stone-500">No phone number</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-stone-500">{isDelivery ? "Delivery to" : "Pickup"}</dt>
            <dd className="font-semibold">
              {isDelivery ? (order.deliveryLocation?.name ?? "Location missing") : "At the counter"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-stone-500">Ready by</dt>
            <dd className="font-semibold">{readyBy}</dd>
          </div>
          <div>
            <dt className="text-sm text-stone-500">Ordered</dt>
            <dd className="font-semibold">{formatJamaicaDateTime(order.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-stone-500">Payment method</dt>
            <dd className="font-semibold">
              {order.paymentMethod === "LYNK" ? "Lynk" : order.paymentMethod === "CASH" ? "Cash" : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {/* ---- Items and totals (prices as charged) ---- */}
      <section className="mt-4 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Items</h2>
        <ul className="mt-3 flex flex-col divide-y divide-stone-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {item.quantity} × {item.name}
                  {item.size && ` (${item.size})`}
                </p>
                {item.extras.length > 0 && (
                  <ul className="mt-1 text-sm text-stone-600">
                    {item.extras.map((extra) => (
                      <li key={extra.name}>
                        + {extra.name} ({formatExtraPrice(extra.extraPrice)})
                      </li>
                    ))}
                  </ul>
                )}
                {/* Meal notes stand out: dietary instructions matter. */}
                {item.note && (
                  <p className="mt-1 break-words rounded bg-amber-50 px-2 py-1 text-sm text-amber-950">
                    Note: &quot;{item.note}&quot;
                  </p>
                )}
              </div>
              <span className="shrink-0 font-semibold">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex flex-col gap-1 border-t border-stone-200 pt-3 text-sm">
          <div className="flex justify-between">
            <span>Items</span>
            <span>{formatPrice(order.itemsTotal)}</span>
          </div>
          {isDelivery && (
            <div className="flex justify-between">
              <span>Delivery fee</span>
              <span>{formatPrice(order.deliveryFee)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between text-lg font-extrabold">
            <span>Total</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>
      </section>
    </>
  );
}
