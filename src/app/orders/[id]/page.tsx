/*
 * src/app/orders/[id]/page.tsx   ->   http://localhost:3000/orders/1001
 *
 * WHAT: The order confirmation page ("invoice"). After "Place order" the
 *       customer lands here and sees: the Order ID, when it was placed,
 *       pickup or delivery (and where), the time, every item (size, extras,
 *       meal note), the totals and the payment method.
 *
 * LAYER: Presentation. requireRole (Application layer) does the access check;
 *        getOrderForCustomer (Application layer) reads the order (Data layer).
 *
 * WHY:
 *   - FR-01: "On submit: unique numeric Order ID, confirmation shown to customer."
 *   - SAF-1: the Order ID is checked at handover, so it's shown big and clear.
 *   - FR-05: customers can only see their OWN orders (RLS + our own check).
 *
 * [id] IN THE FOLDER NAME = a "dynamic route": one page file for every order.
 * The part of the address after /orders/ arrives as params.id ("1001").
 *
 * PART 23 (FR-02): the "How to pay" box (PaymentInstructions): a SAMPLE
 * Lynk QR code with amount, reference and Lynk ID, or the cash message.
 *
 * STEP 29 (FR-05 SR-5.1 / SR-5.2): the "Order status" box: the current
 * status, one plain sentence, and a progress line (OrderProgress). It is
 * LIVE: <OrderLiveRefresh orderId=...> listens to THIS order only, and when
 * staff change the status the page re-draws itself within seconds, with no
 * refresh (PR-2: within 5 s). Realtime checks RLS, so a customer only ever
 * hears about their own orders.
 *
 * STEP 30 (FR-05 SR-5.4): "Messages we sent you" (OrderNotifications): the
 * simulated SMS/email the database wrote when the order became Ready for
 * pickup, Cancelled or Abandoned. Live too: they're saved in the same
 * transaction as the status change, so the same refresh shows them.
 *
 * NOT HERE YET:
 *   - Payment status ("not paid yet"): decision, not shown for now.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import OrderLiveRefresh from "@/components/OrderLiveRefresh";
import OrderNotifications from "@/components/OrderNotifications";
import OrderProgress from "@/components/OrderProgress";
import PaymentInstructions from "@/components/PaymentInstructions";
import { requireRole } from "@/lib/auth/require-role";
import { formatExtraPrice, formatPrice } from "@/lib/menu-helpers";
import { formatJamaicaDateTime, formatJamaicaTime } from "@/lib/order-rules";
import { getOrderForCustomer, type CustomerOrderDetails, type OrderDetails } from "@/lib/orders/get-order";

export const metadata: Metadata = {
  title: "Your order",
};

/*
 * OrderPage
 * In this Next.js version (Cache Components), the address part (params) is
 * only known when someone visits, so everything that uses it sits inside
 * <Suspense>. The grey placeholder shows for a moment while the order loads.
 * (Same pattern as the checkout page.)
 */
export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12">
      <Suspense
        fallback={
          <div className="mt-6 flex flex-col gap-4" aria-hidden="true">
            <div className="h-24 animate-pulse rounded-xl bg-stone-200" />
            <div className="h-64 animate-pulse rounded-xl bg-stone-200" />
          </div>
        }
      >
        <OrderContent params={params} />
      </Suspense>
    </main>
  );
}

/*
 * OrderContent (runs on the server, per visitor)
 * 1. requireRole: customers only. Logged out -> log in, then come back here.
 *    Staff -> "no access" (strict role screens; staff order screens come in
 *    Build step 4).
 * 2. Load the order. Not a number, doesn't exist, or someone else's -> the
 *    SAME "Order not found" (so nobody can fish for real order numbers).
 */
async function OrderContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole(["customer"], {
    returnTo: `/orders/${encodeURIComponent(id)}`,
  });

  let order: CustomerOrderDetails | null;
  try {
    order = await getOrderForCustomer(id, profile.id);
  } catch {
    return (
      <Message
        title="We couldn't load your order"
        text="Please check your connection and refresh the page."
        isError
      />
    );
  }

  if (!order) {
    return (
      <Message
        title="Order not found"
        text="Check the order number, and make sure you're logged in with the account that placed it."
      />
    );
  }

  return <OrderInvoice order={order} />;
}

/* Message: a simple white box with a title, a line of text and links to recover. */
function Message({ title, text, isError = false }: { title: string; text: string; isError?: boolean }) {
  return (
    <div
      role={isError ? "alert" : undefined}
      className="mt-6 rounded-xl bg-white p-6 text-center shadow-sm"
    >
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-stone-600">{text}</p>
      <div className="flex flex-wrap justify-center gap-x-4">
        <BackToMenu />
        <Link
          href="/orders"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-5 font-semibold hover:bg-stone-50"
        >
          My orders
        </Link>
      </div>
    </div>
  );
}

function BackToMenu() {
  return (
    <Link
      href="/menu"
      className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
    >
      Back to the menu
    </Link>
  );
}

