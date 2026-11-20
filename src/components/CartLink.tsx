/*
 * src/components/CartLink.tsx
 *
 * WHAT: The "Cart" link in the header, with a small bubble showing how many
 *       items are in the cart (e.g. 3). Links to the cart page (/cart).
 *
 * LAYER: Presentation.
 *
 * WHY: Usability (Menu -> Cart -> Checkout): customers always see what's in
 *      their cart and can get to it in one tap.
 *      Decision: shown to visitors and customers only. Staff don't order
 *      through the app (SiteHeader decides who gets this link).
 *
 * "use client" = it reads the cart, which lives in the browser.
 * The count is 0 in the server's HTML and appears a moment later in the
 * browser (see CartProvider: "hydration").
 */
"use client";

import Link from "next/link";
import { useCart } from "@/components/CartProvider";

export default function CartLink({ className }: { className: string }) {
  const { count } = useCart();

  return (
    <Link
      href="/cart"
      // Screen readers hear "Cart, 3 items" instead of "Cart 3".
      aria-label={count === 0 ? "Cart, empty" : `Cart, ${count} ${count === 1 ? "item" : "items"}`}
      className={`${className} flex items-center gap-1`}
    >
      Cart
      {count > 0 && (
        // The bubble: white circle with the number in our brand colour.
        <span className="min-w-5 rounded-full bg-white px-1.5 text-center text-xs font-bold leading-5 text-brand">
          {count}
        </span>
      )}
    </Link>
  );
}
