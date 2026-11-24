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
 * PART 21: "Place order" sends the choices to the placeOrder Server Action
 * (src/lib/orders/actions.ts), which checks everything again and saves the
 * order. On success the cart is emptied and the customer goes to the
 * confirmation page /orders/<Order ID> (Part 22).
 *
 * "use client" = it runs in the browser: the cart lives there, and the form
 * reacts to every choice.
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useCart } from "@/components/CartProvider";
import { placeOrder, type PlaceOrderResult } from "@/lib/orders/actions";
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

/*
 * makeRequestId() -> a random id like "3f2a9c1e-8b7d-4e6f-a1b2-c3d4e5f60718"
 * (the "UUID" format the database column client_request_id expects).
 * WHY? If "Place order" is sent twice (double tap, or a retry after a bad
 * connection), both carry the SAME id, and the database returns the first
 * order instead of saving a second one.
 * We build it from crypto.getRandomValues (works on plain http too, e.g.
 * testing on a phone at home), not crypto.randomUUID (https only).
 */
function makeRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // marks it as a "version 4" (random) UUID
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // the standard "variant" bits
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
  const { lines, clearCart } = useCart();
  // The Next.js router: lets code move to another page (Part 22).
  const router = useRouter();

  // ---- The customer's choices -------------------------------------------------
  // Nothing pre-chosen for pickup/delivery and payment, so nobody orders the
  // wrong way by accident. "As soon as possible" IS pre-chosen: most people want it.
  const [fulfilment, setFulfilment] = useState<Fulfilment | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [timeChoice, setTimeChoice] = useState<"ASAP" | "LATER">("ASAP");
  const [slot, setSlot] = useState<number | null>(null);
  const [payment, setPayment] = useState<PaymentMethod | null>(null);

  // ---- Sending the order (Part 21) ---------------------------------------------
  // isPending = true while the server is working: the button shows
  // "Placing order…" and can't be pressed again.
  const [isPending, startTransition] = useTransition();
  // The server's last "no" (error + list of changes), shown above the button.
  const [failure, setFailure] = useState<Extract<PlaceOrderResult, { ok: false }> | null>(null);
  // The new Order ID once the order is saved.
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null);
  // The checkout's request id. useRef = a value React keeps between drawings
  // WITHOUT redrawing when it changes. Made on the first tap and kept for
  // retries, so a repeated tap can never create a second order.
  const requestIdRef = useRef<string | null>(null);
  // true once an order has been placed: the form must start FRESH next time.
  const shouldResetRef = useRef(false);

  /*
   * Start fresh after an order (bug fix).
   * WHY? With our Next.js setting (cacheComponents), leaving a page does NOT
   * remove it: Next.js HIDES it and keeps its state, so the Back button is
   * instant. Without this, coming back to /checkout for a SECOND order still
   * showed "Order #1001 placed".
   * HOW: the function returned from useLayoutEffect ("cleanup") runs when the
   * page is hidden. If an order was placed, we clear every choice and message
   * there, so the next visit shows an empty checkout form.
   * Only AFTER an order: if the customer pops over to the cart mid-checkout,
   * their choices are kept (that's the helpful side of keeping state).
   * useLayoutEffect (not useEffect) so it happens before the page is hidden,
   * with no flash of the old message. (Pattern from the Next.js guide
   * "Preserving UI state".)
   */
  useLayoutEffect(() => {
    return () => {
      if (!shouldResetRef.current) return;
      shouldResetRef.current = false;
      setPlacedOrderId(null);
      setFailure(null);
      setFulfilment(null);
      setLocationId(null);
      setTimeChoice("ASAP");
      setSlot(null);
      setPayment(null);
    };
  }, []);

  // 0. Order saved: a short message for the moment while the confirmation
  //    page opens. Checked BEFORE "empty cart", because the cart was just
  //    emptied and we don't want "Your cart is empty" to flash up.
  if (placedOrderId !== null) {
    return (
      <div role="status" className="mt-6 rounded-xl bg-white p-6 text-center shadow-sm">
        <p className="text-2xl font-extrabold">Order #{placedOrderId} placed</p>
        <p className="mt-2 text-stone-600">Opening your order…</p>
      </div>
    );
  }

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

  const canPlace = openToday && missing.length === 0 && !isPending;

  /*
   * handlePlaceOrder(): send the choices to the server (placeOrder).
   * We send what the customer CHOSE plus the prices the page SHOWED. The server
   * never charges the shown prices: it only compares them, to say what changed.
   * startTransition lets React keep the page responsive while waiting, and
   * gives us isPending.
   */
  function handlePlaceOrder() {
    if (!canPlace || !fulfilment || !payment) return;
    requestIdRef.current ??= makeRequestId(); // "??=" = only if not made yet
    setFailure(null);

    const input = {
      clientRequestId: requestIdRef.current,
      fulfilment,
      deliveryLocationId: fulfilment === "DELIVERY" ? locationId : null,
      shownDeliveryFee: deliveryFee,
      timeChoice,
      requestedTime: timeChoice === "LATER" ? chosenSlot : null,
      paymentMethod: payment,
      lines: lines.map((line) => ({
        itemId: line.itemId,
        name: line.name,
        size: line.size,
        unitPrice: line.unitPrice,
        extras: line.extras,
        note: line.note,
        quantity: line.quantity,
      })),
    };

    startTransition(async () => {
      try {
        const result = await placeOrder(input);
        if (result.ok) {
          // Decision: the cart is cleared after an order is placed.
          clearCart();
          requestIdRef.current = null; // the next order gets a new id
          shouldResetRef.current = true; // start fresh when the customer leaves this page
          setPlacedOrderId(result.orderId);
          // Part 22: go to the confirmation page. "replace" (not "push") swaps
          // the finished checkout out of the browser history, so Back from
          // the confirmation doesn't return to a used-up checkout.
          router.replace(`/orders/${result.orderId}`);
        } else {
          // Nothing was saved, so the same id is safe to reuse for a retry.
          setFailure(result);
        }
      } catch {
        // The request itself failed (e.g. no internet). The order MAY have
        // reached the server, so we keep the same id: a retry can't double it.
        setFailure({ ok: false, error: "We couldn't reach the server. Check your connection and try again." });
      }
    });
  }

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

        {/* The server said no: why, and (decision) EXACTLY what changed.
            role="alert" makes screen readers read it out at once. */}
        {failure && (
          <div role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">
            <p className="font-semibold">{failure.error}</p>
            {failure.changes && (
              <>
                <ul className="mt-2 list-disc pl-5">
                  {failure.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
                <Link href="/cart" className="mt-2 inline-block font-semibold underline">
                  Go to your cart
                </Link>
              </>
            )}
          </div>
        )}

        {/* Part 21: sends the order to the server (placeOrder). */}
        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={!canPlace}
          className="mt-4 min-h-12 w-full rounded-xl bg-brand font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {isPending ? "Placing order…" : "Place order"}
        </button>
      </aside>
    </div>
  );
}
