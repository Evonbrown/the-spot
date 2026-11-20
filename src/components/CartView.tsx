/*
 * src/components/CartView.tsx
 *
 * WHAT: The contents of the cart page: one box per cart line (name, size,
 *       extras, meal note, price each, quantity − 1 +, Remove, line total),
 *       and a summary box (item count, subtotal, Checkout button).
 *
 * LAYER: Presentation. Reads and changes the cart through useCart()
 *        (CartProvider), which uses the cart rules in src/lib/cart.ts.
 *
 * WHY:
 *   - FR-02: shows customizations, meal notes and the total
 *     (items + customizations; the delivery fee is added at checkout).
 *   - Usability: the middle step of Menu -> Cart -> Checkout.
 *
 * DECISIONS: a line can only change quantity (1-10, "−" disabled at 1) or be
 * removed; to change size/extras/note, remove it and add it again. Prices are
 * NOT re-checked here: the server re-checks everything at checkout (step 3).
 *
 * "use client" = it runs in the browser (the cart lives in the browser).
 */
"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useCart } from "@/components/CartProvider";
import QuantityStepper from "@/components/QuantityStepper";
import { cartSubtotal, lineTotal, type CartLine } from "@/lib/cart";
import { formatExtraPrice, formatPrice } from "@/lib/menu-helpers";

/*
 * useIsBrowser() -> false while the server builds the page (and during the
 * browser's first "hydration" drawing), true after that.
 * WHY? The server can't see the cart (it's in the browser's storage), so it
 * would draw "Your cart is empty" and then, a moment later, your items would
 * pop in: a confusing flash. Instead we show a grey placeholder until we're in
 * the browser and can actually read the cart.
 * (It uses the same useSyncExternalStore idea as CartProvider: the "server"
 * answer is false and the "browser" answer is true.)
 */
const noSubscribe = () => () => {};
function useIsBrowser(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
}

export default function CartView() {
  const isBrowser = useIsBrowser();
  const { lines, count, changeQuantity, removeFromCart } = useCart();

  // 1. Not in the browser yet: grey placeholder boxes ("loading skeleton").
  //    animate-pulse gently fades them in and out to show something is loading.
  if (!isBrowser) {
    return (
      <div className="mt-6 flex flex-col gap-4" aria-hidden="true">
        <div className="h-32 animate-pulse rounded-xl bg-stone-200" />
        <div className="h-32 animate-pulse rounded-xl bg-stone-200" />
      </div>
    );
  }

  // 2. Empty cart: say so, and offer the way back to the menu.
  if (lines.length === 0) {
    return (
      <div className="mt-6 rounded-xl bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-semibold">Your cart is empty.</p>
        <p className="mt-1 text-sm text-stone-600">Add something tasty from the menu.</p>
        <Link
          href="/menu"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
        >
          Back to the menu
        </Link>
      </div>
    );
  }

  // 3. The cart. FR-02: subtotal = items + customizations (shared cent-exact maths).
  const subtotal = cartSubtotal(lines);

  return (
    // PHONES: lines stacked, summary underneath.
    // WIDE SCREENS ("lg:" 1024px+): lines on the left (2/3), summary on the right (1/3).
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
      {/* The lines. A <ul> list, so screen readers say "list, 2 items". */}
      <ul className="flex flex-col gap-4 lg:col-span-2">
        {lines.map((line) => (
          <CartLineBox
            key={line.lineId}
            line={line}
            onQuantity={(quantity) => changeQuantity(line.lineId, quantity)}
            onRemove={() => removeFromCart(line.lineId)}
          />
        ))}
      </ul>

      {/* SUMMARY. "lg:sticky lg:top-20" keeps it in view (under the header)
          while scrolling a long cart on wide screens. */}
      <aside className="rounded-xl bg-white p-5 shadow-sm lg:sticky lg:top-20">
        <h2 className="text-lg font-bold">Summary</h2>
        <div className="mt-3 flex justify-between text-sm text-stone-600">
          <span>Items</span>
          <span>{count}</span>
        </div>
        {/* aria-live: screen readers hear the new subtotal after a change */}
        <div aria-live="polite" className="mt-2 flex justify-between text-lg font-extrabold">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <p className="mt-2 text-xs text-stone-600">
          Delivery fee (delivery orders only) is added at checkout, where prices are confirmed.
        </p>

        {/* Decision: shown but disabled until checkout is built (Build step 3). */}
        <button
          type="button"
          disabled
          className="mt-4 min-h-12 w-full rounded-xl bg-brand font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          Checkout
        </button>
        <p className="mt-2 text-center text-xs text-stone-500">Checkout comes in Build step 3.</p>

        <Link
          href="/menu"
          className="mt-3 block text-center text-sm font-semibold text-brand hover:underline"
        >
          ← Keep shopping
        </Link>
      </aside>
    </div>
  );
}

/*
 * CartLineBox: one cart line.
 * "price each" = size price + extras (for ONE item); the line total multiplies
 * by the quantity, using the shared lineTotal() -> calculateLinePrice().
 */
function CartLineBox({
  line,
  onQuantity,
  onRemove,
}: {
  line: CartLine;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const priceEach = lineTotal({ ...line, quantity: 1 });
  const title = line.size ? `${line.name} (${line.size})` : line.name;

  return (
    <li className="rounded-xl border border-orange-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">{title}</h2>

          {/* Extras with their prices (FR-02), e.g. "+ Coleslaw (Sample) +J$150" */}
          {line.extras.length > 0 && (
            <ul className="mt-1 text-sm text-stone-600">
              {line.extras.map((extra) => (
                <li key={extra.id}>
                  + {extra.name} <span className="text-stone-500">{formatExtraPrice(extra.extraPrice)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Meal note (FR-02), if there is one. break-words: long words wrap. */}
          {line.note && (
            <p className="mt-1 break-words text-sm italic text-stone-600">Note: &quot;{line.note}&quot;</p>
          )}

          <p className="mt-1 text-xs text-stone-500">{formatPrice(priceEach)} each</p>
        </div>

        {/* Line total, always (price each × quantity) */}
        <p className="shrink-0 text-lg font-extrabold">{formatPrice(lineTotal(line))}</p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {/* Shared − 1 + control: "−" disabled at 1, "+" disabled at 10 (decisions). */}
        <QuantityStepper value={line.quantity} onChange={onQuantity} itemName={title} />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          className="min-h-11 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          Remove
        </button>
      </div>
    </li>
  );
}
