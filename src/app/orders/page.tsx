/*
 * src/app/orders/page.tsx   ->   http://localhost:3000/orders
 *
 * WHAT: "My orders" (Step 29, FR-05 SR-5.1 / AC-1): the logged-in customer's
 *       OWN orders, newest first. Each row shows the Order ID, when it was
 *       placed, pickup or delivery, the total and the current status, and
 *       opens that order's page (/orders/1004) with the live progress line.
 *
 * LAYER: Presentation. requireRole (Application layer) does the access check;
 *        getMyOrders (Application layer) reads through RLS (Data layer, 0006).
 *
 * WHO: customers ONLY (strict role screens). Logged out -> log in, then come
 * back here. Staff -> "no access".
 *
 * LIVE (decision): <OrderLiveRefresh customerId=...> listens to this
 * customer's orders only, so a status change made by staff shows up here
 * within seconds, without refreshing.
 *
 * The header link says "Orders" (short, fits on phones); this page is titled
 * "My orders" (decision).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import OrderLiveRefresh from "@/components/OrderLiveRefresh";
import StatusBadge from "@/components/StatusBadge";
import { requireRole } from "@/lib/auth/require-role";
import { formatPrice } from "@/lib/menu-helpers";
import { formatJamaicaDateTime } from "@/lib/order-rules";
import { getMyOrders, MY_ORDERS_LIMIT, type MyOrder } from "@/lib/orders/get-my-orders";

export const metadata: Metadata = {
  title: "My orders",
};

/*
 * MyOrdersPage
 * Who is visiting is only known per visit (login cookie), so everything that
 * depends on it sits inside <Suspense> (Cache Components, same as the other
 * pages). The grey boxes show for a moment while it loads.
 */
export default function MyOrdersPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12">
      <Suspense
        fallback={
          <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
            <div className="h-10 w-40 animate-pulse rounded-lg bg-stone-200" />
            <div className="h-20 animate-pulse rounded-xl bg-stone-200" />
            <div className="h-20 animate-pulse rounded-xl bg-stone-200" />
          </div>
        }
      >
        <MyOrdersContent />
      </Suspense>
    </main>
  );
}

/*
 * MyOrdersContent (runs on the server, per visit, and again on each live
 * refresh).
 * 1. Guard: customers only.
 * 2. Load THEIR orders (our own customer_id filter + RLS).
 */
async function MyOrdersContent() {
  const profile = await requireRole(["customer"], { returnTo: "/orders" });

  let orders: MyOrder[];
  try {
    orders = await getMyOrders(profile.id);
  } catch {
    return (
      <Box>
        <h1 className="text-2xl font-extrabold">We couldn&apos;t load your orders</h1>
        <p className="mt-2 text-stone-600">Please check your connection and refresh the page.</p>
      </Box>
    );
  }

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">My orders</h1>
        {/* Live: only THIS customer's orders (RLS makes sure of it too). */}
        <OrderLiveRefresh channelName={`my-orders-${profile.id}`} customerId={profile.id} />
      </div>

      {orders.length === 0 ? (
        // Empty state: point them to the menu.
        <Box>
          <p className="text-lg font-semibold">You haven&apos;t placed any orders yet.</p>
          <Link
            href="/menu"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
          >
            See the menu
          </Link>
        </Box>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3">
            {orders.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} />
              </li>
            ))}
          </ul>
          {orders.length === MY_ORDERS_LIMIT && (
            <p className="mt-4 text-center text-sm text-stone-500">
              Showing your {MY_ORDERS_LIMIT} most recent orders.
            </p>
          )}
        </>
      )}
    </>
  );
}

/*
 * OrderRow: one order as a card. The WHOLE card is a link (a big target is
 * easier to tap on a phone). min-w-0 + truncate: nothing pushes the badge off
 * a narrow screen.
 */
function OrderRow({ order }: { order: MyOrder }) {
  return (
    <Link
      href={`/orders/${order.id}`}
      className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm hover:bg-orange-50"
    >
      <div className="min-w-0">
        <p className="text-xl font-extrabold">#{order.id}</p>
        <p className="truncate text-sm text-stone-600">
          {formatJamaicaDateTime(order.createdAt)} · {order.fulfilment === "DELIVERY" ? "Delivery" : "Pickup"}
        </p>
        <p className="font-semibold">{formatPrice(order.total)}</p>
      </div>
      <StatusBadge status={order.status} />
    </Link>
  );
}

/* A simple white box for messages. */
function Box({ children }: { children: ReactNode }) {
  return <div className="mt-6 rounded-xl bg-white p-6 text-center shadow-sm">{children}</div>;
}
