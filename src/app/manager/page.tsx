/*
 * src/app/manager/page.tsx   ->   http://localhost:3000/manager?date=2026-11-24
 *
 * WHAT: The Manager screen: the Daily Sales Summary for ONE business day
 *       (Step 34, FR-06 SR-6.1 / SR-6.2 / SR-6.3), with a date picker.
 *       Default: today (Jamaica time). The chosen day is in the address
 *       (?date=...), so it can be bookmarked and the Back button works.
 *       Item volumes, date ranges, closeout and export are later steps (35-37).
 *
 * LAYER: Presentation. requireRole (Application layer) does the access check;
 *        getSalesSummary (Application layer) asks the database to do the maths
 *        (Data layer, daily_sales_summary in migration 0016).
 *
 * WHO (SR-6.10): manager ONLY, and the Manager may pick ANY past day or today.
 *   (Counter staff see today only, on /staff/sales.)
 *
 * The date picker is a plain HTML form with method "get": choosing a day and
 * pressing "Show" just opens /manager?date=THAT-DAY. It works even before the
 * page's JavaScript has loaded.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import SalesSummary from "@/components/SalesSummary";
import { requireRole } from "@/lib/auth/require-role";
import { getSalesSummary, jamaicaToday, parseReportDay } from "@/lib/reports/get-sales-summary";

export const metadata: Metadata = {
  title: "Daily sales summary",
};

type SearchParams = Promise<{ date?: string | string[] }>;

/*
 * The address part (?date=) and the login are only known per visit, so
 * everything sits inside <Suspense> (Cache Components). ALL content is inside
 * the guarded component: no numbers are sent before the role check passes.
 */
export default function ManagerPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-12">
      <Suspense
        fallback={
          <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
            <div className="h-10 w-64 animate-pulse rounded-lg bg-stone-200" />
            <div className="h-32 animate-pulse rounded-xl bg-stone-200" />
            <div className="h-48 animate-pulse rounded-xl bg-stone-200" />
          </div>
        }
      >
        <ManagerScreen searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/*
 * ManagerScreen (runs on the server, per visit).
 * 1. Guard: not logged in -> /login (and back), wrong role -> /no-access.
 * 2. Read and check the chosen day (default today; not in the future).
 * 3. Ask the database for that day's summary.
 */
async function ManagerScreen({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  await requireRole(["manager"], { returnTo: "/manager" });

  const today = await jamaicaToday();
  // "?date=a&date=b" arrives as a list: use the first one.
  const dateText = Array.isArray(params.date) ? params.date[0] : params.date;
  const parsed = parseReportDay(dateText, today);
  const day = "day" in parsed ? parsed.day : today;
  const result = "day" in parsed ? await getSalesSummary(day) : null;

  return (
    <>
      <h1 className="pt-6 text-3xl font-extrabold">Daily sales summary</h1>

      {/* ---- The date picker ---- */}
      <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm font-semibold">
          Business day
          {/* max = today: no future days. text-base: no zoom on iPhones. */}
          <input
            type="date"
            name="date"
            defaultValue={day}
            max={today}
            required
            className="mt-1 block min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-base"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
        >
          Show
        </button>
        {day !== today && (
          <Link href="/manager" className="inline-flex min-h-11 items-center px-2 font-semibold text-brand underline">
            Back to today
          </Link>
        )}
      </form>
      <p className="mt-2 text-sm text-stone-600">
        {day === today ? "Today" : formatDay(day)} · midnight to midnight, Jamaica time · by the time each order was
        placed.
      </p>

      <div className="mt-4">
        {"error" in parsed ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
            {parsed.error}
          </p>
        ) : result && "error" in result ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
            {result.error}
          </p>
        ) : result ? (
          <SalesSummary summary={result.summary} />
        ) : null}
      </div>
    </>
  );
}

/* "2026-11-23" -> "Mon 23 Nov 2026" (shown under the picker). */
function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", // the text is a plain date, so no time-zone shift
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${day}T00:00:00Z`));
}
