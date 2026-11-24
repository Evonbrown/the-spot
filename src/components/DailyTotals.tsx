/*
 * src/components/DailyTotals.tsx
 *
 * WHAT: The "Daily totals" table for a DATE RANGE (Step 35, FR-06 SR-6.5 /
 *       AC-6.5): one line per day (days with no sales show 0), then a Total
 *       line for the whole range. Columns: Date, Orders, Gross, Refunds, Net,
 *       Cash, Lynk. Step 38b: Refunds are the ones ISSUED that day, and Cash
 *       and Lynk are NET (after that type's refunds), like the Total line.
 *
 * LAYER: Presentation. The numbers come from getSalesRange() (Application
 *        layer), worked out by the database (sales_range_summary, 0017).
 *        The Total line is the DATABASE's combined total too, not added up
 *        here, so the page shows exactly what the database decided.
 *
 * Server component (no "use client"): it only draws.
 */

import { formatPrice } from "@/lib/menu-helpers";
import type { SalesRange } from "@/lib/reports/get-sales-summary";

/* "2026-11-24" -> "Tue 24 Nov" (a plain date: no time-zone shift). */
function shortDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${day}T00:00:00Z`));
}

/*
 * closedDays (Step 36): the days in the range that are CLOSED (locked by a
 * daily closeout), shown as a "Closed" column (✓ or –).
 */
export default function DailyTotals({ range, closedDays = [] }: { range: SalesRange; closedDays?: string[] }) {
  const total = range.total;
  const cash = total.byMethod.find((line) => line.method === "CASH")?.net ?? 0;
  const lynk = total.byMethod.find((line) => line.method === "LYNK")?.net ?? 0;

  // Shared cell styles (numbers line up on the right).
  const num = "py-2 pr-3 text-right";

  return (
    <section aria-labelledby="daily-title" className="rounded-xl bg-white p-5 shadow-sm">
      <h2 id="daily-title" className="text-lg font-bold">
        Daily totals
      </h2>
      {/* overflow-x-auto: on a narrow phone the table scrolls inside its box. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-stone-200 text-stone-500">
            <tr>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Date
              </th>
              <th scope="col" className={`${num} font-semibold`}>
                Orders
              </th>
              <th scope="col" className={`${num} font-semibold`}>
                Gross
              </th>
              <th scope="col" className={`${num} font-semibold`}>
                Refunds
              </th>
              <th scope="col" className={`${num} font-semibold`}>
                Net
              </th>
              <th scope="col" className={`${num} font-semibold`}>
                Cash
              </th>
              <th scope="col" className={`${num} font-semibold`}>
                Lynk
              </th>
              <th scope="col" className="py-2 text-center font-semibold">
                Closed
              </th>
            </tr>
          </thead>
          <tbody>
            {range.days.map((day) => (
              <tr key={day.day} className={`border-b border-stone-100 ${day.orders === 0 ? "text-stone-400" : ""}`}>
                <th scope="row" className="py-2 pr-3 font-semibold">
                  {shortDay(day.day)}
                </th>
                <td className={num}>{day.orders}</td>
                <td className={num}>{formatPrice(day.grossSales)}</td>
                <td className={num}>{formatPrice(day.refunds)}</td>
                <td className={`${num} font-semibold`}>{formatPrice(day.netSales)}</td>
                <td className={num}>{formatPrice(day.cash)}</td>
                <td className={num}>{formatPrice(day.lynk)}</td>
                <td className="py-2 text-center">
                  {closedDays.includes(day.day) ? (
                    <span aria-label="closed" className="font-bold text-green-700">✓</span>
                  ) : (
                    <span aria-label="not closed" className="text-stone-400">–</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-300 font-extrabold">
            <tr>
              <th scope="row" className="py-2 pr-3">
                Total ({range.days.length} days)
              </th>
              <td className={num}>{total.orders}</td>
              <td className={num}>{formatPrice(total.grossSales)}</td>
              <td className={num}>{formatPrice(total.refunds)}</td>
              <td className={num}>{formatPrice(total.netSales)}</td>
              <td className={num}>{formatPrice(cash)}</td>
              <td className={num}>{formatPrice(lynk)}</td>
              <td className="py-2 text-center text-sm font-semibold">
                {closedDays.length}/{range.days.length}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
