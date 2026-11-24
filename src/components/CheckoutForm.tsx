/*
 * src/components/CheckoutForm.tsx
 *
 * WHAT: The checkout form. The customer chooses:
 *         1. Pickup or Delivery (and, for delivery, where),
 *         2. When ("As soon as possible" or a time later today),
 *         3. How to pay (Lynk or Cash),
 *       and sees their order and the full total.
 *
 * LAYER: Presentation. The time rules come from src/lib/order-rules.ts and the
 *        money maths from src/lib/cart.ts (Application layer). The SERVER
 *        re-checks everything when the order is placed (Part 21).
 *
 * WHY:
 *   - FR-01: pickup/delivery, delivery locations only, lead times, hours.
 *   - FR-02: total = items + customizations + delivery fee; Lynk or Cash.
 *   - FR-04: the driver needs the customer's phone, so it's shown here.
 *   - Usability: the last step of Menu -> Cart -> Checkout.
 *
 * PART 20 ONLY: "Place order" is not connected yet (Part 21).
 *
 * "use client" = it runs in the browser: the cart lives there, and the form
 * reacts to every choice.
 */
"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { useIsBrowser, useNow } from "@/lib/browser-hooks";
import { cartSubtotal, describeLine, lineTotal } from "@/lib/cart";
import { formatPrice } from "@/lib/menu-helpers";
import {
  canOrderToday,
  earliestReadyTime,
  formatJamaicaTime,
  leadTimeMinutes,
  timeSlots,
  type Fulfilment,
  type OpeningHours,
} from "@/lib/order-rules";
import { formatDeliveryFee, OPENING_HOURS, type DeliveryLocation } from "@/lib/store-info";

type PaymentMethod = "LYNK" | "CASH";

type Props = {
  customerName: string;
  phone: string | null;
  locations: DeliveryLocation[]; // active delivery locations (FR-01)
  madeToOrderItemIds: number[]; // menu items that need 15 min for pickup (fries)
  hours: OpeningHours; // FR-01 hours from the server (or "all day" when testing)
  isTestHours: boolean; // true = test setting on: show the TEST MODE banner
};

// Shared look for the big choice boxes (radio buttons inside a label).
// has-[:checked]: = "style me differently when my radio is chosen".
const choiceClass =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-stone-300 bg-white p-3 has-[:checked]:border-brand has-[:checked]:bg-orange-50";

