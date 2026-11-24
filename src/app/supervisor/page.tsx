/*
 * src/app/supervisor/page.tsx   ->   http://localhost:3000/supervisor
 *
 * WHAT: The Supervisor screen (Step 38a, FR-02, FR-06, UC-07; SDS class
 *       Supervisor): "Lynk payments to check" (Verify payment / Not
 *       received) and "Verified today". Refunds are added in Step 38b.
 *
 * LAYER: Presentation. requireRole (Application layer) checks the role; the
 *        lists are read with the Supervisor's own login (RLS, migration
 *        0020); the buttons call Server Actions (supervisor-actions.ts).
 *
 * WHO: supervisor ONLY (the only role that verifies Lynk payments and, in
 *      Step 38b, issues refunds).
 *
 * LIVE: OrderLiveRefresh listens to ALL orders (the Supervisor may read them
 * all, 0020): a new Lynk order, or a payment verified by another Supervisor
 * (the database touches the order), refreshes the lists. Plus a refresh
 * every 30 seconds, as a safety net.
 * (See src/app/staff/page.tsx for why everything sits inside <Suspense>.)
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import LynkPaymentList from "@/components/LynkPaymentList";
import OrderLiveRefresh from "@/components/OrderLiveRefresh";
import { requireRole } from "@/lib/auth/require-role";
import {
  getLynkToCheck,
  getLynkVerifiedToday,
  type LynkToCheck,
  type LynkVerified,
} from "@/lib/payments/get-lynk-payments";

export const metadata: Metadata = {
  title: "Payments",
};

export default function SupervisorPage() {
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
        <SupervisorScreen />
      </Suspense>
    </main>
  );
}

/*
 * SupervisorScreen (server, per visit):
 * 1. Guard: not logged in -> /login, wrong role -> /no-access.
 * 2. Load both lists AT THE SAME TIME. If the database can't be reached,
 *    show a message instead of a broken page.
 */
async function SupervisorScreen() {
  const profile = await requireRole(["supervisor"], { returnTo: "/supervisor" });

  let lists: { toCheck: LynkToCheck[]; verifiedToday: LynkVerified[] } | null;
  try {
    const [toCheck, verifiedToday] = await Promise.all([getLynkToCheck(), getLynkVerifiedToday(profile.id)]);
    lists = { toCheck, verifiedToday };
  } catch {
    lists = null;
  }

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Payments</h1>
        <OrderLiveRefresh channelName={`supervisor-${profile.id}`} refreshEverySeconds={30} />
      </div>
      <p className="mt-1 text-sm text-stone-600">
        Verify Lynk payments so they count in sales. This page updates by itself.
      </p>

      <div className="mt-4">
        {lists === null ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
            We couldn&apos;t load the payments. Check the connection and refresh the page.
          </p>
        ) : (
          <LynkPaymentList toCheck={lists.toCheck} verifiedToday={lists.verifiedToday} />
        )}
      </div>
    </>
  );
}
