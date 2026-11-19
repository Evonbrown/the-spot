/*
 * src/lib/sample-menu.ts   (TEMPORARY)
 *
 * WHAT: Made-up sample data for the design preview: 8 menu items, the opening
 *       hours and the delivery locations.
 *
 * LAYER: A stand-in for the Data layer. In Build step 2 we will delete the
 *        sample items and load the real ones from the Supabase "menu_items"
 *        table instead. The pages that SHOW the menu should barely change.
 *
 * NOTE: These are NOT The Spot's real items or prices. We will replace them
 *       with the real menu later.
 */

/*
 * MenuItem — describes what ONE menu item looks like (name from the SDS class diagram).
 * A TypeScript "type" is like a checklist: if we forget a field or use the
 * wrong kind of value (e.g. text instead of a number), the editor warns us.
 */
export type MenuItem = {
  id: number;
  name: string;
  description: string;
  price: number; // in Jamaican dollars (J$), whole dollars
  category: MenuCategory;
  allergens: string[]; // SAF-2: shown on every item. Empty list = no listed allergens
  isAvailable: boolean; // FR-01: false = greyed out, cannot be added. (Used instead of stock tracking.)
  isDailySpecial: boolean; // FR-01: daily specials are highlighted
  isMadeToOrder: boolean; // FR-01: e.g. fries. A pickup order containing one needs at least 15 min lead time
};

// The categories, in the order they appear on the menu page.
export const MENU_CATEGORIES = ["Meals", "Sides", "Drinks"] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];

// The 8 sample items.
export const SAMPLE_MENU_ITEMS: MenuItem[] = [
  {
    id: 1,
    name: "Jerk Chicken Meal",
    description: "Quarter jerk chicken with rice & peas, coleslaw and festival.",
    price: 1200,
    category: "Meals",
    allergens: ["Gluten", "Milk"],
    isAvailable: true,
    isDailySpecial: true,
    isMadeToOrder: false,
  },
  {
    id: 2,
    name: "Curry Goat Meal",
    description: "Tender curry goat with white rice and steamed vegetables.",
    price: 1500,
    category: "Meals",
    allergens: [],
    isAvailable: true,
    isDailySpecial: false,
    isMadeToOrder: false,
  },
  {
    id: 3,
    name: "Fried Chicken Meal",
    description: "Two pieces of crispy fried chicken with rice & peas.",
    price: 1100,
    category: "Meals",
    allergens: ["Gluten", "Egg"],
    isAvailable: true,
    isDailySpecial: false,
    isMadeToOrder: false,
  },
  {
    id: 4,
    name: "Escovitch Fish Meal",
    description: "Fried fish topped with pickled peppers and onions, with bammy.",
    price: 1600,
    category: "Meals",
    allergens: ["Fish"],
    isAvailable: false, // shows how an unavailable item looks
    isDailySpecial: false,
    isMadeToOrder: false,
  },
  {
    id: 5,
    name: "Seasoned Fries",
    description: "Fresh-cut fries tossed in our house seasoning.",
    price: 400,
    category: "Sides",
    allergens: [],
    isAvailable: true,
    isDailySpecial: false,
    isMadeToOrder: true, // fries are cooked fresh (15 min lead time)
  },
  {
    id: 6,
    name: "Festival (3 pcs)",
    description: "Sweet fried dumplings, golden outside and soft inside.",
    price: 250,
    category: "Sides",
    allergens: ["Gluten", "Milk"],
    isAvailable: true,
    isDailySpecial: false,
    isMadeToOrder: false,
  },
  {
    id: 7,
    name: "Fresh Sorrel",
    description: "Chilled sorrel drink with ginger.",
    price: 300,
    category: "Drinks",
    allergens: [],
    isAvailable: true,
    isDailySpecial: true,
    isMadeToOrder: false,
  },
  {
    id: 8,
    name: "Carrot Juice",
    description: "Fresh carrot juice blended with milk and nutmeg.",
    price: 350,
    category: "Drinks",
    allergens: ["Milk"],
    isAvailable: true,
    isDailySpecial: false,
    isMadeToOrder: false,
  },
];

// FR-01: opening and delivery hours.
export const OPENING_HOURS = "11:00 a.m. – 7:00 p.m.";

// FR-01 / FR-04: the ONLY places we deliver to. Later the Manager will be able
// to edit these without code changes (Maintainability requirement).
export const DELIVERY_LOCATIONS = ["UWI Mona", "UTech", "UWI Hospital"];

/*
 * formatPrice(1200) -> "J$1,200"
 * One shared function, so every price on the site looks the same.
 */
export function formatPrice(price: number): string {
  return `J$${price.toLocaleString("en-US")}`;
}
