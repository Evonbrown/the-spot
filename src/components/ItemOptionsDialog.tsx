/*
 * src/components/ItemOptionsDialog.tsx
 *
 * WHAT: The options panel that opens when a customer taps "Add" on a food item.
 *       They choose a size, tick extras (sides / sauces), type an optional meal
 *       note and pick a quantity. The price on the button updates live.
 *
 * LAYER: Presentation.
 *
 * WHY:
 *   - FR-02: customizations with extra cost + meal notes;
 *            line price = (size price + extras) x quantity.
 *   - FR-01: sizes come from the menu item (only the sizes offered).
 *   - SAF-2: allergens are shown again here, right before ordering.
 *
 * "use client" = it runs in the browser: it reacts to every tap and key press.
 *
 * HOW IT OPENS: AddToCartButton only puts this component on the page while the
 * panel is open. So every time it opens, all choices start fresh (no size
 * chosen, no extras ticked, quantity 1).
 */
"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import QuantityStepper from "@/components/QuantityStepper";
import {
  allergenText,
  calculateLinePrice,
  formatExtraPrice,
  formatPrice,
  MAX_NOTE_LENGTH,
  type Customization,
  type MenuItem,
  type Size,
} from "@/lib/menu-helpers";

/*
 * What the panel hands back when the customer taps "Add to cart".
 * AddToCartButton turns this into a cart line (Part 16).
 */
export type ItemChoice = {
  item: MenuItem;
  size: Size;
  unitPrice: number; // the chosen size's price
  extras: Customization[];
  note: string;
  quantity: number;
  linePrice: number;
};

type Props = {
  item: MenuItem;
  customizations: Customization[];
  onAdd: (choice: ItemChoice) => void; // called with the customer's choices
  onClose: () => void; // called when the panel closes (Esc, ✕, backdrop, or after Add)
};

