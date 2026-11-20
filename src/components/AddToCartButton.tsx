/*
 * src/components/AddToCartButton.tsx
 *
 * WHAT: The "Add" button on a food card. Tapping it opens the options panel
 *       (ItemOptionsDialog). After "Add to cart", it shows a short confirmation
 *       message at the bottom of the screen.
 *
 * LAYER: Presentation.
 *
 * WHY a separate small component? The card (MenuItemCard) is shown both on the
 * Menu page and in the Home page's "Today's specials", where it is built on the
 * server. Only this button needs the browser (it opens a panel), so only this
 * button is a client component, and the card can stay server-friendly.
 *
 * PART 15 ONLY: there is no cart yet, so "Add to cart" just shows what WOULD be
 * added. Part 16 will put the choice into the real cart.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import ItemOptionsDialog, { type ItemChoice } from "@/components/ItemOptionsDialog";
import { formatPrice, type Customization, type MenuItem } from "@/lib/menu-helpers";

type Props = {
  item: MenuItem;
  customizations: Customization[];
};

export default function AddToCartButton({ item, customizations }: Props) {
  const [open, setOpen] = useState(false); // is the options panel open?
  const [message, setMessage] = useState<string | null>(null); // confirmation text

  // useCallback = keep the SAME function between redraws. The panel uses it
  // in its useEffect, which would otherwise re-run on every redraw.
  const handleClose = useCallback(() => setOpen(false), []);

  // Build the confirmation text, e.g.
  // "Added: 2 × Fry Chicken (Large) + Coleslaw (Sample) – J$2,700 (cart coming in Part 16)"
  const handleAdd = useCallback((choice: ItemChoice) => {
    const extras = choice.extras.length
      ? ` + ${choice.extras.map((extra) => extra.name).join(", ")}`
      : "";
    const note = choice.note ? `. Note: "${choice.note}"` : "";
    setMessage(
      `Added: ${choice.quantity} × ${choice.item.name} (${choice.size})${extras} – ` +
        `${formatPrice(choice.linePrice)}${note} (cart coming in Part 16)`
    );
  }, []);

  // Hide the confirmation automatically after 6 seconds.
  // The clean-up (clearTimeout) cancels the timer if a new message comes first.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [message]);

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

      {/* Confirmation message ("toast") at the bottom of the screen.
          role="status" makes screen readers read it out. */}
      {message && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-lg rounded-xl bg-ink p-4 text-sm text-white shadow-lg"
        >
          {message}
        </div>
      )}
    </>
  );
}
