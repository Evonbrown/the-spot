/*
 * src/components/QuantityStepper.tsx
 *
 * WHAT: The "− 1 +" control for choosing a quantity.
 *
 * LAYER: Presentation.
 *
 * WHY a shared component? Both the options panel (Part 15) and the cart page
 * (Part 17) need it. Writing it once means it looks and behaves the same in
 * both places, including the limits.
 *
 * RULES (decisions): quantity is 1 to 10. "−" is disabled at 1 (to remove a
 * cart line, use its Remove button, so nobody removes one by accident), and
 * "+" is disabled at 10.
 *
 * No "use client" needed here: it has no state of its own. It is used inside
 * client components, so it runs in the browser with them.
 */

import { MAX_QUANTITY } from "@/lib/menu-helpers";

type Props = {
  value: number; // the current quantity
  onChange: (quantity: number) => void; // called with the new quantity
  itemName?: string; // for screen readers, e.g. "One less Pepsi"
};

export default function QuantityStepper({ value, onChange, itemName }: Props) {
  const forItem = itemName ? ` ${itemName}` : "";
  const buttonClass =
    "size-11 rounded-full border border-stone-300 bg-white text-xl font-bold disabled:opacity-40";

  return (
    // role="group" + aria-label: screen readers say "Quantity for Pepsi, group".
    <div className="flex items-center gap-1" role="group" aria-label={`Quantity${itemName ? ` for ${itemName}` : ""}`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label={`One less${forItem}`}
        className={buttonClass}
      >
        −
      </button>
      {/* aria-live: screen readers announce the new number */}
      <span aria-live="polite" className="w-8 text-center text-lg font-bold">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(MAX_QUANTITY, value + 1))}
        disabled={value >= MAX_QUANTITY}
        aria-label={`One more${forItem}`}
        className={buttonClass}
      >
        +
      </button>
    </div>
  );
}
