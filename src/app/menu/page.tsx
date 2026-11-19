/*
 * src/app/menu/page.tsx   ->   http://localhost:3000/menu
 *
 * WHAT: The Menu page. Shows every menu item, grouped by category (FR-01).
 * LAYER: Presentation. For now it reads SAMPLE data from src/lib/sample-menu.ts.
 *        In Build step 2 it will read the real items from Supabase instead.
 *
 * In Next.js the folder name becomes the web address: app/menu/page.tsx = "/menu".
 */

import MenuItemCard from "@/components/MenuItemCard";
import { MENU_CATEGORIES, SAMPLE_MENU_ITEMS } from "@/lib/sample-menu";

/*
 * MenuPage
 * Layout:
 *  1. A row of category buttons (Meals / Sides / Drinks). These are plain links to
 *     "#meals" etc., so tapping one scrolls down to that section. No JavaScript
 *     is needed, which keeps the page fast (PR-1: menu loads within 3 s).
 *  2. One section per category, each with a grid of cards.
 *     Mobile-first: "grid-cols-1" = one column on phones. "sm:grid-cols-2" and
 *     "lg:grid-cols-3" add more columns on bigger screens.
 */
export default function MenuPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-12">
      <h1 className="pt-6 text-3xl font-extrabold">Menu</h1>
      <p className="mt-1 text-sm text-stone-600">
        Sample items for the design preview. Not The Spot&apos;s real menu yet.
      </p>

      {/* Category buttons. "sticky top-14" keeps them visible just under the header. */}
      <nav className="sticky top-14 z-[5] -mx-4 mt-4 flex gap-2 overflow-x-auto bg-cream px-4 py-3">
        {MENU_CATEGORIES.map((category) => (
          <a
            key={category}
            href={`#${category.toLowerCase()}`}
            className="min-h-11 shrink-0 rounded-full border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand hover:text-white"
          >
            {category}
          </a>
        ))}
      </nav>

      {/* One section per category */}
      {MENU_CATEGORIES.map((category) => (
        // scroll-mt-32 stops the sticky header from covering the section title after jumping to it
        <section key={category} id={category.toLowerCase()} className="mt-6 scroll-mt-32">
          <h2 className="mb-3 text-xl font-bold">{category}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SAMPLE_MENU_ITEMS.filter((item) => item.category === category).map((item) => (
              // "key" helps React keep track of each card in the list
              <MenuItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
