/*
 * src/components/MenuAdminList.tsx
 *
 * WHAT: The Manager's list of menu items (Step 40a, SRS QA-3), grouped by
 *       category in menu order. Each row: name, price(s), labels (Daily
 *       special, Made-to-order, Allergens not confirmed), and:
 *         - an "Available" switch (e.g. Oxtail on Thursdays);
 *         - "Edit" (opens the form);
 *         - "Remove" -> "Remove X from the menu? Yes, remove / Cancel".
 *       Below: "Removed items" (hidden because they were ordered before),
 *       each with "Restore".
 *
 * LAYER: Presentation. The buttons call Server Actions (menu-actions.ts),
 *        which check "Manager only" and save; the database decides (RLS).
 *
 * "use client" = it runs in the browser: it reacts to taps.
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatPrice } from "@/lib/menu-helpers";
import type { AdminMenuItem } from "@/lib/menu-admin/get-menu-admin";
import {
  removeMenuItem,
  restoreMenuItem,
  setMenuItemAvailable,
  type MenuActionResult,
} from "@/lib/menu-admin/menu-actions";

/* "J$220" or "S J$800 · M J$1,100 · L J$1,350" (only the sizes offered). */
function priceText(item: AdminMenuItem): string {
  if (item.price !== null) return formatPrice(item.price);
  return (
    [
      ["S", item.priceSmall],
      ["M", item.priceMedium],
      ["L", item.priceLarge],
    ] as const
  )
    .filter(([, price]) => price !== null)
    .map(([size, price]) => `${size} ${formatPrice(price as number)}`)
    .join(" · ");
}

export default function MenuAdminList({ items }: { items: AdminMenuItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  /* Run a Server Action, show its message, redraw the list with fresh data. */
  function run(action: () => Promise<MenuActionResult>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
        setConfirmId(null);
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "We couldn't reach the server. Check your connection and try again." });
      }
    });
  }

  const onMenu = items.filter((item) => !item.isArchived);
  const removed = items.filter((item) => item.isArchived);
  const categories = [...new Set(onMenu.map((item) => item.category))];
  const small = "min-h-11 rounded-lg px-3 text-sm font-semibold disabled:opacity-60";

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-lg p-3 text-sm ${message.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}
        >
          {message.text}
        </p>
      )}

      {categories.map((category) => (
        <section key={category} aria-labelledby={`cat-${category}`} className="rounded-xl bg-white p-4 shadow-sm">
          <h2 id={`cat-${category}`} className="text-lg font-bold">
            {category}
          </h2>
          <ul className="mt-2 flex flex-col divide-y divide-stone-100">
            {onMenu
              .filter((item) => item.category === category)
              .map((item) => (
                <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className={item.isAvailable ? "" : "text-stone-400"}>
                    <p className="font-semibold">
                      {item.name}
                      {!item.isAvailable && <span className="ml-2 text-xs font-normal">(unavailable)</span>}
                    </p>
                    <p className="text-sm">{priceText(item)}</p>
                    <p className="flex flex-wrap gap-1 text-xs">
                      {item.isDailySpecial && <span className="rounded bg-orange-100 px-1.5 text-orange-900">Daily special</span>}
                      {item.isMadeToOrder && <span className="rounded bg-stone-100 px-1.5 text-stone-700">Made to order</span>}
                      {item.allergens === null && (
                        <span className="rounded bg-amber-100 px-1.5 text-amber-900">Allergens not confirmed</span>
                      )}
                    </p>
                  </div>

                  {confirmId === item.id ? (
                    <div role="group" aria-label={`Remove ${item.name}`} className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">Remove {item.name} from the menu?</span>
                      <button
                        type="button"
                        onClick={() => run(() => removeMenuItem(item.id))}
                        disabled={isPending}
                        className={`${small} bg-red-700 text-white hover:bg-red-800`}
                      >
                        {isPending ? "Removing…" : "Yes, remove"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        disabled={isPending}
                        className={`${small} border border-stone-300 bg-white`}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* aria-pressed: screen readers say "Available, on/off". */}
                      <button
                        type="button"
                        aria-pressed={item.isAvailable}
                        onClick={() => run(() => setMenuItemAvailable(item.id, !item.isAvailable))}
                        disabled={isPending}
                        className={`${small} ${
                          item.isAvailable ? "bg-green-700 text-white hover:bg-green-800" : "border border-stone-300 bg-white text-stone-700"
                        }`}
                      >
                        {item.isAvailable ? "Available: on" : "Available: off"}
                      </button>
                      <Link
                        href={`/manager/menu/${item.id}`}
                        className={`${small} inline-flex items-center border border-brand bg-white text-brand hover:bg-orange-50`}
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => setConfirmId(item.id)}
                        disabled={isPending}
                        className={`${small} border border-stone-300 bg-white text-red-800 hover:bg-red-50`}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}

      {/* ---- Removed items (hidden because old orders point at them) ---- */}
      <section aria-labelledby="removed-title" className="rounded-xl bg-white p-4 shadow-sm">
        <h2 id="removed-title" className="text-lg font-bold">
          Removed items ({removed.length})
        </h2>
        <p className="text-sm text-stone-600">
          Hidden from customers. They were ordered before, so they&apos;re kept for old orders and reports.
        </p>
        {removed.length > 0 && (
          <ul className="mt-2 flex flex-col divide-y divide-stone-100">
            {removed.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-stone-600">
                  {item.name} <span className="text-xs">({item.category})</span>
                </span>
                <button
                  type="button"
                  onClick={() => run(() => restoreMenuItem(item.id))}
                  disabled={isPending}
                  className={`${small} border border-brand bg-white text-brand hover:bg-orange-50`}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
