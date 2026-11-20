/*
 * src/lib/cart-store.ts
 *
 * WHAT: Keeps the cart in the browser's localStorage and tells React whenever
 *       it changes. Three things React needs (see CartProvider):
 *         subscribeToCart(fn) -> "call fn when the cart changes"
 *         readCart()          -> "what is the cart right now?"
 *         readServerCart()    -> "what should the SERVER draw?" (always empty)
 *       plus writeCart(cart) to save a new cart.
 *
 * LAYER: Application layer (where the cart is stored).
 *
 * WHY localStorage? Decision: the cart lives in the browser for now.
 *   localStorage = a small storage box in the browser, per website. It
 *   survives reloads and closing the tab, but stays on THIS browser/device.
 *
 * SAFETY: every localStorage call is inside try/catch, because the browser can
 * refuse (e.g. some private-browsing modes, or storage full). Then the cart
 * simply lives in memory until the page is closed.
 *
 * Only call these functions in the BROWSER (e.g. from event handlers or
 * React's useSyncExternalStore), never while the server builds a page.
 */

import { parseCart, type CartLine } from "@/lib/cart";

// The name of our box in localStorage. "-v1" lets us change the shape later
// (a "-v2") without old saved carts breaking the page.
const STORAGE_KEY = "the-spot-cart-v1";

// An empty cart that is always the SAME object. React compares snapshots by
// identity ("is it the same object?"), so returning a new [] every time would
// make React think the cart changes constantly.
const EMPTY_CART: CartLine[] = [];

// A remembered copy: the last text we read and the cart we parsed from it.
// readCart() only parses again when the saved text actually changed.
let lastRaw: string | null = null;
let lastCart: CartLine[] = EMPTY_CART;

// Used only if the browser refuses localStorage: the cart lives here instead.
let memoryOnly = false;

// The functions React asked us to call when the cart changes.
const listeners = new Set<() => void>();

/* readCart() -> the current cart (the same object if nothing changed). */
export function readCart(): CartLine[] {
  if (memoryOnly) return lastCart;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return lastCart; // storage refused: keep what we have
  }

  if (raw !== lastRaw) {
    lastRaw = raw;
    const parsed = parseCart(raw);
    lastCart = parsed.length === 0 ? EMPTY_CART : parsed;
  }
  return lastCart;
}

/* readServerCart() -> always empty: the server can't see the browser's storage. */
export function readServerCart(): CartLine[] {
  return EMPTY_CART;
}

/*
 * writeCart(cart): save the cart and tell everyone listening.
 * (The browser's "storage" event only reaches OTHER tabs, so for this tab we
 * call the listeners ourselves.)
 */
export function writeCart(cart: CartLine[]): void {
  const raw = cart.length === 0 ? null : JSON.stringify(cart);
  try {
    if (raw === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    memoryOnly = true; // storage refused: fall back to memory
  }
  lastRaw = raw;
  lastCart = cart.length === 0 ? EMPTY_CART : cart;
  listeners.forEach((listener) => listener());
}

/*
 * subscribeToCart(listener) -> a function that stops listening.
 * Also listens to the browser's "storage" event, which fires when ANOTHER tab
 * of our site changes localStorage. That's how adding an item in one tab
 * updates the cart count in the other tab.
 */
export function subscribeToCart(listener: () => void): () => void {
  listeners.add(listener);

  function onStorage(event: StorageEvent) {
    // event.key is null when all storage was cleared.
    if (event.key === STORAGE_KEY || event.key === null) listener();
  }
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
