/*
 * src/app/page.tsx   ->   http://localhost:3000/
 *
 * WHAT: The Home page of The Spot: welcome message, opening hours,
 *       pickup/delivery info, today's specials and a "View menu" button.
 * LAYER: Presentation. The specials come from getMenuItems() (Application
 *        layer, src/lib/menu.ts), which reads the menu_items table (Data layer).
 */

import Link from "next/link";
import MenuItemCard from "@/components/MenuItemCard";
import { getCustomizations } from "@/lib/customizations";
import { getMenuItems } from "@/lib/menu";
import type { Customization, MenuItem } from "@/lib/menu-helpers";
import { DELIVERY_LOCATIONS, OPENING_HOURS } from "@/lib/store-info";

/*
 * HomePage
 * "async" because it waits for the menu items (same cached function as the
 * Menu page, so both pages share one saved copy).
 * Mobile-first: everything is stacked in one column on phones. On wider
 * screens ("sm:" = 640px and up) the two info cards sit side by side.
 */
export default async function HomePage() {
  // Load the menu. If it fails, we simply hide the specials section: the rest
  // of the Home page (hours, delivery info, "View menu") still works.
  let items: MenuItem[] = [];
  try {
    items = await getMenuItems();
  } catch {
    items = [];
  }

  // The extras for the specials' options panel (FR-02). If they fail to load,
  // the panel just shows no extras.
  let customizations: Customization[] = [];
  try {
    customizations = await getCustomizations();
  } catch {
    customizations = [];
  }

  // FR-01: daily specials are highlighted. Only show ones that can be ordered.
  const specials = items.filter(
    (item) => item.isDailySpecial && item.isAvailable,
  );

  // Turns ["UWI Mona", "UTech", "UWI Hospital"] into "UWI Mona, UTech and UWI Hospital".
  // We build it from DELIVERY_LOCATIONS (instead of typing the names) so that if the
  // Manager changes the locations later, this sentence updates too.
  const locationsText =
    DELIVERY_LOCATIONS.slice(0, -1).join(", ") +
    " and " +
    DELIVERY_LOCATIONS.at(-1);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-12">
      {/* Welcome section ("hero") */}
      <section className="py-10 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Welcome to <span className="text-brand">The Spot</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-stone-600">
          Order ahead, skip the line. Hot meals ready for pickup, or delivered
          to {locationsText}.
        </p>
        {/* The main action, big and easy to tap. Usability: Menu -> Cart -> Checkout in under 3 minutes */}
        <Link
          href="/menu"
          className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-brand px-8 text-lg font-bold text-white shadow hover:bg-brand-dark"
        >
          View menu
        </Link>
      </section>

      {/* Info cards: hours, and pickup/delivery (FR-01) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="font-bold">Opening hours</h2>
          <p className="mt-1 text-2xl font-extrabold text-brand">
            {OPENING_HOURS}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            Pickup and delivery, every day we&apos;re open.
          </p>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="font-bold">Pickup or delivery</h2>
          <p className="mt-1 text-sm text-stone-600">
            Pick up at the counter, or we deliver to:
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {DELIVERY_LOCATIONS.map((location) => (
              <li
                key={location}
                className="rounded-full bg-cream px-3 py-1 text-sm font-semibold text-brand-dark"
              >
                {location}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Today's specials, reusing the same card as the menu page.
          Only shown when there is at least one available special. */}
      {specials.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-2xl font-bold">Today&apos;s specials</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {specials.map((item) => (
              <MenuItemCard key={item.id} item={item} customizations={customizations} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