/*
 * timeText(order) -> the "When" line, e.g.
 *   "As soon as possible (about 12:25 p.m.)"
 *   "Pickup at 1:30 p.m."   /   "Delivery at 1:30 p.m."
 * (requested_time was worked out by the server in placeOrder, Part 21.)
 */
function timeText(order: OrderDetails): string {
  const time = formatJamaicaTime(order.requestedTime);
  if (order.isAsap) return `As soon as possible (about ${time})`;
  return `${order.fulfilment === "DELIVERY" ? "Delivery" : "Pickup"} at ${time}`;
}

/*
 * OrderInvoice: the confirmation itself.
 * PHONES: one column. All prices are the ones SAVED with the order.
 */
function OrderInvoice({ order }: { order: CustomerOrderDetails }) {
  const isDelivery = order.fulfilment === "DELIVERY";

  return (
    <>
      {/* ---- Order ID (FR-01) + SAF-1 reminder ---- */}
      <section className="mt-6 rounded-xl bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">Order placed</p>
        <h1 className="mt-1 text-4xl font-extrabold">Order #{order.id}</h1>
        <p className="mt-1 text-sm text-stone-600">
          Placed {formatJamaicaDateTime(order.createdAt)}
        </p>
        <p className="mt-3 rounded-lg bg-orange-50 p-3 text-sm">
          Please keep this number. We&apos;ll ask for it when you get your food.
        </p>
      </section>

      {/* ---- Order status (Step 29, FR-05): live, no refresh needed ---- */}
      <section className="mt-4 rounded-xl bg-white p-5 shadow-sm" aria-labelledby="status-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="status-title" className="text-lg font-bold">
            Order status
          </h2>
          {/* Listens to THIS order only (and RLS: only if it's yours). */}
          <OrderLiveRefresh channelName={`customer-order-${order.id}`} orderId={order.id} />
        </div>
        <OrderProgress
          orderId={order.id}
          status={order.status}
          fulfilment={order.fulfilment}
          locationName={order.deliveryLocation?.name ?? null}
        />
      </section>

      {/* ---- Step 30 (FR-05 SR-5.4): the (simulated) SMS/email messages ---- */}
      <OrderNotifications
        notifications={order.notifications}
        pastReady={order.status !== "PENDING" && order.status !== "IN_PROGRESS"}
      />

      {/* ---- Pickup or delivery + time (FR-01) + payment method (FR-02) ---- */}
      <section className="mt-4 rounded-xl bg-white p-5 shadow-sm">
        {/* dl/dt/dd = a "description list": label + value pairs, which screen
            readers announce as such. */}
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-stone-500">{isDelivery ? "Delivery to" : "Pickup"}</dt>
            <dd className="font-semibold">
              {isDelivery ? (order.deliveryLocation?.name ?? "Delivery") : "At the counter"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-stone-500">When</dt>
            <dd className="font-semibold">{timeText(order)}</dd>
          </div>
          <div>
            <dt className="text-sm text-stone-500">Payment</dt>
            <dd className="font-semibold">
              {order.paymentMethod === "LYNK" ? "Lynk" : order.paymentMethod === "CASH" ? "Cash" : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {/* ---- How to pay (Part 23, FR-02): sample Lynk QR, or cash at the
          counter / to the driver. Decision: no payment status shown yet. ---- */}
      <PaymentInstructions
        orderId={order.id}
        total={order.total}
        fulfilment={order.fulfilment}
        paymentMethod={order.paymentMethod}
      />

      {/* ---- Items and totals (FR-02: items + extras + delivery fee) ---- */}
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
                {/* Each extra with its price, as charged. */}
                {item.extras.length > 0 && (
                  <ul className="mt-1 text-sm text-stone-600">
                    {item.extras.map((extra) => (
                      <li key={extra.name}>
                        + {extra.name} ({formatExtraPrice(extra.extraPrice)})
                      </li>
                    ))}
                  </ul>
                )}
                {/* The meal note (dietary instructions, FR-02). */}
                {item.note && (
                  <p className="mt-1 break-words text-sm italic text-stone-500">
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
          {/* FR-02: the delivery fee only applies to delivery orders. */}
          {isDelivery && (
            <div className="flex justify-between gap-3">
              <span>Delivery fee</span>
              <span className="text-right">
                {formatPrice(order.deliveryFee)}
                {/* Decision: a sample fee is always labelled as one. */}
                {order.deliveryLocation && !order.deliveryLocation.feeConfirmed && " (sample, not final)"}
              </span>
            </div>
          )}
          <div className="mt-1 flex justify-between text-lg font-extrabold">
            <span>Total</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-center gap-x-4">
        <BackToMenu />
        {/* Step 29: back to the list of all their orders. */}
        <Link
          href="/orders"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-5 font-semibold hover:bg-stone-50"
        >
          My orders
        </Link>
      </div>
    </>
  );
}
