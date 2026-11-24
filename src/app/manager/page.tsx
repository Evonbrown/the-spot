/*
 * src/app/manager/page.tsx
 *   ->   http://localhost:3000/manager?from=2026-11-01&to=2026-11-24
 *
 * WHAT: The Manager's reports (FR-06):
 *         - Step 34: the Daily Sales Summary (SR-6.1 / SR-6.2 / SR-6.3);
 *         - Step 35: a DATE RANGE of 1 to 31 days (SR-6.5): "Daily totals"
 *           (a line per day + Total) and the combined summary;
 *         - Step 35: the Item Volume Report (SR-6.4) for the same day/range,
 *           with category, order type and sort filters.
 *       Default: today (Jamaica time). The choice is in the address, so it
 *       can be bookmarked and Back works. The old "?date=" (Step 34) still
 *       works. Export / print is Step 37.
 *       - Step 36: for ONE day, the "Daily closeout" box (count, approve and
 *         lock, reopen, history, limit); for a range, a "Closed" column.
 *
 * LAYER: Presentation. requireRole (Application layer) does the access check;
 *        the reports are worked out by the database (Data layer, 0016/0017),
 *        which checks the role and the date rules AGAIN.
 *
 * WHO (SR-6.10): manager ONLY. (Counter staff see today only, /staff/sales.)
 *
 * The date and filter controls are plain HTML "GET" forms: pressing the
 * button just opens /manager?... with the choices. Hidden fields carry the
 * OTHER form's choices along, so changing dates keeps the filters and the
 * other way round. It all works before the page's JavaScript has loaded.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import CloseoutPanel from "@/components/CloseoutPanel";
import DailyTotals from "@/components/DailyTotals";
import ItemVolumeReport from "@/components/ItemVolumeReport";
import SalesSummary from "@/components/SalesSummary";
import { requireRole } from "@/lib/auth/require-role";
import { getMenuItems } from "@/lib/menu";
import { getCategories } from "@/lib/menu-helpers";
import { getCloseout, getClosedDays } from "@/lib/reports/get-closeout";
import { getItemVolume, readItemFilters, type ItemFilters } from "@/lib/reports/get-item-volume";
import {
  getSalesRange,
  getSalesSummary,
  jamaicaToday,
  MAX_RANGE_DAYS,
  parseReportRange,
} from "@/lib/reports/get-sales-summary";

export const metadata: Metadata = {
  title: "Sales reports",
};

type Params = Record<string, string | string[] | undefined>;
type SearchParams = Promise<Params>;

/*
 * The address (?from=...) and the login are only known per visit, so
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

/* "?a=1&a=2" arrives as a list: use the first value. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/* "2026-11-24" + (-6) -> "2026-11-18" (plain dates, counted in UTC). */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/*
 * ManagerScreen (runs on the server, per visit).
 * 1. Guard: not logged in -> /login (and back), wrong role -> /no-access.
 * 2. Read and check the day / range and the item filters.
 * 3. Load the summary (one day) or range, the item report and the category
 *    list AT THE SAME TIME.
 */
