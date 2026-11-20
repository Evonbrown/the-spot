/*
 * src/components/MenuItemCard.tsx
 *
 * WHAT: Shows ONE menu item as a card: name, description, price (or its
 *       Small / Medium / Large prices), allergens, badges (Daily special /
 *       Made to order) and an "Add" button. For food (sized items), "Add"
 *       opens the options panel (AddToCartButton, Part 15).
 * LAYER: Presentation.
 *
 * WHY a component? The menu page and the home page ("Today's specials") both show
 * items. Writing the card once means they always look the same.
 */

import AddToCartButton from "@/components/AddToCartButton";
import {
  allergenText,
  formatPrice,
  isSinglePrice,
  type Customization,
  type MenuItem,
} from "@/lib/menu-helpers";

/*
 * MenuItemCard
 * "{ item }" is a PROP: information passed into a component, like an argument
 * passed into a function. Example: <MenuItemCard item={jerkChicken} />
 * customizations = the extras offered in the options panel (FR-02; the same
 * list for every food item, by decision).
 */
export default function MenuItemCard({
  item,
  customizations,
}: {
  item: MenuItem;
  customizations: Customization[];
}) {
  // FR-01: unavailable items are greyed out and cannot be added.
  const unavailable = !item.isAvailable;

  // A single-price item (e.g. Pepsi) has one option with no size.
  const singlePrice = isSinglePrice(item);

  // The lowest price on offer. Math.min(...list) finds the smallest number.
  const fromPrice = Math.min(...item.priceOptions.map((option) => option.price));

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

      {/* SAF-2: allergens are always shown.
          null = not confirmed yet -> tell the customer to ask (never say "None"
          unless the allergens have actually been confirmed as none). */}
      <p className="text-xs text-stone-700">
        <span className="font-semibold">Allergens: </span>
        {allergenText(item)}
      </p>

      {/* Sizes (Small / Medium / Large) and their prices, only for sized items.
          Only the sizes actually offered are listed (e.g. Fish: Large only).
          The customer chooses one in the options panel after tapping "Add". */}
      {!singlePrice && (
        <ul className="flex flex-wrap gap-2" aria-label="Sizes and prices">
          {item.priceOptions.map((option) => (
            <li
              key={option.size}
              className="rounded-lg border border-stone-200 px-2 py-1 text-sm"
            >
              <span className="text-stone-600">{option.size} </span>
              <span className="font-bold">{formatPrice(option.price)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* mt-auto pushes the price row to the bottom so cards line up in the grid */}
      <div className="mt-auto flex items-center justify-between pt-2">
        {/* Single price: show it. Sized: show the cheapest, e.g. "From J$750". */}
        <span className="text-lg font-extrabold">
          {singlePrice ? formatPrice(fromPrice) : `From ${formatPrice(fromPrice)}`}
        </span>

        {singlePrice ? (
          // A single-price item has nothing to choose. Part 16 (cart) will make
          // this button add it straight to the cart; for now it does nothing.
          // min-h-11 (44px) is the recommended minimum size for a tap target on phones.
          <button
            type="button"
            disabled={unavailable}
            className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {unavailable ? "Unavailable" : "Add"}
          </button>
        ) : (
          // Food (sized items): opens the options panel (size, extras, note, quantity).
          <AddToCartButton item={item} customizations={customizations} />
        )}
      </div>
    </article>
  );
}
