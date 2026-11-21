/*
 * src/lib/browser-hooks.ts
 *
 * WHAT: Small React hooks for things only the BROWSER knows:
 *         useIsBrowser() -> false on the server, true in the browser
 *         useNextParam() -> the safe ?next=... path from the address
 *                           (uses the Next.js router, not useSyncExternalStore)
 *         useNow()       -> the current time, updated every 30 seconds
 *
 * LAYER: Presentation helpers (used by client components: the cart page and
 *        the checkout page).
 *
 * WHY useSyncExternalStore (React's tool for data that lives outside React)?
 * It lets us give the SERVER one answer and the BROWSER another without a
 * "hydration mismatch" error: the page first appears with the server's answer,
 * then React switches to the browser's answer.
 */

import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { safeNextPath } from "@/lib/auth/safe-next";

const noSubscribe = () => () => {};

/*
 * useIsBrowser(): false while the server builds the page (and during the
 * browser's first "hydration" drawing), true after that.
 * Used to show a grey placeholder instead of a misleading "empty cart" before
 * the browser has read the cart from its storage.
 */
export function useIsBrowser(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
}

/*
 * useNextParam(): the "where to go after logging in" path from the address,
 * e.g. "/checkout" from /login?next=%2Fcheckout. null if there's none, or if
 * it isn't a safe path inside our site (safeNextPath).
 *
 * WHY useSearchParams (Next.js's hook for the ?...=... part of the address)?
 * Two earlier versions failed:
 *   1. The SERVER read ?next= and swapped in a second copy of the form; the
 *      customer could submit the first copy, which had no "next".
 *   2. Reading window.location ONCE. When you tap Checkout, Next.js moves to
 *      /login?next=... WITHOUT reloading the page, and it only changes the
 *      address bar AFTER drawing the new page. So the form read the OLD
 *      address (/cart), found no "next", and never looked again.
 * useSearchParams is part of the Next.js router, so it already knows the NEW
 * address while the page is being drawn, and it updates if the address changes.
 * (The server checks the value again with safeNextPath when the form is sent.)
 * Next.js rule: a component using useSearchParams must sit inside <Suspense>
 * (see the login and sign-up pages).
 */
export function useNextParam(): string | null {
  const searchParams = useSearchParams();
  return safeNextPath(searchParams.get("next"));
}

/*
 * useNow(): the current time (milliseconds), refreshed every 30 seconds.
 * WHY? The checkout page offers times like "12:30 p.m." based on NOW. If the
 * page stays open a while, those must move on by themselves.
 * The value is rounded DOWN to the last 30 seconds, so it stays the SAME
 * number between ticks (React needs that to avoid endless redrawing).
 * The server's answer is 0; pages show a placeholder until they're in the
 * browser anyway. The SERVER re-checks the chosen time when ordering.
 */
const TICK = 30 * 1000;

function subscribeToClock(onTick: () => void) {
  const timer = setInterval(onTick, TICK / 2); // check twice per tick
  return () => clearInterval(timer);
}

export function useNow(): number {
  return useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / TICK) * TICK,
    () => 0
  );
}
