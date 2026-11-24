/*
 * src/components/ItemVolumeReport.tsx
 *
 * WHAT: The Item Volume Report on /manager (Step 35, FR-06 SR-6.4 / AC-6.4):
 *         - filters: Category (all or one), Order type (all / pickup /
 *           delivery), Sort (quantity, revenue, name);
 *         - a table: Item (with size), Category, Quantity, Revenue, and a
 *           Total line;
 *         - the check line "= gross sales - delivery fees" (when no order
 *           type is chosen, item revenue must equal that).
 *
 * LAYER: Presentation. The lines come from getItemVolume() (Application
 *        layer), worked out, filtered and sorted by the database
 *        (item_volume_report, 0017).
 *
 * The filters are a plain "GET" form: choosing and pressing "Apply" opens
 * /manager?from=...&to=...&category=...&type=...&sort=... . Hidden fields
 * keep the chosen dates, so the date choice isn't lost. No JavaScript needed.
 *
 * Server component (no "use client"): it only draws.
 */

import { formatPrice } from "@/lib/menu-helpers";
import { ITEM_SORTS, type ItemFilters, type ItemVolumeLine } from "@/lib/reports/get-item-volume";

type Props = {
  start: string;
  end: string;
  categories: string[]; // in menu order (for the Category list)
  filters: ItemFilters;
  result: { lines: ItemVolumeLine[] } | { error: string };
  // gross sales - delivery fees for the same period (the check line), or
  // null if the summary couldn't load.
  itemsShouldTotal: number | null;
};

export default function ItemVolumeReport({ start, end, categories, filters, result, itemsShouldTotal }: Props) {
  const select = "mt-1 block min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base";

  return (
    <section aria-labelledby="items-title" className="rounded-xl bg-white p-5 shadow-sm">
      <h2 id="items-title" className="text-lg font-bold">
        Item volume
      </h2>
      <p className="mt-1 text-sm text-stone-600">
        Each item and size sold (paid orders only). Revenue is the price as charged, including extras; delivery fees
        are not item revenue.
      </p>

      {/* ---- Filters ---- */}
      <form method="get" className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        {/* Keep the chosen dates when the filters change. */}
        <input type="hidden" name="from" value={start} />
        <input type="hidden" name="to" value={end} />

        <label className="text-sm font-semibold">
          Category
          <select name="category" defaultValue={filters.category ?? ""} className={select}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Order type
          <select name="type" defaultValue={filters.fulfilment ?? ""} className={select}>
            <option value="">Pickup and delivery</option>
            <option value="PICKUP">Pickup only</option>
            <option value="DELIVERY">Delivery only</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Sort by
          <select name="sort" defaultValue={filters.sort} className={select}>
            {ITEM_SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
        >
          Apply
        </button>
      </form>

      {/* ---- The table ---- */}
      {"error" in result ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {result.error}
        </p>
      ) : result.lines.length === 0 ? (
        <p className="mt-4 text-sm text-stone-600">No items sold for this choice.</p>
      ) : (
        <ItemTable
          lines={result.lines}
          // The check only makes sense for ALL orders of the period.
          showCheck={filters.category === null && filters.fulfilment === null}
          itemsShouldTotal={itemsShouldTotal}
        />
      )}
    </section>
  );
}

function ItemTable({
  lines,
  showCheck,
  itemsShouldTotal,
}: {
  lines: ItemVolumeLine[];
  showCheck: boolean;
  itemsShouldTotal: number | null;
}) {
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  // Added up in cents (whole numbers), so J$ amounts never get rounding errors.
  const totalRevenue = lines.reduce((sum, line) => sum + Math.round(line.revenue * 100), 0) / 100;
  const num = "py-2 pr-3 text-right";

  return (
    <>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="border-b border-stone-200 text-stone-500">
            <tr>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Item
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Category
              </th>
              <th scope="col" className={`${num} font-semibold`}>
                Quantity
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Revenue
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={`${line.menuItemId}-${line.size ?? "one"}`} className="border-b border-stone-100">
                <th scope="row" className="py-2 pr-3 font-semibold">
                  {line.name}
                  {line.size && ` (${line.size})`}
                </th>
                <td className="py-2 pr-3 text-stone-600">{line.category}</td>
                <td className={num}>{line.quantity}</td>
                <td className="py-2 text-right">{formatPrice(line.revenue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-300 font-extrabold">
            <tr>
              <th scope="row" colSpan={2} className="py-2 pr-3">
                Total
              </th>
              <td className={num}>{totalQuantity}</td>
              <td className="py-2 text-right">{formatPrice(totalRevenue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* The built-in check: item revenue = gross sales - delivery fees. */}
      {showCheck && itemsShouldTotal !== null && (
        <p
          className={`mt-3 text-sm ${
            Math.round(totalRevenue * 100) === Math.round(itemsShouldTotal * 100) ? "text-stone-600" : "font-semibold text-red-800"
          }`}
        >
          {Math.round(totalRevenue * 100) === Math.round(itemsShouldTotal * 100)
            ? `Matches gross sales minus delivery fees (${formatPrice(itemsShouldTotal)}).`
            : `Warning: item revenue (${formatPrice(totalRevenue)}) doesn't equal gross sales minus delivery fees (${formatPrice(itemsShouldTotal)}).`}
        </p>
      )}
    </>
  );
}
