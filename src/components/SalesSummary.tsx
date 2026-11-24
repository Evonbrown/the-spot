/*
 * src/components/SalesSummary.tsx
 *
 * WHAT: Shows one day's Daily Sales Summary (Step 34, FR-06 SR-6.1 /
 *       SR-6.2 / SR-6.3, AC-6.1 to AC-6.3):
 *         - the top figures: orders, gross sales (with delivery fees),
 *           refunds, NET SALES;
 *         - for information (never in sales): cancelled, abandoned and
 *           "not counted" (unpaid) orders;
 *         - the breakdown by payment type (Lynk, Cash): transactions,
 *           amount, refunds, net, % of net sales;
 *         - a red WARNING if the payment-type totals don't equal net sales.
 *       Used by BOTH /manager (any day) and /staff/sales (today), so they
 *       always look the same.
 *
 * LAYER: Presentation. The numbers come from getSalesSummary() (Application
 *        layer), worked out by the database (daily_sales_summary, 0016).
 *        Nothing is calculated here except formatting.
 *
 * Server component (no "use client"): it only draws.
 */

import { formatPrice } from "@/lib/menu-helpers";
import { PAYMENT_METHOD_LABELS } from "@/lib/order-status";
import type { SalesSummary as Summary } from "@/lib/reports/get-sales-summary";

export default function SalesSummary({ summary }: { summary: Summary }) {
  return (
    <div className="flex flex-col gap-4">
      {/* ---- AC-6.3: the consistency warning (only when something's wrong) ---- */}
      {!summary.totalsMatch && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 font-semibold text-red-900">
          Warning: the payment-type totals ({formatPrice(summary.methodsTotal)}) don&apos;t equal net sales (
          {formatPrice(summary.netSales)}). Some payment records don&apos;t match their orders. Please check before
          closing the day.
        </p>
      )}

      {/* ---- The top figures (SR-6.1) ---- */}
      <section aria-label="Totals" className="rounded-xl bg-white p-5 shadow-sm">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="Orders (paid)" value={String(summary.orders)} />
          <Figure label="Gross sales" value={formatPrice(summary.grossSales)} />
          {/* STEP 38: refunds come from the refunds table (J$0 until then). */}
          <Figure label="Refunds" value={formatPrice(summary.refunds)} />
          <Figure label="Net sales" value={formatPrice(summary.netSales)} big />
        </dl>
        <p className="mt-3 text-sm text-stone-600">
          Gross sales include {formatPrice(summary.deliveryFees)} in delivery fees. Only PAID orders count; cancelled
          and abandoned orders never do.
        </p>
      </section>

      {/* ---- Breakdown by payment type (SR-6.2) ---- */}
      <section aria-labelledby="by-type-title" className="rounded-xl bg-white p-5 shadow-sm">
        <h2 id="by-type-title" className="text-lg font-bold">
          By payment type
        </h2>
        {/* overflow-x-auto: on a narrow phone the table can scroll sideways
            inside its box instead of stretching the whole page. */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-500">
              <tr>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Type
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Transactions
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Amount
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Refunds
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Net
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  % of net
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.byMethod.map((line) => (
                <tr key={line.method} className="border-b border-stone-100">
                  <th scope="row" className="py-2 pr-3 font-semibold">
                    {PAYMENT_METHOD_LABELS[line.method]}
                  </th>
                  <td className="py-2 pr-3 text-right">{line.transactions}</td>
                  <td className="py-2 pr-3 text-right">{formatPrice(line.amount)}</td>
                  <td className="py-2 pr-3 text-right">{formatPrice(line.refunds)}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{formatPrice(line.net)}</td>
                  <td className="py-2 text-right">{line.percent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-stone-500">
          Lynk payments count once the Supervisor has verified them. Cash counts when it&apos;s received at the counter
          or by the driver.
        </p>
      </section>

      {/* ---- For information: never in sales (decision) ---- */}
      <section aria-label="Not in sales" className="rounded-xl bg-white p-5 shadow-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InfoLine label="Cancelled" count={summary.cancelledCount} value={summary.cancelledValue} />
          <InfoLine label="Abandoned" count={summary.abandonedCount} value={summary.abandonedValue} />
          <InfoLine
            label="Not counted (unpaid)"
            count={summary.notCountedCount}
            value={summary.notCountedValue}
          />
        </dl>
        <p className="mt-3 text-xs text-stone-500">
          &quot;Not counted&quot; = orders placed this day that aren&apos;t paid yet (for example Lynk orders waiting for
          the Supervisor, or cash orders not handed over yet).
        </p>
      </section>
    </div>
  );
}

/* One big number with its label. */
function Figure({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className={big ? "text-2xl font-extrabold text-brand" : "text-xl font-bold"}>{value}</dd>
    </div>
  );
}

/* "Cancelled: 1 order · J$600" */
function InfoLine({ label, count, value }: { label: string; count: number; value: number }) {
  return (
    <div>
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="font-semibold">
        {count} order{count === 1 ? "" : "s"} · {formatPrice(value)}
      </dd>
    </div>
  );
}
