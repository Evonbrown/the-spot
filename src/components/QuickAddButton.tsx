/*
 * src/components/QuickAddButton.tsx
 *
 * WHAT: A one-tap "Add" button for single-price items (e.g. Pepsi J$220).
 *       There's nothing to choose (no sizes; drinks have no extras), so it puts
 *       1 straight into the cart and CartProvider shows "Added to cart".
 *
 * LAYER: Presentation.
 *
 * WHY: Usability (order in under 3 minutes): opening a panel just to confirm
 *      "1 Pepsi" would be a wasted tap.
 *
 * "use client" = it runs in the browser (it changes the cart).
 */
"use client";

import { useCart } from "@/components/CartProvider";
import type { MenuItem } from "@/lib/menu-helpers";

type Props = {
  item: MenuItem;
  className?: string; // lets the row and the card size the button differently
};

export default function QuickAddButton({ item, className = "" }: Props) {
  const { addSingleItem } = useCart();
  // FR-01: unavailable items are greyed out and can't be added.
  const unavailable = !item.isAvailable;

  return (
    <button
      type="button"
      disabled={unavailable}
      onClick={() => addSingleItem(item)}
      // aria-label gives screen readers the full meaning: "Add Pepsi to cart".
      aria-label={unavailable ? `${item.name} is unavailable` : `Add ${item.name} to cart`}
      className={`min-h-11 shrink-0 rounded-lg bg-brand font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400 ${className}`}
    >
      {unavailable ? "Unavailable" : "Add"}
    </button>
  );
}
