/*
 * src/app/menu/page.tsx   ->   http://localhost:3000/menu
 *
 * WHAT: The Menu page. Loads every menu item and hands them to MenuBrowser,
 *       which shows the search box, category bar and sections (FR-01).
 * LAYER: Presentation. Gets its data from getMenuItems() (Application layer,
 *        src/lib/menu.ts), which reads the menu_items table (Data layer).
 *
 * In Next.js the folder name becomes the web address: app/menu/page.tsx = "/menu".
 */

import MenuBrowser from "@/components/MenuBrowser";
import { getCustomizations } from "@/lib/customizations";
import { getMenuItems } from "@/lib/menu";
import type { Customization, MenuItem } from "@/lib/menu-helpers";

/*
 * MenuPage
 * "async" because it waits for the menu items. It is a Server Component (no
 * "use client"), so the database work happens on the server. Because
 * getMenuItems() is cached ('use cache'), Next.js can build this page ahead of
 * time and refresh it about every minute, instead of on every visit (PR-1).
 *
 * SPLIT OF WORK:
 *   - Server (this file): load the items and extras, handle "couldn't load" / "empty".
 *   - Browser (MenuBrowser): search, category highlight. It receives the items
 *     as a prop, so it never talks to the database itself.
 *
 * The page may be wider than other pages (max-w-7xl = 1280px) so that 4 food
 * cards per row aren't squashed on wide screens.
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

  // Load the extras for the options panel (FR-02). If they fail to load, use an
  // empty list: the panel then simply shows no extras, and food can still be
  // ordered. (Better than hiding the whole menu because of the extras.)
  let customizations: Customization[] = [];
  try {
    customizations = await getCustomizations();
  } catch {
    customizations = [];
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
        <MenuBrowser items={items} customizations={customizations} />
      )}
    </main>
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
