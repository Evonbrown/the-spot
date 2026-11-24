/*
 * src/app/staff/sales/page.tsx   ->   http://localhost:3000/staff/sales
 *
 * WHAT: TODAY's sales for counter staff (Step 34, FR-06 SR-6.10: "Counter
 *       staff may only see the current day's sales"). The same summary as the
 *       Manager's, but with no date picker. Linked from the queue (/staff).
 *
 * LAYER: Presentation. requireRole (Application layer) does the access check;
 *        the database function daily_sales_summary (0016) ALSO refuses any
 *        other day for counter staff, so typing ?date=... changes nothing.
 *
 * WHO: counter_staff ONLY (strict role screens).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import SalesSummary from "@/components/SalesSummary";
import { requireRole } from "@/lib/auth/require-role";
import { getSalesSummary, jamaicaToday } from "@/lib/reports/get-sales-summary";

export const metadata: Metadata = {
  title: "Today's sales",
};

export default function StaffSalesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-12">
      <Link
        href="/staff"
        className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand hover:underline"
      >
        ← Back to queue
      </Link>
      <Suspense
        fallback={
          <div className="mt-2 flex flex-col gap-3" aria-hidden="true">
            <div className="h-10 w-48 animate-pulse rounded-lg bg-stone-200" />
            <div className="h-32 animate-pulse rounded-xl bg-stone-200" />
          </div>
        }
      >
        <StaffSales />
      </Suspense>
    </main>
  );
}

/* Guard first, then TODAY only (no date is ever read from the address). */
async function StaffSales() {
  await requireRole(["counter_staff"], { returnTo: "/staff/sales" });
  const today = await jamaicaToday();
  const result = await getSalesSummary(today);

  return (
    <>
      <h1 className="pt-2 text-3xl font-extrabold">Today&apos;s sales</h1>
      <p className="mt-1 text-sm text-stone-600">Since midnight, Jamaica time. Refresh the page for the latest figures.</p>
      <div className="mt-4">
        {"error" in result ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
            {result.error}
          </p>
        ) : (
          <SalesSummary summary={result.summary} />
        )}
      </div>
    </>
  );
}
