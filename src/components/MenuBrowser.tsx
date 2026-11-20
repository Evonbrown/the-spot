/*
 * src/components/MenuBrowser.tsx
 *
 * WHAT: The interactive part of the Menu page: a search box, the sticky
 *       category bar, and one section per category (food as cards, drinks as
 *       compact rows). Typing in the search box instantly hides items that
 *       don't match.
 *
 * LAYER: Presentation.
 *
 * WHY: Usability (SRS 3: a first-time customer orders in under 3 minutes).
 *      Typing "pepsi" is faster than scrolling past 50 items.
 *
 * "use client" = this runs IN THE BROWSER too, because it must react to every
 * key the customer types. The SERVER still loads (and caches) the menu items
 * in menu/page.tsx and hands them to this component, so:
 *   - the first page view is still ready-made HTML (fast: PR-1), and
 *   - searching filters the items already on the page: no database query per
 *     key press, so results appear instantly.
 */
"use client";

import { useMemo, useState } from "react";
import CategoryBar from "@/components/CategoryBar";
import MenuItemCard from "@/components/MenuItemCard";
import MenuItemRow from "@/components/MenuItemRow";
import {
  getCategories,
  isSinglePrice,
  matchesSearch,
  sectionId,
  type MenuItem,
} from "@/lib/menu-helpers";

/*
 * MenuBrowser
 * Prop: items = ALL menu items, in sort_order (loaded by the server).
 */
export default function MenuBrowser({ items }: { items: MenuItem[] }) {
  // What the customer has typed. Every key press updates it and React redraws
  // the list below with only the matching items.
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";

  // The items to show: all of them, or only the matches while searching.
  // useMemo = "only recalculate when items or query change", not on every redraw.
  const shown = useMemo(
    () => (searching ? items.filter((item) => matchesSearch(item, query)) : items),
    [items, query, searching]
  );

  // Categories that still have at least one item to show, in menu order.
  // While searching, the bar and the page only show categories with matches.
  const categories = useMemo(() => getCategories(shown), [shown]);
  const categoryLinks = useMemo(
    () => categories.map((name) => ({ name, id: sectionId(name) })),
    [categories]
  );

  return (
    <>
      {/* SEARCH BOX
          - <label> tells screen readers what the box is for ("sr-only" hides the
            text visually but keeps it for screen readers).
          - type="search" gives phones a "Search" key and many browsers a
            built-in ✕ to clear it.
          - text-base (16px) stops iPhones from zooming in when the box is tapped. */}
      <div className="mt-4">
        <label htmlFor="menu-search" className="sr-only">
          Search the menu
        </label>
        <input
          id="menu-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the menu, e.g. chicken or Pepsi"
          autoComplete="off"
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-base shadow-sm placeholder:text-stone-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        {/* aria-live="polite": screen readers read out this text whenever it
            changes, so blind users hear how many items matched. */}
        <p aria-live="polite" className="mt-2 min-h-5 text-sm text-stone-600">
          {searching &&
            `${shown.length} ${shown.length === 1 ? "item" : "items"} found for "${query.trim()}"`}
        </p>
      </div>

      {shown.length === 0 ? (
        // NO RESULTS: say so, and offer a quick way back to the full menu.
        <div className="mt-2 rounded-xl bg-white p-5 text-center shadow-sm">
          <p className="text-stone-700">No menu items match &quot;{query.trim()}&quot;.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-3 min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
          >
            Clear search
          </button>
        </div>
      ) : (
        <>
          {/* The sticky category bar (Part 11), with only the categories shown. */}
          <CategoryBar categories={categoryLinks} />

          {/* One section per category */}
          {categoryLinks.map(({ name, id }) => {
            const inCategory = shown.filter((item) => item.category === name);
            // Decision (Part 12): sized items -> big cards, single-price items -> compact rows.
            const cardItems = inCategory.filter((item) => !isSinglePrice(item));
            const rowItems = inCategory.filter((item) => isSinglePrice(item));

            return (
              // scroll-mt-32 stops the sticky header from covering the section title after jumping to it
              <section key={id} id={id} className="mt-6 scroll-mt-32">
                <h2 className="mb-3 text-xl font-bold">{name}</h2>

                {cardItems.length > 0 && (
                  // Cards, mobile-first: 1 per row on phones, 2 from 640px ("sm:"),
                  // 3 from 1024px ("lg:"), 4 from 1280px ("xl:").
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {cardItems.map((item) => (
                      // "key" helps React keep track of each card in the list
                      <MenuItemCard key={item.id} item={item} />
                    ))}
                  </div>
                )}

                {rowItems.length > 0 && (
                  // One white box holding the rows.
                  // - On wide screens ("lg:") the rows form 2 columns, so a row isn't
                  //   stretched across the whole page. gap-x-8 = space between columns.
                  // - "[&>li]:border-b" = "give every <li> inside a bottom border": a
                  //   thin line under each row. overflow-hidden keeps the lines inside
                  //   the rounded corners.
                  // - Only 1 row (e.g. after searching "pepsi")? Then 2 columns would
                  //   leave the right half of the box empty, so on wide screens the box
                  //   becomes half width ("lg:w-1/2") with a single column instead.
                  <ul
                    className={`grid grid-cols-1 overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm [&>li]:border-b [&>li]:border-stone-100 ${
                      rowItems.length === 1 ? "lg:w-1/2" : "lg:grid-cols-2 lg:gap-x-8"
                    } ${cardItems.length > 0 ? "mt-4" : ""}`}
                  >
                    {rowItems.map((item) => (
                      <MenuItemRow key={item.id} item={item} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
