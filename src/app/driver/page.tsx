/*
 * src/app/driver/page.tsx   ->   http://localhost:3000/driver
 *
 * WHAT: The Delivery Personnel screen (Step 32, FR-04 SR-4.2 view part /
 *       AC-2, TS-4.1.3): the deliveries assigned to the logged-in driver,
 *       "To deliver" (earliest ready-by first) and "Done today".
 *       Step 33: each card has the driver's buttons: "Mark Being delivered"
 *       and the handover (typed Order ID + "Cash received"), see DriverActions.
 *
 * LAYER: Presentation. requireRole (Application layer) does the access check;
 *        getDriverDeliveries (Application layer) reads through RLS (Data
 *        layer, migration 0014: a driver reads only their own deliveries).
 *
 * WHO: delivery_personnel ONLY (strict role screens). The header link
 *      "Deliveries" points here.
 *
 * LIVE: <OrderLiveRefresh> listens to orders (RLS: only the driver's own), so
 *   a new or changed delivery appears within seconds. PLUS a refresh every
 *   30 seconds (decision): when staff move a delivery to ANOTHER driver, this
 *   driver can no longer read that order, so Realtime can't tell them; the
 *   timed refresh makes it disappear anyway.
 *
 * (See src/app/staff/page.tsx for why everything sits inside <Suspense>.)
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import DriverDeliveries from "@/components/DriverDeliveries";
import OrderLiveRefresh from "@/components/OrderLiveRefresh";
import { requireRole } from "@/lib/auth/require-role";
import { getDriverDeliveries, type DriverDeliveries as Deliveries } from "@/lib/orders/get-driver-deliveries";

export const metadata: Metadata = {
  title: "My deliveries",
};

export default function DriverPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12">
      <Suspense
        fallback={
          <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
            <div className="h-10 w-48 animate-pulse rounded-lg bg-stone-200" />
            <div className="h-48 animate-pulse rounded-xl bg-stone-200" />
          </div>
        }
      >
        <DriverScreen />
      </Suspense>
    </main>
  );
}

/*
 * DriverScreen (runs on the server, per visit, and again on each refresh).
 * 1. Guard: not logged in -> /login (and back), wrong role -> /no-access.
 * 2. Load MY deliveries (our own driver_id filter + RLS).
 */
async function DriverScreen() {
  const profile = await requireRole(["delivery_personnel"], { returnTo: "/driver" });

  let deliveries: Deliveries | null;
  try {
    deliveries = await getDriverDeliveries(profile.id);
  } catch {
    deliveries = null;
  }

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">My deliveries</h1>
        {/* Realtime (only MY orders, by RLS) + every 30 seconds. */}
        <OrderLiveRefresh channelName={`driver-${profile.id}`} refreshEverySeconds={30} />
      </div>
      <p className="mt-1 text-sm text-stone-600">
        Deliveries assigned to you. Soonest first. This page updates by itself.
      </p>

      {deliveries === null ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          We couldn&apos;t load your deliveries. Check the connection and refresh the page.
        </p>
      ) : (
        <DriverDeliveries toDeliver={deliveries.toDeliver} doneToday={deliveries.doneToday} />
      )}
    </>
  );
}
