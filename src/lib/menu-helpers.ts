/*
 * src/lib/menu-helpers.ts
 *
 * WHAT: The menu TYPES (MenuItem, PriceOption, Size) and small helper
 *       functions for showing menu items: prices, allergens, categories,
 *       section ids and search matching.
 *
 * LAYER: Application layer (shared rules), used by Presentation components.
 *
 * WHY a separate file from menu.ts?
 *   menu.ts talks to the DATABASE (getMenuItems, with 'use cache'). That code
 *   must only ever run on the SERVER. The search box (Part 13) runs in the
 *   BROWSER, and it needs these helpers. If the browser code imported menu.ts,
 *   the server-only database code would be pulled in too and the build would
 *   fail. So: browser-safe things live here; server-only things in menu.ts.
 *   Nothing in this file may import server-only code.
 */

/* The three sizes on The Spot's menu board, in display order. */
export type Size = "Small" | "Medium" | "Large";

/*
 * PriceOption: one price a customer can choose for an item.
 *   Sized item (Fry Chicken):  { size: "Small", price: 750 }, { size: "Medium", ... }
 *   Single-price item (Pepsi): { size: null, price: 220 }   (null = no size)
 * This is NOT a new database class: it's just a handy shape for the pages,
 * built from MenuItem's price columns (decision "Option C").
 */
export type PriceOption = {
  size: Size | null;
  price: number; // J$. Stored EXACTLY in the database as numeric(10,2)
};

/*
 * MenuItem: what ONE menu item looks like in our code (SDS class: MenuItem).
 * The database uses snake_case names (is_available); TypeScript code usually
 * uses camelCase (isAvailable). getMenuItems() in menu.ts converts between them.
 */
export type MenuItem = {
  id: number;
  name: string;
  description: string;
  // Always at least 1 option. Only the sizes actually offered are included,
  // in Small -> Medium -> Large order (Fish: just [Large]).
  priceOptions: PriceOption[];
  category: string; // plain text (decision), e.g. "Chicken"
  // SAF-2: null = NOT CONFIRMED yet ("ask at the counter").
  //        []   = confirmed: no allergens.
  allergens: string[] | null;
  isAvailable: boolean; // FR-01: false = greyed out, cannot be added (instead of stock tracking)
  isDailySpecial: boolean; // FR-01: daily specials are highlighted
  isMadeToOrder: boolean; // FR-01: e.g. fries. Pickup with one needs at least 15 min
};

/*
 * Customization: one extra a customer can tick for a food item
 * (SDS class: Customization; table: customizations, see 0004).
 * Decision: the same list is offered on every food item; drinks get none.
 */
export type Customization = {
  id: number;
  name: string; // e.g. "Coleslaw (Sample)"
  kind: "side" | "sauce"; // groups them under "Sides" / "Sauces" in the panel
  extraPrice: number; // J$, exact. 0 = "Free"
  isAvailable: boolean; // false = greyed out, can't be ticked
};

/* Decision: a cart line holds 1 to 10 of an item. */
export const MAX_QUANTITY = 10;

/* Decision: a meal note is at most 200 characters (checked again on the server at checkout). */
export const MAX_NOTE_LENGTH = 200;

/*
 * calculateLinePrice(unitPrice, extras, quantity)
 * FR-02: the price of one cart line = (size price + chosen extras) x quantity.
 *   Example: Fry Chicken Large 1200 + Coleslaw 150 + Extra gravy 50, quantity 2
 *            -> (1200 + 150 + 50) x 2 = 2800
 *
 * WHY one shared function? The options panel (Part 15), the cart (Part 16) and
 * the server at checkout (Build step 3) must all get EXACTLY the same answer.
 *
 * WHY count in cents? JavaScript numbers are floats (approximate), like the
 * "float" we avoided in the database: 0.1 + 0.2 = 0.30000000000000004. Turning
 * each price into whole cents first (1200 -> 120000) and adding whole numbers
 * is always exact. We turn the answer back into dollars at the end.
 */
export function calculateLinePrice(
  unitPrice: number,
  extras: { extraPrice: number }[],
  quantity: number
): number {
  const toCents = (dollars: number) => Math.round(dollars * 100);
  const extrasCents = extras.reduce((sum, extra) => sum + toCents(extra.extraPrice), 0);
  return ((toCents(unitPrice) + extrasCents) * quantity) / 100;
}

/*
 * formatExtraPrice(150) -> "+J$150"    formatExtraPrice(0) -> "Free"
 * Used next to each extra's tick box.
 */
export function formatExtraPrice(price: number): string {
  return price === 0 ? "Free" : `+${formatPrice(price)}`;
}

/*
 * getCategories(items)
 * Lists each category once, in the order it first appears (items are already
 * in sort_order). Example: ["Chicken", "Pork & Beef", ...].
 * WHY build it from the data? Category is plain text, so if the Manager adds a
 * "Desserts" item, a "Desserts" section appears with no code change
 * (Maintainability).
 */
export function getCategories(items: MenuItem[]): string[] {
  // A Set keeps only unique values, in the order they were added.
  return [...new Set(items.map((item) => item.category))];
}

/*
 * sectionId("Pork & Beef") -> "pork-and-beef"
 * A safe id for a category's section, used in links like "#pork-and-beef".
 * Steps: lower case, "&" becomes "and", every run of characters that isn't a
 * letter or digit becomes one "-", and no "-" at the start or end.
 */
export function sectionId(category: string): string {
  return category
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/*
 * matchesSearch(item, query) -> true if the item should be shown for a search.
 * Rules (Part 13):
 *   - Not case-sensitive: "PEPSI" finds "Pepsi".
 *   - Looks in the item's NAME and CATEGORY: "water" finds every water,
 *     "chicken" finds the Chicken section and the Mix Chickens.
 *   - Every word must match somewhere: "fry chicken" finds "Fry Chicken" and
 *     "Bar-B-Fry Chicken", but not "Brown Stew Chicken".
 *   - An empty search matches everything.
 */
export function matchesSearch(item: MenuItem, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${item.name} ${item.category}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

/*
 * allergenText(item) -> the words shown after "Allergens:" (SAF-2).
 *   null      -> "Not confirmed yet, please ask at the counter"
 *   []        -> "None"            (confirmed: no allergens)
 *   [Fish]    -> "Fish"
 * WHY one shared function? Both the big card (food) and the compact row
 * (drinks) show allergens. Writing the rule once means they can never
 * disagree, which matters for a safety requirement.
 */
export function allergenText(item: MenuItem): string {
  if (item.allergens === null) return "Not confirmed yet, please ask at the counter";
  if (item.allergens.length === 0) return "None";
  return item.allergens.join(", ");
}

/*
 * isSinglePrice(item) -> true for items with ONE price and no sizes (e.g. Pepsi).
 * Used by the card (to show "J$220" instead of size prices) and by the menu
 * (decision: single-price items are shown as compact rows, not big cards).
 */
export function isSinglePrice(item: MenuItem): boolean {
  return item.priceOptions.length === 1 && item.priceOptions[0].size === null;
}

/*
 * formatPrice(1200) -> "J$1,200"   formatPrice(99.5) -> "J$99.50"
 * One shared function, so every price on the site looks the same.
 * Whole-dollar prices show no cents; other prices always show 2 decimal places.
 */
export function formatPrice(price: number): string {
  const hasCents = !Number.isInteger(price);
  return `J$${price.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