async function ManagerScreen({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  await requireRole(["manager"], { returnTo: "/manager" });

  const today = await jamaicaToday();
  // "from" (or Step 34's "date"), and "to".
  const parsed = parseReportRange(first(params.from) ?? first(params.date), first(params.to), today);
  const start = "start" in parsed ? parsed.start : today;
  const end = "end" in parsed ? parsed.end : today;
  const isRange = start !== end;

  // The category list comes from the menu (cached), in menu order. If the
  // menu can't load, the filter just offers "All categories".
  const categories = await getMenuItems().then(getCategories, () => [] as string[]);
  const filters = readItemFilters(
    { category: first(params.category), type: first(params.type), sort: first(params.sort) },
    categories
  );

  // Only load reports when the dates are valid.
  // Step 36: one day -> its closeout box; a range -> which days are closed.
  const [summaryResult, rangeResult, itemsResult, closeoutResult, closedDays] =
    "error" in parsed
      ? [null, null, null, null, []]
      : await Promise.all([
          isRange ? null : getSalesSummary(start),
          isRange ? getSalesRange(start, end) : null,
          getItemVolume(start, end, filters),
          isRange ? null : getCloseout(start),
          isRange ? getClosedDays(start, end) : Promise.resolve([] as string[]),
        ]);

  // The figures for the period (one day, or the range's combined total).
  const periodSummary =
    summaryResult && "summary" in summaryResult
      ? summaryResult.summary
      : rangeResult && "range" in rangeResult
        ? rangeResult.range.total
        : null;
  const loadError =
    (summaryResult && "error" in summaryResult && summaryResult.error) ||
    (rangeResult && "error" in rangeResult && rangeResult.error) ||
    null;

  return (
    <>
      <h1 className="pt-6 text-3xl font-extrabold">Sales reports</h1>

      <DateControls start={start} end={end} today={today} filters={filters} />
      <p className="mt-2 text-sm text-stone-600">
        {isRange ? `${formatDay(start)} to ${formatDay(end)}` : start === today ? "Today" : formatDay(start)} ·
        midnight to midnight, Jamaica time · by the time each order was placed.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {"error" in parsed ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
            {parsed.error}
          </p>
        ) : (
          <>
            {loadError && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
                {loadError}
              </p>
            )}
            {/* Range: a line per day first, then the combined summary. */}
            {rangeResult && "range" in rangeResult && (
              <DailyTotals range={rangeResult.range} closedDays={closedDays} />
            )}
            {periodSummary && (
              <>
                {isRange && <h2 className="text-xl font-bold">Whole range</h2>}
                <SalesSummary summary={periodSummary} />
              </>
            )}
            {/* Step 36: the closeout for this ONE day (status shown on the report). */}
            {closeoutResult &&
              ("details" in closeoutResult ? (
                <CloseoutPanel details={closeoutResult.details} isManager />
              ) : (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
                  {closeoutResult.error}
                </p>
              ))}
            {itemsResult && (
              <ItemVolumeReport
                start={start}
                end={end}
                categories={categories}
                filters={filters}
                result={itemsResult}
                itemsShouldTotal={periodSummary ? periodSummary.grossSales - periodSummary.deliveryFees : null}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

/*
 * DateControls: From / To and quick choices. For ONE day, leave "To" empty
 * (or the same as "From"). The item filters ride along as hidden fields.
 */
function DateControls({
  start,
  end,
  today,
  filters,
}: {
  start: string;
  end: string;
  today: string;
  filters: ItemFilters;
}) {
  const input = "mt-1 block min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-base";
  // Keep the item filters in the quick links too.
  const keep = new URLSearchParams();
  if (filters.category) keep.set("category", filters.category);
  if (filters.fulfilment) keep.set("type", filters.fulfilment);
  if (filters.sort !== "quantity") keep.set("sort", filters.sort);
  const link = (from: string, to: string) => {
    const query = new URLSearchParams(keep);
    query.set("from", from);
    query.set("to", to);
    return `/manager?${query.toString()}`;
  };
  const monthStart = `${today.slice(0, 8)}01`; // "2026-11-24" -> "2026-11-01"

  return (
    <>
      <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
        {filters.fulfilment && <input type="hidden" name="type" value={filters.fulfilment} />}
        {filters.sort !== "quantity" && <input type="hidden" name="sort" value={filters.sort} />}
        <label className="text-sm font-semibold">
          From
          <input type="date" name="from" defaultValue={start} max={today} required className={input} />
        </label>
        <label className="text-sm font-semibold">
          To <span className="font-normal text-stone-500">(empty = one day)</span>
          <input type="date" name="to" defaultValue={end === start ? "" : end} max={today} className={input} />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
        >
          Show
        </button>
      </form>
      <p className="mt-2 flex flex-wrap gap-x-4 text-sm">
        <Link href={link(today, today)} className="inline-flex min-h-11 items-center font-semibold text-brand underline">
          Today
        </Link>
        <Link
          href={link(addDays(today, -6), today)}
          className="inline-flex min-h-11 items-center font-semibold text-brand underline"
        >
          Last 7 days
        </Link>
        <Link href={link(monthStart, today)} className="inline-flex min-h-11 items-center font-semibold text-brand underline">
          This month
        </Link>
        <span className="inline-flex min-h-11 items-center text-stone-500">Up to {MAX_RANGE_DAYS} days.</span>
      </p>
    </>
  );
}

/* "2026-11-23" -> "Mon 23 Nov 2026". */
function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", // the text is a plain date, so no time-zone shift
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${day}T00:00:00Z`));
}
