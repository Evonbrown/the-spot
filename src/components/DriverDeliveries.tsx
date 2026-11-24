/*
 * src/components/DriverDeliveries.tsx
 *
 * WHAT: The driver's list of deliveries (Step 32, FR-04 SR-4.2 view part /
 *       AC-2, TS-4.1.3):
 *         - "To deliver": one card per unfinished delivery, earliest ready-by
 *           first, with everything needed on the road: Order ID, status,
 *           drop-off location, ready-by, customer (tap to call), items,
 *           total, and whether CASH must be collected;
 *         - "Done today": a short list of today's completed / cancelled ones.
 *       Step 33: each card ends with the driver's buttons (DriverActions):
 *       "Mark Being delivered" (with "Leaving now?") and the handover (typed
 *       Order ID + "Cash received"). "Done today" shows when it was delivered.
 *
 * LAYER: Presentation. The data comes from getDriverDeliveries()
 *        (Application layer), read through RLS (Data layer, migration 0014).
 *
 * Server component (no "use client"): it only draws. The page around it is
 * kept live by <OrderLiveRefresh> (Realtime + a 30-second refresh).
 */

import DriverActions from "@/components/DriverActions";
import StatusBadge from "@/components/StatusBadge";
import { formatPrice } from "@/lib/menu-helpers";
import { formatJamaicaTime } from "@/lib/order-rules";
import type { DriverDelivery } from "@/lib/orders/get-driver-deliveries";

type Props = {
  toDeliver: DriverDelivery[];
  doneToday: DriverDelivery[];
};

export default function DriverDeliveries({ toDeliver, doneToday }: Props) {
  return (
    <>
      {/* ---- To deliver ---- */}
      <section aria-labelledby="to-deliver-title" className="mt-4">
        <h2 id="to-deliver-title" className="text-xl font-bold">
          To deliver <span className="text-base font-semibold text-stone-500">({toDeliver.length})</span>
        </h2>
        {toDeliver.length === 0 ? (
          <p className="mt-3 rounded-xl bg-white p-6 text-center text-stone-600 shadow-sm">
            No deliveries for you right now. New ones will appear here automatically.
          </p>
        ) : (
          // <ol> = an ordered list: the order matters (soonest first).
          <ol className="mt-3 flex flex-col gap-3">
            {toDeliver.map((delivery) => (
              <li key={delivery.orderId}>
                <DeliveryCard delivery={delivery} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---- Done today (decision) ---- */}
      <section aria-labelledby="done-title" className="mt-10">
        <h2 id="done-title" className="text-xl font-bold">
          Done today
        </h2>
        {doneToday.length === 0 ? (
          <p className="mt-3 text-sm text-stone-600">Nothing finished yet today.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-stone-100 overflow-hidden rounded-xl bg-white shadow-sm">
            {doneToday.map((delivery) => (
              <li
                key={delivery.orderId}
                className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2"
              >
                <span className="font-bold">#{delivery.orderId}</span>
                <span className="text-sm text-stone-600">
                  {delivery.dropOffLocation}
                  {/* SR-4.3: when it was handed over (Step 33). */}
                  {delivery.deliveredAt && ` · Delivered ${formatJamaicaTime(delivery.deliveredAt)}`}
                </span>
                <StatusBadge status={delivery.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/*
 * DeliveryCard: one delivery. PHONES (drivers use smartphones): one column,
 * the Order ID + status on top, then the two things needed most on the road
 * (WHERE and WHO), then the food and the money.
 */
function DeliveryCard({ delivery }: { delivery: DriverDelivery }) {
  const readyBy = delivery.isAsap
    ? `ASAP (about ${formatJamaicaTime(delivery.requestedTime)})`
    : formatJamaicaTime(delivery.requestedTime);

  return (
    <article className="rounded-xl bg-white p-4 shadow-sm" aria-label={`Delivery for order ${delivery.orderId}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-2xl font-extrabold">#{delivery.orderId}</h3>
        <StatusBadge status={delivery.status} />
      </div>

      <dl className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-sm text-stone-500">Drop-off location</dt>
          <dd className="text-xl font-extrabold">{delivery.dropOffLocation}</dd>
          {/* Step 41 (FR-01 SR-1.3): exactly where at that location. */}
          <dd className="text-lg font-bold">
            {delivery.dropOffDetails ?? (
              <span className="text-base font-normal text-stone-500">No drop-off details (older order): call the customer.</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-stone-500">Ready by</dt>
          <dd className="font-semibold">{readyBy}</dd>
        </div>
        <div>
          <dt className="text-sm text-stone-500">Customer</dt>
          <dd className="font-semibold">{delivery.customerName || "Name not given"}</dd>
          <dd>
            {delivery.customerPhone ? (
              // tel: link = tapping it on a phone offers to call the number.
              <a
                href={`tel:${delivery.customerPhone.replace(/[^\d+]/g, "")}`}
                className="inline-flex min-h-11 items-center font-semibold text-brand underline"
              >
                Call {delivery.customerPhone}
              </a>
            ) : (
              <span className="text-stone-500">No phone number</span>
            )}
          </dd>
        </div>
      </dl>

      {/* The money: the most important line for the handover. */}
      <PaymentLine delivery={delivery} />

      {/* Items (with extras and meal notes) and the total. */}
      <ul className="mt-3 flex flex-col gap-2 border-t border-stone-100 pt-3">
        {delivery.items.map((item) => (
          <li key={item.id}>
            <p className="font-semibold">
              {item.quantity} × {item.name}
              {item.size && ` (${item.size})`}
            </p>
            {item.extras.length > 0 && <p className="text-sm text-stone-600">+ {item.extras.join(", ")}</p>}
            {item.note && (
              <p className="mt-1 break-words rounded bg-amber-50 px-2 py-1 text-sm text-amber-950">
                Note: &quot;{item.note}&quot;
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex justify-between border-t border-stone-100 pt-3 text-lg font-extrabold">
        <span>Total</span>
        <span>{formatPrice(delivery.total)}</span>
      </p>

      {/* Step 33: the ONE next step for the driver. */}
      <DriverActions orderId={delivery.orderId} status={delivery.status} payment={delivery.payment} />
    </article>
  );
}

/*
 * PaymentLine: does the driver collect money?
 *   Cash, unpaid -> "Collect cash: J$1,400" (amber, stands out). It becomes
 *                   PAID at the handover (Step 33, FR-06).
 *   Lynk, unpaid -> don't collect: the Supervisor verifies Lynk payments.
 *   Already paid -> nothing to collect.
 */
function PaymentLine({ delivery }: { delivery: DriverDelivery }) {
  const payment = delivery.payment;
  if (!payment) {
    return <p className="mt-3 rounded-lg bg-stone-100 p-3 text-sm">Payment not found: ask the counter.</p>;
  }
  // PAID or REFUNDED (Step 38b): the money was already received.
  if (payment.status !== "UNPAID") {
    return <p className="mt-3 rounded-lg bg-green-50 p-3 font-semibold text-green-900">Paid: nothing to collect.</p>;
  }
  if (payment.method === "CASH") {
    return (
      <p className="mt-3 rounded-lg bg-amber-100 p-3 text-lg font-extrabold text-amber-950">
        Collect cash: {formatPrice(payment.amount)}
      </p>
    );
  }
  return (
    <p className="mt-3 rounded-lg bg-sky-50 p-3 font-semibold text-sky-950">
      Paid by Lynk: don&apos;t collect money (the Supervisor checks it).
    </p>
  );
}
