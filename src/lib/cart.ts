/*
 * src/lib/cart.ts
 *
 * WHAT: The cart's DATA SHAPE (CartLine) and small "pure" functions that work
 *       on a cart: add or merge a line, count items, read a saved cart safely.
 *       ("Pure" = they only take values in and give values back. They don't
 *       touch the browser or React, which makes them easy to test and explain.)
 *
 * LAYER: Application layer (cart rules), used by the Presentation layer.
 *
 * WHY: FR-02 (customizations, meal notes, total) and the usability goal
 *      Menu -> Cart -> Checkout. Decision: the cart lives in the browser for
 *      now; the SERVER re-checks every price and availability at checkout
 *      (Build step 3), because anything stored in a browser can be edited by
 *      its user.
 *
 * Browser-safe: no server-only code here (see menu-helpers.ts for why).
 */

import { calculateLinePrice, MAX_NOTE_LENGTH, MAX_QUANTITY, type Size } from "@/lib/menu-helpers";

/* One ticked extra, as remembered in the cart (a copy of name and price). */
export type CartExtra = {
  id: number;
  name: string;
  extraPrice: number;
};

/*
 * CartLine: one line in the cart, e.g. "2 × Fry Chicken (Large) + Coleslaw".
 *   lineId    = a random id for this line (used to change/remove it in Part 17)
 *   itemId    = which menu item (menu_items.id)
 *   name, size, unitPrice, extras = COPIES taken when it was added, so the cart
 *               can be shown without asking the database. NOT trusted for
 *               payment: the server re-checks them at checkout (step 3).
 *   size      = null for single-price items (e.g. Pepsi)
 *   note      = the meal note ("" if none), at most 200 characters
 *   quantity  = 1 to 10 (decision)
 */
export type CartLine = {
  lineId: string;
  itemId: number;
  name: string;
  size: Size | null;
  unitPrice: number;
  extras: CartExtra[];
  note: string;
  quantity: number;
};

/* A new line before it has a lineId (what the Add buttons hand over). */
export type NewCartLine = Omit<CartLine, "lineId">;

/*
 * sameChoice(a, b) -> true if two lines are EXACTLY the same choice:
 * same item, same size, same extras (in any order) and same note.
 * Decision: adding the same choice again raises that line's quantity instead
 * of creating a second, identical line.
 */
export function sameChoice(a: NewCartLine, b: NewCartLine): boolean {
  const extraIds = (line: NewCartLine) =>
    line.extras
      .map((extra) => extra.id)
      .sort((x, y) => x - y)
      .join(",");
  return (
    a.itemId === b.itemId &&
    a.size === b.size &&
    a.note === b.note &&
    extraIds(a) === extraIds(b)
  );
}

/*
 * addLine(cart, newLine) -> { cart, capped }
 * Returns a NEW cart (the old one is not changed) with the line added:
 *   - same choice already in the cart -> its quantity goes up, but never above
 *     10 ("capped" = true if we had to stop at 10);
 *   - otherwise -> a new line at the end, with a fresh lineId.
 * WHY return a new cart instead of changing the old one? React only notices a
 * change when it gets a NEW value, so "make a copy with the change" is the
 * normal React way.
 */
export function addLine(
  cart: CartLine[],
  newLine: NewCartLine
): { cart: CartLine[]; capped: boolean } {
  const existing = cart.find((line) => sameChoice(line, newLine));

  if (existing) {
    const wanted = existing.quantity + newLine.quantity;
    const quantity = Math.min(MAX_QUANTITY, wanted);
    return {
      cart: cart.map((line) => (line === existing ? { ...line, quantity } : line)),
      capped: wanted > MAX_QUANTITY,
    };
  }

  const quantity = Math.min(MAX_QUANTITY, newLine.quantity);
  return {
    cart: [...cart, { ...newLine, quantity, lineId: makeLineId() }],
    capped: newLine.quantity > MAX_QUANTITY,
  };
}

/*
 * makeLineId() -> a random id like "m3k9x2a7b1c4".
 * (We don't use crypto.randomUUID() because some browsers only allow it on
 * https pages, and testing on a phone over the home network uses plain http.)
 */
function makeLineId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* cartCount(cart) -> total number of items, e.g. 2 Fry Chicken + 1 Pepsi = 3. */
export function cartCount(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.quantity, 0);
}

/* lineTotal(line) -> (unit price + extras) × quantity, via the shared function. */
export function lineTotal(line: CartLine): number {
  return calculateLinePrice(line.unitPrice, line.extras, line.quantity);
}

/*
 * describeLine(line) -> "Fry Chicken (Large) + Coleslaw (Sample)"
 * Used in messages (and later on the cart page).
 */
export function describeLine(line: NewCartLine): string {
  const size = line.size ? ` (${line.size})` : "";
  const extras = line.extras.length ? ` + ${line.extras.map((e) => e.name).join(", ")}` : "";
  return `${line.name}${size}${extras}`;
}

/*
 * parseCart(raw) -> a cart read SAFELY from saved text.
 * The saved cart is text in the browser's storage, and anyone can edit it
 * (DevTools) or it could be damaged. So:
 *   - not valid JSON, or not a list -> empty cart (no crash);
 *   - any line that doesn't look exactly right is dropped.
 * This protects the PAGE from crashing. It is NOT the price check: the server
 * still re-checks prices at checkout.
 */
export function parseCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isValidLine) : [];
  } catch {
    return [];
  }
}

/* isValidLine(value) -> true only if value has every CartLine field, correctly typed. */
function isValidLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  const isMoney = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  return (
    typeof line.lineId === "string" &&
    typeof line.itemId === "number" &&
    typeof line.name === "string" &&
    (line.size === null || line.size === "Small" || line.size === "Medium" || line.size === "Large") &&
    isMoney(line.unitPrice) &&
    Array.isArray(line.extras) &&
    line.extras.every(
      (extra: unknown) =>
        typeof extra === "object" &&
        extra !== null &&
        typeof (extra as CartExtra).id === "number" &&
        typeof (extra as CartExtra).name === "string" &&
        isMoney((extra as CartExtra).extraPrice)
    ) &&
    typeof line.note === "string" &&
    line.note.length <= MAX_NOTE_LENGTH &&
    Number.isInteger(line.quantity) &&
    (line.quantity as number) >= 1 &&
    (line.quantity as number) <= MAX_QUANTITY
  );
}
