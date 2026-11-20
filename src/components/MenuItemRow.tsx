/*
 * src/components/MenuItemRow.tsx
 *
 * WHAT: Shows ONE single-price menu item (e.g. Pepsi J$220) as a slim row:
 *       name, allergens, price and an "Add" button. Many rows sit together in
 *       one white box (see menu/page.tsx).
 *
 * LAYER: Presentation.
 *
 * WHY: Usability (SRS 3: order in under 3 minutes). The menu has 40 drinks.
 *      As big cards they made the page very long; as slim rows a customer can
 *      scan them quickly. Decision: every SINGLE-PRICE item is shown as a row
 *      (today that's exactly the drinks), sized items (food) stay as cards.
 *
 * Same rules as the card:
 *   - FR-01: unavailable items are greyed out and can't be added.
 *   - SAF-2: allergens are always shown, even in the compact row.
 */

import { allergenText, formatPrice, type MenuItem } from "@/lib/menu-helpers";

/*
 * MenuItemRow
 * Prop: item = a single-price item. Its price is priceOptions[0].price.
 * Rendered as an <li> (list item), because the rows sit inside a <ul> list.
 */
export default function MenuItemRow({ item }: { item: MenuItem }) {
  const unavailable = !item.isAvailable;
  const price = item.priceOptions[0].price;

  return (
    <li
      // flex = name on the left, price + button on the right, in one line.
      // opacity-60 + grayscale = the same "greyed out" look as the cards.
      className={`flex items-center gap-3 px-4 py-3 ${unavailable ? "opacity-60 grayscale" : ""}`}
    >
      {/* Left side. min-w-0 + flex-1 let a long name wrap instead of
          pushing the price and button off the screen on small phones. */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {item.name}
          {/* Badges are rare for single-price items, but kept so nothing is lost */}
          {item.isDailySpecial && (
            <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">
              ★ Special
            </span>
          )}
          {item.isMadeToOrder && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              15 min
            </span>
          )}
        </p>
        {item.description && <p className="text-xs text-stone-600">{item.description}</p>}
        {/* SAF-2: allergens, same wording as the cards (shared allergenText) */}
        <p className="text-xs text-stone-600">Allergens: {allergenText(item)}</p>
      </div>

      <span className="shrink-0 font-bold">{formatPrice(price)}</span>

      {/* PREVIEW ONLY: does nothing yet (the cart is a later part).
          min-h-11 = 44px, the recommended minimum tap size on phones. */}
      <button
        type="button"
        disabled={unavailable}
        className="min-h-11 shrink-0 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400"
      >
        {unavailable ? "Unavailable" : "Add"}
      </button>
    </li>
  );
}
