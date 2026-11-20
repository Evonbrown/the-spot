/*
 * src/app/menu/page.tsx   ->   http://localhost:3000/menu
 *
 * WHAT: The Menu page. Shows every menu item, grouped by category (FR-01).
 * LAYER: Presentation. Gets its data from getMenuItems() (Application layer,
 *        src/lib/menu.ts), which reads the menu_items table (Data layer).
 *
 * In Next.js the folder name becomes the web address: app/menu/page.tsx = "/menu".
 */

import CategoryBar from "@/components/CategoryBar";
import MenuItemCard from "@/components/MenuItemCard";
import { getCategories, getMenuItems, type MenuItem } from "@/lib/menu";

/*
 * MenuPage
 * "async" because it waits for the menu items. It is a Server Component (no
 * "use client"), so the database work happens on the server and the browser
 * only receives the finished HTML (fast on phones: PR-1).
 *
 * Because getMenuItems() is cached ('use cache'), Next.js can build this page
 * ahead of time and refresh it about every minute, instead of on every visit.
 *
 * Layout:
 *  1. The sticky category bar (CategoryBar), which highlights the section
 *     you're looking at.
 *  2. One section per category, each with a grid of cards.
 *     Mobile-first: 1 card per row on phones, 2 on tablets ("sm:"), 3 on
 *     laptops ("lg:") and 4 on wide screens ("xl:", 1280px and up).
 *     The page is allowed to be wider than other pages (max-w-7xl = 1280px)
 *     so that 4 cards per row aren't squashed.
 */
export default async function MenuPage() {
  // Try to load the menu. If it fails, items stays null and we show a message
  // below instead of crashing the whole page.
  let items: MenuItem[] | null = null;
  try {
    items = await getMenuItems();
  } catch {
    items = null;
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-12">
      <h1 className="pt-6 text-3xl font-extrabold">Menu</h1>
      <p className="mt-1 text-sm text-stone-600">Prices in J$.</p>

      {items === null ? (
        // The database could not be reached.
        <MenuMessage text="Sorry, the menu couldn't load. Please refresh the page to try again." />
      ) : items.length === 0 ? (
        // The table is empty (e.g. before the Manager adds items).
        <MenuMessage text="There are no menu items yet. Please check back soon." />
      ) : (
        <MenuSections items={items} />
      )}
    </main>
  );
}

/*
 * MenuSections
 * The category buttons + one section per category.
 * Categories come FROM THE DATA (getCategories), so a new category added by the
 * Manager gets its own button and section automatically.
 */
function MenuSections({ items }: { items: MenuItem[] }) {
  const categories = getCategories(items);

  // Turns a category into a safe value for a link, e.g. "Pork & Beef" -> "pork-and-beef"
  // (used as "#pork-and-beef"). Steps: lower case, "&" becomes "and", then every
  // run of characters that isn't a letter or digit becomes one "-".
  const toId = (category: string) =>
    category
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  return (
    <>
      {/* The sticky category bar. It runs in the browser (it reacts to
          scrolling), so we hand it the names and section ids it needs. */}
      <CategoryBar categories={categories.map((name) => ({ name, id: toId(name) }))} />

      {/* One section per category */}
      {categories.map((category) => (
        // scroll-mt-32 stops the sticky header from covering the section title after jumping to it
        <section key={category} id={toId(category)} className="mt-6 scroll-mt-32">
          <h2 className="mb-3 text-xl font-bold">{category}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items
              .filter((item) => item.category === category)
              .map((item) => (
                // "key" helps React keep track of each card in the list
                <MenuItemCard key={item.id} item={item} />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

/*
 * MenuMessage
 * A simple box for "couldn't load" / "no items yet" messages.
 */
function MenuMessage({ text }: { text: string }) {
  return (
    <p className="mt-6 rounded-xl bg-white p-5 text-center text-stone-700 shadow-sm">{text}</p>
  );
}
