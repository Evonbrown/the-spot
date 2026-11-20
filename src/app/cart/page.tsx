/*
 * src/app/cart/page.tsx   ->   http://localhost:3000/cart
 *
 * WHAT: The cart page: the page title, plus CartView, which shows the cart's
 *       lines, quantity changes, Remove, and the subtotal (FR-02).
 *
 * LAYER: Presentation.
 *
 * WHY so short? The cart lives in the BROWSER (decision), so everything that
 * reads it is in CartView, a client component. This server part only draws
 * the frame of the page, which Next.js can send instantly.
 *
 * Open to everyone: browsing and filling a cart needs no account (decision).
 * Logging in is required at checkout (Build step 3).
 */

import type { Metadata } from "next";
import CartView from "@/components/CartView";

// The text in the browser tab: "Your cart".
export const metadata: Metadata = {
  title: "Your cart",
};

export default function CartPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-12">
      <h1 className="pt-6 text-3xl font-extrabold">Your cart</h1>
      <CartView />
    </main>
  );
}