export default function ItemOptionsDialog({ item, customizations, onAdd, onClose }: Props) {
  // A handle to the real <dialog> element, so we can call showModal() on it.
  const dialogRef = useRef<HTMLDialogElement>(null);

  // useId() makes ids that are unique on the page, even with many panels.
  // They connect each <label> to its box, so tapping the text ticks the box
  // and screen readers know which label belongs to which box.
  const baseId = useId();

  // ---- The customer's choices (React state) ---------------------------------
  // Decision: no size is pre-chosen, UNLESS the item has only one size (Fish:
  // Large), so nobody gets the wrong size by accident.
  const [size, setSize] = useState<Size | null>(
    item.priceOptions.length === 1 ? item.priceOptions[0].size : null
  );
  const [extraIds, setExtraIds] = useState<number[]>([]); // ticked extras
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);

  /*
   * Open the panel as soon as this component appears.
   * showModal() is the browser's built-in "modal dialog": it dims the page
   * behind (the "backdrop"), keeps keyboard focus inside the panel, and closes
   * on the Esc key. We get all of that for free, accessible to screen readers.
   * When the dialog closes for ANY reason, the browser fires a "close" event,
   * and we tell the parent (onClose) so it removes the panel.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Only open it if it isn't open already: calling showModal() on an open
    // dialog is an error in browsers (this effect can run again if onClose changes).
    if (!dialog.open) dialog.showModal();
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [onClose]);

  // ---- Working out the price ------------------------------------------------
  const unitPrice = item.priceOptions.find((option) => option.size === size)?.price ?? null;
  const chosenExtras = customizations.filter((extra) => extraIds.includes(extra.id));
  // null until a size is chosen. Uses the SAME shared function as the cart will.
  const linePrice =
    unitPrice === null ? null : calculateLinePrice(unitPrice, chosenExtras, quantity);

  // Group the extras for display: Sides first, then Sauces.
  const groups: { title: string; extras: Customization[] }[] = [
    { title: "Sides", extras: customizations.filter((extra) => extra.kind === "side") },
    { title: "Sauces", extras: customizations.filter((extra) => extra.kind === "sauce") },
  ].filter((group) => group.extras.length > 0);

  // Tick / untick one extra. Decision: each extra at most once (a tick box).
  function toggleExtra(id: number) {
    setExtraIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  // "Add to cart" pressed. preventDefault stops the browser's normal form
  // behaviour (reloading the page); we handle it ourselves.
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (size === null || linePrice === null) return; // button is disabled anyway
    if (unitPrice === null) return;
    onAdd({ item, size, unitPrice, extras: chosenExtras, note: note.trim(), quantity, linePrice });
    dialogRef.current?.close(); // fires "close" -> onClose
  }

  // Tapping the dark backdrop closes the panel. A click "on the dialog itself"
  // can only be the backdrop, because the inner box covers the whole panel.
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      aria-labelledby={`${baseId}-title`}
      // PHONES: a "bottom sheet": full width, stuck to the bottom (mb-0 mt-auto),
      //   rounded top corners, at most 90% of the screen tall.
      // COMPUTERS ("sm:" 640px+): a centred box (m-auto), max 32rem wide.
      // backdrop: = the dark see-through layer behind the panel.
      className="mx-0 mt-auto mb-0 w-full max-w-full rounded-t-2xl bg-white p-0 text-ink shadow-xl backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[90dvh] flex-col">
        {/* ---- Header: name + close button ---- */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 p-4">
          <div>
            <h2 id={`${baseId}-title`} className="text-xl font-bold">
              {item.name}
            </h2>
            {item.description && <p className="text-sm text-stone-600">{item.description}</p>}
            {/* SAF-2 (Step 40a): ingredients, when filled in */}
            {item.ingredients && (
              <p className="mt-1 text-xs text-stone-700">
                <span className="font-semibold">Ingredients: </span>
                {item.ingredients}
              </p>
            )}
            {/* SAF-2: allergens shown again right before ordering */}
            <p className="mt-1 text-xs text-stone-700">
              <span className="font-semibold">Allergens: </span>
              {allergenText(item)}
            </p>
            {/* FR-01: made-to-order items need at least 15 minutes for pickup */}
            {item.isMadeToOrder && (
              <p className="mt-1 text-xs font-semibold text-amber-900">
                Made to order: ready in at least 15 minutes.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-2xl text-stone-500 hover:bg-stone-100"
          >
            ×
          </button>
        </div>

        {/* ---- Body: scrolls on its own if the panel is taller than the screen ---- */}
        <div className="flex flex-col gap-5 overflow-y-auto overscroll-contain p-4">
          {/* SIZE: radio buttons = choose exactly one.
              <fieldset> + <legend> group them, so screen readers say
              "Choose a size, group". */}
          <fieldset>
            <legend className="mb-2 font-semibold">
              Choose a size <span className="text-sm font-normal text-stone-500">(required)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {item.priceOptions.map((option) => {
                const id = `${baseId}-size-${option.size}`;
                return (
                  // The whole box is the <label>, so it's one big tap target.
                  // has-[:checked]: = "style me differently when my radio is chosen".
                  <label
                    key={option.size}
                    htmlFor={id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 has-[:checked]:border-brand has-[:checked]:bg-orange-50"
                  >
                    <input
                      id={id}
                      type="radio"
                      name={`${baseId}-size`}
                      checked={size === option.size}
                      onChange={() => setSize(option.size)}
                      className="accent-brand"
                    />
                    <span>{option.size}</span>
                    <span className="font-bold">{formatPrice(option.price)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* EXTRAS: tick boxes, grouped into Sides and Sauces (FR-02).
              If the extras couldn't load, this simply doesn't appear. */}
          {groups.map((group) => (
            <fieldset key={group.title}>
              <legend className="mb-2 font-semibold">
                {group.title} <span className="text-sm font-normal text-stone-500">(optional)</span>
              </legend>
              <div className="flex flex-col gap-1">
                {group.extras.map((extra) => {
                  const id = `${baseId}-extra-${extra.id}`;
                  return (
                    <label
                      key={extra.id}
                      htmlFor={id}
                      className={`flex min-h-11 items-center gap-3 rounded-lg px-2 ${
                        extra.isAvailable
                          ? "cursor-pointer hover:bg-stone-50"
                          : "cursor-not-allowed opacity-50" // unavailable: greyed out
                      }`}
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={extraIds.includes(extra.id)}
                        disabled={!extra.isAvailable}
                        onChange={() => toggleExtra(extra.id)}
                        className="size-5 accent-brand"
                      />
                      <span className="flex-1">{extra.name}</span>
                      <span className="text-sm font-semibold">
                        {extra.isAvailable ? formatExtraPrice(extra.extraPrice) : "Unavailable"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {/* MEAL NOTE (FR-02): optional, at most 200 characters.
              maxLength stops typing at the limit; the counter shows how many are used.
              text-base (16px) stops iPhones zooming in on the box. */}
          <div>
            <label htmlFor={`${baseId}-note`} className="mb-2 block font-semibold">
              Meal note <span className="text-sm font-normal text-stone-500">(optional)</span>
            </label>
            <textarea
              id={`${baseId}-note`}
              aria-describedby={`${baseId}-note-count`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={MAX_NOTE_LENGTH}
              rows={2}
              placeholder="e.g. no pepper, gravy on the side"
              className="w-full rounded-lg border border-stone-300 p-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <p id={`${baseId}-note-count`} className="text-right text-xs text-stone-500">
              {note.length}/{MAX_NOTE_LENGTH}
            </p>
          </div>
        </div>

        {/* ---- Footer: quantity + Add button (always visible at the bottom) ---- */}
        <div className="border-t border-stone-100 p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* QUANTITY: 1 to 10 (decision), shared with the cart page. */}
            <QuantityStepper value={quantity} onChange={setQuantity} />

            {/* Disabled until a size is chosen. Shows the live line price. */}
            <button
              type="submit"
              disabled={linePrice === null}
              className="min-h-12 flex-1 rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {linePrice === null ? "Choose a size" : `Add to cart · ${formatPrice(linePrice)}`}
            </button>
          </div>

          {/* HINT: the price is (size + extras) × quantity, so with quantity 2,
              each of the 2 meals gets the ticked extras. Saying it here avoids
              surprise at the total. Only shown when there are extras to tick. */}
          {groups.length > 0 && (
            <p className="mt-2 text-xs text-stone-500">Extras are added to each meal.</p>
          )}
        </div>
      </form>
    </dialog>
  );
}
