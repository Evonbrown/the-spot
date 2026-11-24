/*
 * src/app/supervisor/page.tsx   ->   http://localhost:3000/supervisor
 *                                     /supervisor?refund=1043#refunds
 *
 * WHAT: The Supervisor screen (FR-02, FR-06, UC-07; SDS classes Supervisor
 *       and Refund):
 *         - Step 38a: "Lynk payments to check" (Verify payment / Not
 *           received) and "Verified today";
 *         - Step 38b: "Refunds": find an order by its Order ID (?refund=),
 *           refund all or part of it with a reason, and "Refunds today".
 *
 * LAYER: Presentation. requireRole (Application layer) checks the role; the
 *        lists are read with the Supervisor's own login (RLS, migrations
 *        0020 / 0021); the buttons call Server Actions (supervisor-actions.ts).
 *
 * WHO: supervisor ONLY (the only role that verifies Lynk payments and issues
 *      refunds).
 *
 * LIVE: OrderLiveRefresh listens to ALL orders (the Supervisor may read them
 * all, 0020): a new Lynk order, or a payment verified by another Supervisor
 * (the database touches the order), refreshes the lists. Plus a refresh
 * every 30 seconds, as a safety net. (Typing in a form is kept: a refresh
 * only redraws the data.)
 * (See src/app/staff/page.tsx for why everything sits inside <Suspense>.)
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import LynkPaymentList from "@/components/LynkPaymentList";
import OrderLiveRefresh from "@/components/OrderLiveRefresh";
import RefundPanel from "@/components/RefundPanel";
import { requireRole } from "@/lib/auth/require-role";
import {
  getLynkToCheck,
  getLynkVerifiedToday,
  type LynkToCheck,
  type LynkVerified,
} from "@/lib/payments/get-lynk-payments";
import { findOrderForRefund, getRefundsToday, type RefundLine, type RefundOrder } from "@/lib/payments/get-refunds";

export const metadata: Metadata = {
  title: "Payments",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SupervisorPage({ searchParams }: { searchParams: SearchParams }) {
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
        <SupervisorScreen searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/*
 * SupervisorScreen (server, per visit):
 * 1. Guard: not logged in -> /login, wrong role -> /no-access.
 * 2. Load everything AT THE SAME TIME: the Lynk lists, today's refunds, and
 *    (if an Order ID was typed) that order. If the database can't be
 *    reached, show a message instead of a broken page.
 */
async function SupervisorScreen({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireRole(["supervisor"], { returnTo: "/supervisor" });
  const refundText = Array.isArray(params.refund) ? params.refund[0] : params.refund;

  let data: {
    toCheck: LynkToCheck[];
    verifiedToday: LynkVerified[];
    refundsToday: RefundLine[];
    lookup: { order: RefundOrder } | { error: string } | null;
  } | null;
  try {
    const [toCheck, verifiedToday, refundsToday, lookup] = await Promise.all([
      getLynkToCheck(),
      getLynkVerifiedToday(profile.id),
      getRefundsToday(profile.id),
      findOrderForRefund(refundText, profile.id),
    ]);
    data = { toCheck, verifiedToday, refundsToday, lookup };
  } catch {
    data = null;
  }

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Payments</h1>
        <OrderLiveRefresh channelName={`supervisor-${profile.id}`} refreshEverySeconds={30} />
      </div>
      <p className="mt-1 text-sm text-stone-600">
        Verify Lynk payments so they count in sales, and issue refunds.{" "}
        <a href="#refunds" className="font-semibold text-brand underline">
          Go to refunds
        </a>
      </p>

      <div className="mt-4">
        {data === null ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
            We couldn&apos;t load the payments. Check the connection and refresh the page.
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            <LynkPaymentList toCheck={data.toCheck} verifiedToday={data.verifiedToday} />
            <RefundPanel query={refundText ?? ""} lookup={data.lookup} refundsToday={data.refundsToday} />
          </div>
        )}
      </div>
    </>
  );
}
