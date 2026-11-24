/*
 * src/app/staff/orders/[id]/page.tsx   ->   http://localhost:3000/staff/orders/1004
 *
 * WHAT: One order's FULL details for counter staff (FR-03, SR-3.2 / AC-1):
 *       Order ID and status, customer name and phone, every item (size,
 *       extras with prices, meal note, line total), pickup or delivery
 *       location, ready-by time, order time, payment method and totals.
 *       Step 26: an "Actions" box with the ONE next status step + Cancel
 *       (StatusButtons). Step 27: completing a PICKUP order needs the
 *       customer's Order ID (SAF-1) and, for cash, "cash received" (PAID).
 *       Staff also see the payment status (Unpaid / Paid), and (Step 38a) a
 *       note when the Supervisor marked a Lynk payment "not received".
 *       Step 28: "Ready since" while it waits at the counter, and "Mark
 *       Abandoned" once 20 minutes have passed (pickup only, SR-5.5).
 *       Step 31 (FR-04 SR-4.1, TS-4.1.1 / TS-4.1.2): for DELIVERY orders, a
 *       "Delivery" box near the top: drop-off location (large), ready-by,
 *       customer, driver, and "Assign driver" (with each driver's active
 *       deliveries) until the order leaves.
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
import AssignDriver from "@/components/AssignDriver";
import OrderLiveRefresh from "@/components/OrderLiveRefresh";
import StatusBadge from "@/components/StatusBadge";
import StatusButtons from "@/components/StatusButtons";
import { requireRole } from "@/lib/auth/require-role";
import { formatExtraPrice, formatPrice } from "@/lib/menu-helpers";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/order-status";
import { formatJamaicaDateTime, formatJamaicaTime } from "@/lib/order-rules";
import { canChangeDriver } from "@/lib/orders/delivery-rules";
import { getDrivers, type DriverOption } from "@/lib/orders/get-drivers";
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
    return (
      <Message
        title="We couldn't load this order"
        text="Check the connection and refresh the page."
        isError
      />
    );
  }
  if (!order) {
    return <Message title="Order not found" text="Check the order number and try again." />;
  }

  // Step 31: the driver list, only when this order can get / change a driver.
  // If it can't be loaded, the rest of the page still shows (drivers = null).
  let drivers: DriverOption[] | null = [];
  if (canChangeDriver(order)) {
    try {
      drivers = await getDrivers();
    } catch {
      drivers = null;
    }
  }

  return <OrderDetails order={order} drivers={drivers} />;
}

function Message({ title, text, isError = false }: { title: string; text: string; isError?: boolean }) {
  return (
    <div
      role={isError ? "alert" : undefined}
      className="mt-2 rounded-xl bg-white p-6 text-center shadow-sm"
    >
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-stone-600">{text}</p>
    </div>
  );
}

/*
 * DeliveryBox (Step 31, FR-04 SR-4.1 / TS-4.1.1): for DELIVERY orders, the
 * things a driver assignment needs, near the top and easy to read:
 * the drop-off location (large), ready-by time, the customer (tap to call),
 * the driver (or "No driver yet"), and the "Assign driver" choice while the
 * order hasn't left yet.
 */
