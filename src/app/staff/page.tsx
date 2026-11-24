/*
 * src/app/staff/page.tsx   ->   http://localhost:3000/staff
 *
 * WHAT: The Counter Staff screen: the LIVE order queue (FR-03, Step 24).
 *       This page loads the active orders on the server; StaffQueue (a
 *       browser component) draws them and keeps them live with Realtime.
 * LAYER: Presentation. Protected by requireRole (Application layer); the
 *        orders come from getActiveOrders() (Application layer), which reads
 *        through RLS (Data layer, migration 0007).
 * WHO: counter_staff ONLY (strict: each role opens only its own screen).
 *
 * Step 26: "Past Orders" (today's finished orders) under the queue; status
 * buttons are on each order's details page. Coming next: Order ID check at
 * handover (Step 27, SAF-1), full status rules (Step 28), drivers (FR-04).
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import StaffQueue from "@/components/StaffQueue";
import { requireRole } from "@/lib/auth/require-role";
import { getActiveOrders, getPastOrders } from "@/lib/orders/get-queue";

export const metadata: Metadata = {
  title: "Order queue",
};

/*
 * The whole screen sits inside <Suspense>, because checking the login reads
 * cookies (per-visitor data), and our "cacheComponents" setting requires that
 * inside <Suspense>. IMPORTANT: ALL the content is inside the guarded component,
 * so no order is sent until the role check has passed.
 */
export default function StaffPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12">
      <Suspense
        fallback={
          <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
            <div className="h-10 w-48 animate-pulse rounded-lg bg-stone-200" />
            <div className="h-32 animate-pulse rounded-xl bg-stone-200" />
            <div className="h-32 animate-pulse rounded-xl bg-stone-200" />
          </div>
        }
      >
        <StaffScreen />
      </Suspense>
    </main>
  );
}

/*
 * StaffScreen (runs on the server, per visitor, and AGAIN each time the
 * queue calls router.refresh() after a Realtime message).
 * 1. Guard: not logged in -> /login, wrong role -> /no-access.
 * 2. Read the active orders AND today's past orders. If one fails, that
 *    section shows a message instead of crashing, and the page keeps
 *    listening, so it recovers on the next change.
 */
async function StaffScreen() {
  await requireRole(["counter_staff"]);

  // Read the queue and Past Orders at the same time (Promise.allSettled =
  // wait for both; one failing doesn't stop the other from showing).
  const [active, past] = await Promise.allSettled([getActiveOrders(), getPastOrders()]);

  return (
    <StaffQueue
      orders={active.status === "fulfilled" ? active.value : []}
      loadError={active.status === "rejected"}
      pastOrders={past.status === "fulfilled" ? past.value : []}
      pastLoadError={past.status === "rejected"}
    />
  );
}
