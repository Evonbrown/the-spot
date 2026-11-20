/*
 * src/components/MenuItemCard.tsx
 *
 * WHAT: Shows ONE menu item as a card: name, description, price, allergens,
 *       badges (Daily special / Made to order) and an "Add" button.
 * LAYER: Presentation.
 *
 * WHY a component? The menu page and the home page ("Today's specials") both show
 * items. Writing the card once means they always look the same.
 */

import { formatPrice, type MenuItem } from "@/lib/menu";

/*
 * MenuItemCard
 * "{ item }" is a PROP: information passed into a component, like an argument
 * passed into a function. Example: <MenuItemCard item={jerkChicken} />
 */
export default function MenuItemCard({ item }: { item: MenuItem }) {
  // FR-01: unavailable items are greyed out and cannot be added.
  const unavailable = !item.isAvailable;

  return (
    <article
      // opacity-60 + grayscale = the "greyed out" look for unavailable items
      className={`flex flex-col gap-2 rounded-xl border border-orange-100 bg-white p-4 shadow-sm ${
        unavailable ? "opacity-60 grayscale" : ""
      }`}
    >
      {/* Badges: only shown when they apply */}
      <div className="flex flex-wrap gap-2 empty:hidden">
        {item.isDailySpecial && (
          <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">
            ★ Daily special
          </span>
        )}
        {/* FR-01: made-to-order items (fries) need at least 15 minutes for pickup */}
        {item.isMadeToOrder && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
            Made to order · 15 min
          </span>
        )}
      </div>

      <h3 className="text-lg font-bold">{item.name}</h3>
      <p className="text-sm text-stone-600">{item.description}</p>

      {/* SAF-2: allergens are always shown, even when there are none */}
      <p className="text-xs text-stone-700">
        <span className="font-semibold">Allergens: </span>
        {item.allergens.length > 0 ? item.allergens.join(", ") : "None listed"}
      </p>

      {/* mt-auto pushes the price row to the bottom so cards line up in the grid */}
      <div className="mt-auto flex items-center justify-between pt-2">
        <span className="text-lg font-extrabold">{formatPrice(item.price)}</span>

        {/* PREVIEW ONLY: this button does nothing yet. The cart is a later part.
            min-h-11 (44px) is the recommended minimum size for a tap target on phones. */}
        <button
          type="button"
          disabled={unavailable}
          className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {unavailable ? "Unavailable" : "Add"}
        </button>
      </div>
    </article>
  );
}
