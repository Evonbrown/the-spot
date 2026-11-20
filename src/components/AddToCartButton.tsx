/*
 * src/components/AddToCartButton.tsx
 *
 * WHAT: The "Add" button on a food card. Tapping it opens the options panel
 *       (ItemOptionsDialog). "Add to cart" in the panel puts the choice into
 *       the real cart (Part 16).
 *
 * LAYER: Presentation.
 *
 * WHY a separate small component? The card (MenuItemCard) is shown both on the
 * Menu page and in the Home page's "Today's specials", where it is built on the
 * server. Only this button needs the browser (it opens a panel), so only this
 * button is a client component, and the card can stay server-friendly.
 */
"use client";

import { useCallback, useState } from "react";
import { useCart } from "@/components/CartProvider";
import ItemOptionsDialog, { type ItemChoice } from "@/components/ItemOptionsDialog";
import type { Customization, MenuItem } from "@/lib/menu-helpers";

type Props = {
  item: MenuItem;
  customizations: Customization[];
};

export default function AddToCartButton({ item, customizations }: Props) {
  const [open, setOpen] = useState(false); // is the options panel open?
  const { addToCart } = useCart();

  // useCallback = keep the SAME function between redraws. The panel uses it
  // in its useEffect, which would otherwise re-run on every redraw.
  const handleClose = useCallback(() => setOpen(false), []);

  /*
   * The customer tapped "Add to cart" in the panel: turn their choice into a
   * cart line. We keep COPIES of the extras' names and prices for display;
   * the server re-checks all prices at checkout (Build step 3).
   * CartProvider shows the "Added to cart" message.
   */
  const handleAdd = useCallback(
    (choice: ItemChoice) => {
      addToCart({
        itemId: choice.item.id,
        name: choice.item.name,
        size: choice.size,
        unitPrice: choice.unitPrice,
        extras: choice.extras.map(({ id, name, extraPrice }) => ({ id, name, extraPrice })),
        note: choice.note,
        quantity: choice.quantity,
      });
    },
    [addToCart]
  );

  // FR-01: unavailable items can't be added.
  const unavailable = !item.isAvailable;

  return (
    <>
      {/* min-h-11 (44px) is the recommended minimum size for a tap target on phones. */}
      <button
        type="button"
        disabled={unavailable}
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400"
      >
        {unavailable ? "Unavailable" : "Add"}
      </button>

      {/* The panel is only on the page while open, so each opening starts fresh. */}
      {open && (
        <ItemOptionsDialog
          item={item}
          customizations={customizations}
          onAdd={handleAdd}
          onClose={handleClose}
        />
      )}
    </>
  );
}
