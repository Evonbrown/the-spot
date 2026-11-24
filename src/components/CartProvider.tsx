/*
 * src/components/CartProvider.tsx
 *
 * WHAT: Shares ONE cart with every component on the site (header count, Add
 *       buttons, and the cart page), and shows the short "Added to cart" /
 *       "Removed" messages at the bottom of the screen.
 *
 * LAYER: Presentation (it connects the screen to the cart rules in cart.ts and
 *        the storage in cart-store.ts).
 *
 * WHY "Context"? Many components, far apart on the page, need the same cart.
 * Passing it down through every component as a prop would be messy. React
 * Context is like a noticeboard: CartProvider pins the cart up once (around
 * the whole site, in layout.tsx), and any component can read it with useCart().
 *
 * "use client" = it runs in the browser (the cart is in the browser's storage).
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  addLine,
  cartCount,
  describeLine,
  removeLine,
  setLineQuantity,
  type CartLine,
  type NewCartLine,
} from "@/lib/cart";
import { readCart, readServerCart, subscribeToCart, writeCart } from "@/lib/cart-store";
import type { MenuItem } from "@/lib/menu-helpers";

/* What useCart() gives a component. */
type CartContextValue = {
  lines: CartLine[];
  count: number; // total quantity, e.g. 3
  addToCart: (line: NewCartLine) => void; // food (from the options panel)
  addSingleItem: (item: MenuItem) => void; // one-tap Add for single-price items (drinks)
  changeQuantity: (lineId: string, quantity: number) => void; // cart page: − / +
  removeFromCart: (lineId: string) => void; // cart page: Remove button
  clearCart: () => void; // used on log out (decision: shared campus computers)
};

// The noticeboard itself. null = "no CartProvider around this component".
const CartContext = createContext<CartContextValue | null>(null);

/*
 * useCart(): read the shared cart from any component inside CartProvider.
 * Example:  const { count } = useCart();
 */
export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart() must be used inside <CartProvider>.");
  return value;
}

export default function CartProvider({ children }: { children: ReactNode }) {
  /*
   * useSyncExternalStore = React's built-in way to read data that lives
   * OUTSIDE React (here: localStorage). We give it three functions:
   *   subscribeToCart -> how to hear about changes
   *   readCart        -> how to read the cart in the browser
   *   readServerCart  -> what to use on the server: always EMPTY, because the
   *                      server can't see the browser's storage.
   * HYDRATION: the page first appears with the server's version (empty cart),
   * then React swaps in the real cart. Doing it this way avoids a "hydration
   * mismatch" error (the server's HTML and the browser's first drawing must
   * match).
   */
  const lines = useSyncExternalStore(subscribeToCart, readCart, readServerCart);

  // The short confirmation message at the bottom of the screen.
  const [message, setMessage] = useState<string | null>(null);

  // Hide the message after 5 seconds. The clean-up cancels the timer if a new
  // message arrives first (so the new one gets its full 5 seconds).
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  /*
   * addToCart(line): add a line (or raise the quantity of the same choice).
   * We read the LATEST cart from storage (not the "lines" from the last
   * drawing), so two quick taps can't overwrite each other.
   */
  const addToCart = useCallback((newLine: NewCartLine) => {
    const result = addLine(readCart(), newLine);
    writeCart(result.cart);
    setMessage(
      result.capped
        ? `${describeLine(newLine)}: you can have at most 10 in your cart.`
        : `Added to cart: ${newLine.quantity} × ${describeLine(newLine)}`
    );
  }, []);

  // addSingleItem(item): one-tap Add for a single-price item (e.g. Pepsi):
  // quantity 1, no size, no extras, no note.
  const addSingleItem = useCallback(
    (item: MenuItem) => {
      // FR-01: unavailable items (or items missing a price) cannot be added.
      if (!item.isAvailable || item.priceOptions.length === 0) return;
      addToCart({
        itemId: item.id,
        name: item.name,
        size: null,
        unitPrice: item.priceOptions[0].price,
        extras: [],
        note: "",
        quantity: 1,
      });
    },
    [addToCart]
  );

  // changeQuantity(lineId, n): the cart page's − / + buttons (kept to 1-10).
  const changeQuantity = useCallback((lineId: string, quantity: number) => {
    writeCart(setLineQuantity(readCart(), lineId, quantity));
  }, []);

  // removeFromCart(lineId): the cart page's Remove button, with a message so
  // the customer knows it worked (especially screen reader users).
  const removeFromCart = useCallback((lineId: string) => {
    const cart = readCart();
    const line = cart.find((l) => l.lineId === lineId);
    writeCart(removeLine(cart, lineId));
    if (line) setMessage(`Removed ${describeLine(line)}`);
  }, []);

  // clearCart(): empty the cart (decision: when someone logs out).
  const clearCart = useCallback(() => writeCart([]), []);

  // useMemo: only build a new value object when something in it changed, so
  // components using useCart() don't redraw for no reason.
  const value = useMemo(
    () => ({
      lines,
      count: cartCount(lines),
      addToCart,
      addSingleItem,
      changeQuantity,
      removeFromCart,
      clearCart,
    }),
    [lines, addToCart, addSingleItem, changeQuantity, removeFromCart, clearCart]
  );

  return (
    <CartContext.Provider value={value}>
      {children}

      {/* The confirmation message ("toast"). role="status" makes screen
          readers read it out. Only one message at a time, for the whole site. */}
      {message && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-lg rounded-xl bg-ink p-4 text-sm text-white shadow-lg"
        >
          {message}
        </div>
      )}
    </CartContext.Provider>
  );
}