function DeliveryBox({
  order,
  readyBy,
  drivers,
}: {
  order: StaffOrderDetails;
  readyBy: string;
  drivers: DriverOption[] | null;
}) {
  const delivery = order.delivery;
  // Before a driver is assigned, show the order's location; after, the copy
  // saved with the delivery (they are the same unless a location was renamed).
  const location = delivery?.dropOffLocation ?? order.deliveryLocation?.name ?? "Location missing";

  return (
    <section className="mt-4 rounded-xl bg-white p-5 shadow-sm" aria-labelledby="delivery-title">
      <h2 id="delivery-title" className="text-lg font-bold">
        Delivery
      </h2>

      <dl className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-sm text-stone-500">Drop-off location</dt>
          <dd className="text-2xl font-extrabold">{location}</dd>
          {/* Step 41 (FR-01 SR-1.3): exactly where at that location. */}
          <dd className="text-lg font-bold">
            {order.dropOffDetails ?? <span className="text-base font-normal text-stone-500">No drop-off details (older order)</span>}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-stone-500">Ready by</dt>
          <dd className="font-semibold">{readyBy}</dd>
        </div>
        <div>
          <dt className="text-sm text-stone-500">Customer</dt>
          <dd className="font-semibold">
            {order.customer?.name || "Name not given"}
            {order.customer?.phone && (
              <>
                {" · "}
                <a
                  href={`tel:${order.customer.phone.replace(/[^\d+]/g, "")}`}
                  className="text-brand underline"
                >
                  {order.customer.phone}
                </a>
              </>
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-stone-500">Driver</dt>
          <dd className="font-semibold">
            {delivery ? (
              <>
                {delivery.driverName}{" "}
                <span className="font-normal text-stone-600">
                  (assigned {formatJamaicaTime(delivery.assignedAt)})
                </span>
              </>
            ) : (
              <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-amber-900">No driver yet</span>
            )}
          </dd>
        </div>
      </dl>

      {/* Assign / change: only before it leaves (decision). */}
      {canChangeDriver(order) && (
        <div className="mt-4 border-t border-stone-100 pt-4">
          {drivers === null ? (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
              We couldn&apos;t load the drivers. Refresh the page to try again.
            </p>
          ) : (
            <AssignDriver orderId={order.id} currentDriverId={delivery?.driverId ?? null} drivers={drivers} />
          )}
        </div>
      )}
    </section>
  );
}

/* The details themselves. PHONES: one column. */
function OrderDetails({ order, drivers }: { order: StaffOrderDetails; drivers: DriverOption[] | null }) {
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

      {/* ---- Step 31: Delivery (location, driver, Assign driver) ---- */}
      {isDelivery && <DeliveryBox order={order} readyBy={readyBy} drivers={drivers} />}

      {/* ---- Actions (Step 26): the ONE next step + Cancel ---- */}
      <section className="mt-4 rounded-xl bg-white p-5 shadow-sm" aria-labelledby="actions-title">
        <h2 id="actions-title" className="mb-3 text-lg font-bold">
          Actions
        </h2>
        <StatusButtons
          orderId={order.id}
          status={order.status}
          fulfilment={order.fulfilment}
          payment={order.payment}
          readyForPickupAt={order.readyForPickupAt}
        />
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
              {/* Step 41: the building / room / landmark, under the location. */}
              {isDelivery && order.dropOffDetails && (
                <span className="block font-normal text-stone-700">{order.dropOffDetails}</span>
              )}
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
          {/* Step 28: while it waits at the counter, show since when (from
              order_status_history). The 20-minute Abandoned wait counts from
              this time. */}
          {order.status === "READY_FOR_PICKUP" && order.readyForPickupAt !== null && (
            <div>
              <dt className="text-sm text-stone-500">Ready since</dt>
              <dd className="font-semibold">{formatJamaicaTime(order.readyForPickupAt)}</dd>
            </div>
          )}
          <div>
            {/* Step 27 (decision): staff see the payment STATUS too (customers
                don't): it confirms cash was recorded, and shows whether a Lynk
                order still waits for the Supervisor. */}
            <dt className="text-sm text-stone-500">Payment</dt>
            <dd className="font-semibold">
              {order.payment ? (
                <>
                  {PAYMENT_METHOD_LABELS[order.payment.method]} ·{" "}
                  <span
                    className={
                      order.payment.status === "PAID"
                        ? "text-green-700"
                        : order.payment.status === "REFUNDED"
                          ? "text-stone-600"
                          : "text-amber-800"
                    }
                  >
                    {PAYMENT_STATUS_LABELS[order.payment.status]}
                  </span>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
        {/* Step 38a (FR-02): the Supervisor couldn't find this Lynk payment.
            Only while it's still unpaid (verifying it clears the flag). */}
        {order.lynkNotReceived && order.payment?.status === "UNPAID" && (
          <p role="note" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            <span className="font-semibold">Lynk payment not received</span> (checked by the Supervisor at{" "}
            {formatJamaicaTime(order.lynkNotReceived.at)}
            {order.lynkNotReceived.note && `: "${order.lynkNotReceived.note}"`}). Ask the customer about it before
            handing over the food.
          </p>
        )}
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