export default function CheckoutForm({
  customerName,
  phone,
  locations,
  madeToOrderItemIds,
  hours,
  isTestHours,
}: Props) {
  const isBrowser = useIsBrowser();
  const now = useNow();
  const { lines } = useCart();

  // ---- The customer's choices -------------------------------------------------
  // Nothing pre-chosen for pickup/delivery and payment, so nobody orders the
  // wrong way by accident. "As soon as possible" IS pre-chosen: most people want it.
  const [fulfilment, setFulfilment] = useState<Fulfilment | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [timeChoice, setTimeChoice] = useState<"ASAP" | "LATER">("ASAP");
  const [slot, setSlot] = useState<number | null>(null);
  const [payment, setPayment] = useState<PaymentMethod | null>(null);

  // 1. Not in the browser yet: grey placeholder (the cart and clock live here).
  if (!isBrowser || now === 0) {
    return (
      <div className="mt-6 flex flex-col gap-4" aria-hidden="true">
        <div className="h-40 animate-pulse rounded-xl bg-stone-200" />
        <div className="h-40 animate-pulse rounded-xl bg-stone-200" />
      </div>
    );
  }

  // 2. Empty cart: nothing to check out.
  if (lines.length === 0) {
    return (
      <div className="mt-6 rounded-xl bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-semibold">Your cart is empty.</p>
        <Link
          href="/menu"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
        >
          Back to the menu
        </Link>
      </div>
    );
  }

  // ---- Working things out from the choices -------------------------------------
  // FR-01: does the cart contain a made-to-order item (fries)?
  const hasMadeToOrder = lines.some((line) => madeToOrderItemIds.includes(line.itemId));

  // FR-01 lead time for the chosen way (pickup shown until they choose).
  const lead = leadTimeMinutes(fulfilment ?? "PICKUP", hasMadeToOrder);
  // `hours` comes from the server: the real 11:00-7:00, or "all day" in test mode.
  const openToday = canOrderToday(now, lead, hours);
  const earliest = earliestReadyTime(now, lead, hours);
  const slots = timeSlots(now, lead, hours);
  // If the chosen slot is no longer allowed (time moved on, or they switched to
  // delivery, which needs longer), treat it as not chosen.
  const chosenSlot = slot !== null && slots.includes(slot) ? slot : null;

  const location = locations.find((l) => l.id === locationId) ?? null;

  // FR-02: total = items + customizations + delivery fee (delivery only).
  // Added in whole cents, so it's exact.
  const subtotal = cartSubtotal(lines);
  const deliveryFee = fulfilment === "DELIVERY" && location ? location.deliveryFee : 0;
  const total = (Math.round(subtotal * 100) + Math.round(deliveryFee * 100)) / 100;

  // What's still missing before the order could be placed (shown as a list).
  const missing: string[] = [];
  if (!fulfilment) missing.push("Choose pickup or delivery.");
  if (fulfilment === "DELIVERY" && !location) missing.push("Choose where to deliver.");
  if (timeChoice === "LATER" && chosenSlot === null) missing.push("Choose a time.");
  if (!payment) missing.push("Choose how to pay.");

  return (
    // PHONES: everything stacked. WIDE SCREENS: choices left, summary right.
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
      <div className="flex flex-col gap-6 lg:col-span-2">
        {/* TEST ONLY: loud warning while opening hours are ignored, so nobody
            thinks the real site accepts orders at night. Never shown on the
            live site (see src/lib/test-settings.ts). */}
        {isTestHours && (
          <p
            role="status"
            className="rounded-xl border-2 border-amber-500 bg-amber-100 p-3 text-sm font-semibold text-amber-950"
          >
            TEST MODE: opening hours are ignored (open all day). This only works with
            `npm run dev` on your own computer.
          </p>
        )}

        {/* ---- Contact (FR-04: the driver needs the phone number) ---- */}
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Your details</h2>
          <p className="mt-2">{customerName}</p>
          {phone ? (
            <p className="text-sm text-stone-600">Phone: {phone}</p>
          ) : (
            <p className="mt-1 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
              We don&apos;t have a phone number for you. Delivery drivers need one to reach you.
            </p>
          )}
        </section>

        {/* ---- 1. Pickup or delivery (FR-01) ---- */}
        <fieldset className="rounded-xl bg-white p-5 shadow-sm">
          <legend className="sr-only">Pickup or delivery</legend>
          <h2 className="text-lg font-bold" aria-hidden="true">
            1. Pickup or delivery
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={choiceClass}>
              <input
                type="radio"
                name="fulfilment"
                checked={fulfilment === "PICKUP"}
                onChange={() => setFulfilment("PICKUP")}
                className="size-5 accent-brand"
              />
              <span>
                <span className="block font-semibold">Pickup</span>
                <span className="text-sm text-stone-600">At the counter. No delivery fee.</span>
              </span>
            </label>
            <label className={`${choiceClass} ${locations.length === 0 ? "opacity-50" : ""}`}>
              <input
                type="radio"
                name="fulfilment"
                checked={fulfilment === "DELIVERY"}
                onChange={() => setFulfilment("DELIVERY")}
                disabled={locations.length === 0}
                className="size-5 accent-brand"
              />
              <span>
                <span className="block font-semibold">Delivery</span>
                <span className="text-sm text-stone-600">
                  {locations.length > 0
                    ? "To campus. At least 20 minutes."
                    : "Not available right now."}
                </span>
              </span>
            </label>
          </div>

          {/* FR-01: delivery ONLY to the active locations, each with its fee. */}
          {fulfilment === "DELIVERY" && (
            <fieldset className="mt-4">
              <legend className="mb-2 font-semibold">Deliver to</legend>
              <div className="flex flex-col gap-2">
                {locations.map((l) => (
                  <label key={l.id} className={choiceClass}>
                    <input
                      type="radio"
                      name="location"
                      checked={locationId === l.id}
                      onChange={() => setLocationId(l.id)}
                      className="size-5 accent-brand"
                    />
                    <span className="flex-1 font-semibold">{l.name}</span>
                    {/* "(sample, not final)" until the Manager confirms the fee */}
                    <span className="text-sm text-stone-600">{formatDeliveryFee(l)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </fieldset>

        {/* ---- 2. When (FR-01: hours + lead times, Jamaica time) ---- */}
        <fieldset className="rounded-xl bg-white p-5 shadow-sm">
          <legend className="sr-only">When</legend>
          <h2 className="text-lg font-bold" aria-hidden="true">
            2. When
          </h2>

          {!openToday ? (
            // After the last possible time today: same-day only (decision).
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Sorry, we&apos;re closed for {fulfilment === "DELIVERY" ? "delivery" : "orders"} today.
              We&apos;re open {OPENING_HOURS}.
            </p>
          ) : (
            <>
              {/* Explain WHY the earliest time is what it is (FR-01 lead times). */}
              <p className="mt-1 text-sm text-stone-600">
                {fulfilment === "DELIVERY"
                  ? "Delivery needs at least 20 minutes."
                  : hasMadeToOrder
                    ? "Your order has made-to-order items (fries), so it needs at least 15 minutes."
                    : "Pickup orders can be ready straight away."}
              </p>

              <div className="mt-3 flex flex-col gap-2">
                <label className={choiceClass}>
                  <input
                    type="radio"
                    name="time"
                    checked={timeChoice === "ASAP"}
                    onChange={() => setTimeChoice("ASAP")}
                    className="size-5 accent-brand"
                  />
                  <span>
                    <span className="block font-semibold">As soon as possible</span>
                    <span className="text-sm text-stone-600">
                      About {formatJamaicaTime(earliest)}
                    </span>
                  </span>
                </label>

                <label className={`${choiceClass} ${slots.length === 0 ? "opacity-50" : ""}`}>
                  <input
                    type="radio"
                    name="time"
                    checked={timeChoice === "LATER"}
                    onChange={() => setTimeChoice("LATER")}
                    disabled={slots.length === 0}
                    className="size-5 accent-brand"
                  />
                  <span className="font-semibold">Later today</span>
                </label>

                {timeChoice === "LATER" && slots.length > 0 && (
                  <label className="mt-1 block text-sm font-semibold">
                    Choose a time
                    {/* text-base (16px) stops iPhones zooming in on the box */}
                    <select
                      value={chosenSlot ?? ""}
                      onChange={(event) => setSlot(Number(event.target.value))}
                      className="mt-1 block min-h-12 w-full rounded-lg border border-stone-300 bg-white px-3 text-base"
                    >
                      <option value="" disabled>
                        Pick a time…
                      </option>
                      {slots.map((t) => (
                        <option key={t} value={t}>
                          {formatJamaicaTime(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </>
          )}
        </fieldset>

        {/* ---- 3. Payment (FR-02: Lynk or Cash; never card details) ---- */}
        <fieldset className="rounded-xl bg-white p-5 shadow-sm">
          <legend className="sr-only">Payment</legend>
          <h2 className="text-lg font-bold" aria-hidden="true">
            3. Payment
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            <label className={choiceClass}>
              <input
                type="radio"
                name="payment"
                checked={payment === "LYNK"}
                onChange={() => setPayment("LYNK")}
                className="size-5 accent-brand"
              />
              <span>
                <span className="block font-semibold">Lynk</span>
                <span className="text-sm text-stone-600">
                  You&apos;ll see a QR code after ordering. A supervisor confirms your payment.
                </span>
              </span>
            </label>
            <label className={choiceClass}>
              <input
                type="radio"
                name="payment"
                checked={payment === "CASH"}
                onChange={() => setPayment("CASH")}
                className="size-5 accent-brand"
              />
              <span>
                <span className="block font-semibold">Cash</span>
                <span className="text-sm text-stone-600">
                  {fulfilment === "DELIVERY" ? "Pay the driver." : "Pay at the counter."}
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      </div>

      {/* ---- Summary: the order and the total (FR-02) ---- */}
      <aside className="rounded-xl bg-white p-5 shadow-sm lg:sticky lg:top-20">
        <h2 className="text-lg font-bold">Your order</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {lines.map((line) => (
            <li key={line.lineId} className="flex justify-between gap-3">
              <span className="min-w-0">
                {line.quantity} × {describeLine(line)}
                {line.note && (
                  <span className="block break-words text-xs italic text-stone-500">
                    Note: &quot;{line.note}&quot;
                  </span>
                )}
              </span>
              <span className="shrink-0 font-semibold">{formatPrice(lineTotal(line))}</span>
            </li>
          ))}
        </ul>
        <Link href="/cart" className="mt-2 inline-block text-sm font-semibold text-brand hover:underline">
          Edit cart
        </Link>

        <div className="mt-4 flex flex-col gap-1 border-t border-stone-100 pt-3 text-sm">
          <div className="flex justify-between">
            <span>Items</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Delivery fee</span>
            <span className="text-right">
              {fulfilment === "DELIVERY"
                ? location
                  ? formatDeliveryFee(location)
                  : "Choose a location"
                : formatPrice(0)}
            </span>
          </div>
          {/* aria-live: screen readers hear the new total after each change */}
          <div aria-live="polite" className="mt-1 flex justify-between text-lg font-extrabold">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>

        {/* What's still needed, so the customer knows why they can't order yet. */}
        {missing.length > 0 && openToday && (
          <ul className="mt-3 list-disc pl-5 text-sm text-stone-600">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        {/* PART 20: not connected yet. Part 21 sends the order to the server. */}
        <button
          type="button"
          disabled
          className="mt-4 min-h-12 w-full rounded-xl bg-brand font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          Place order
        </button>
        <p className="mt-2 text-center text-xs text-stone-500">Placing orders comes in Part 21.</p>
      </aside>
    </div>
  );
}
