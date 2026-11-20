/*
 * src/app/cart/page.tsx   ->   http://localhost:3000/cart
 *
 * WHAT: TEMPORARY placeholder for the cart page, so the header's "Cart" link
 *       doesn't lead to a "page not found" error.
 *
 * LAYER: Presentation.
 *
 * PART 17 will replace this with the real cart page: the lines, quantity
 * changes, remove, and the subtotal.
 */

import Link from "next/link";

export default function CartPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-12">
      <h1 className="pt-6 text-3xl font-extrabold">Your cart</h1>
      <p className="mt-4 rounded-xl bg-white p-5 text-stone-700 shadow-sm">
        The cart page is coming in Part 17. Your items are saved; the number next to
        &quot;Cart&quot; in the header shows how many.
      </p>
      <Link
        href="/menu"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
      >
        Back to the menu
      </Link>
    </main>
  );
}
