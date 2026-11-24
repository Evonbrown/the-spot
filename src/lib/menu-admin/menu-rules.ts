/*
 * src/lib/menu-admin/menu-rules.ts
 *
 * WHAT: The checks for the Manager's "Add / Edit menu item" form (Step 40a,
 *       SRS QA-3; SAF-2 ingredients + allergens):
 *         readMenuItemForm(fields) -> a clean MenuItemInput, or a message;
 *         parsePrice(text)         -> a J$ amount (0 - 99,999, 2 decimals);
 *         parseAllergens(text)     -> the allergen list from "Peanuts, Milk";
 *         toDbRow(input)           -> the database columns for that item.
 *
 * LAYER: Application layer (pure rules: no database, no browser), used by
 *        the Server Actions (menu-actions.ts) and easy to test. The database
 *        checks the same limits again (migrations 0002, 0003, 0026).
 */

export const NAME_MAX = 80;
export const TEXT_MAX = 500; // description and ingredients
export const CATEGORY_MAX = 40;
export const ALLERGENS_MAX = 15;
export const ALLERGEN_NAME_MAX = 40;
export const PRICE_MAX = 99_999;

/* What the form says about allergens (SAF-2: never "None" unless confirmed). */
export type AllergenMode = "unconfirmed" | "none" | "list";

/* A checked, cleaned-up menu item, ready to save. */
export type MenuItemInput = {
  name: string;
  description: string;
  ingredients: string;
  category: string;
  pricing:
    | { kind: "single"; price: number }
    | { kind: "sizes"; small: number | null; medium: number | null; large: number | null };
  allergens: string[] | null; // null = not confirmed, [] = confirmed none
  isMadeToOrder: boolean;
  isDailySpecial: boolean;
  isAvailable: boolean;
};

/*
 * parsePrice("J$1,200.50") -> { price: 1200.5 }; "" -> { price: null };
 * otherwise { error }. "J$", "$", commas and spaces are ignored.
 */
export function parsePrice(text: string): { price: number | null } | { error: string } {
  const cleaned = text.replace(/j\$|\$|,|\s/gi, "");
  if (cleaned === "") return { price: null };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { error: "Prices are plain amounts, e.g. 1200 or 1200.50." };
  const price = Number(cleaned);
  if (price > PRICE_MAX) return { error: `A price can be at most J$${PRICE_MAX.toLocaleString("en-US")}.` };
  return { price };
}

/*
 * parseAllergens("Peanuts, milk ,, Peanuts") -> { allergens: ["Peanuts", "milk"] }
 * Commas separate them; blanks and repeats (any capitals) are dropped.
 */
export function parseAllergens(text: string): { allergens: string[] } | { error: string } {
  const seen = new Set<string>();
  const allergens: string[] = [];
  for (const part of text.split(",")) {
    const name = part.trim().replace(/\s+/g, " ");
    if (name === "" || seen.has(name.toLowerCase())) continue;
    if (name.length > ALLERGEN_NAME_MAX) return { error: `Each allergen can be at most ${ALLERGEN_NAME_MAX} characters.` };
    seen.add(name.toLowerCase());
    allergens.push(name);
  }
  if (allergens.length === 0) return { error: 'List the allergens, separated by commas (or choose "None").' };
  if (allergens.length > ALLERGENS_MAX) return { error: `List at most ${ALLERGENS_MAX} allergens.` };
  return { allergens };
}

/* "  Fry   Chicken " -> "Fry Chicken" (extra spaces removed). */
function tidy(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/*
 * readMenuItemForm(fields) -> { input } or { error }.
 * fields = the form's text values:
 *   name, description, ingredients,
 *   category ("__new__" = use newCategory), newCategory,
 *   pricing ("single" | "sizes"), price, priceSmall, priceMedium, priceLarge,
 *   allergenMode ("unconfirmed" | "none" | "list"), allergens,
 *   madeToOrder / dailySpecial / available ("on" when ticked).
 */
export function readMenuItemForm(fields: Record<string, string>): { input: MenuItemInput } | { error: string } {
  const name = tidy(fields.name ?? "");
  if (name.length < 2) return { error: "Enter the item's name." };
  if (name.length > NAME_MAX) return { error: `The name can be at most ${NAME_MAX} characters.` };

  const description = (fields.description ?? "").trim();
  if (description.length > TEXT_MAX) return { error: `The description can be at most ${TEXT_MAX} characters.` };
  const ingredients = (fields.ingredients ?? "").trim();
  if (ingredients.length > TEXT_MAX) return { error: `The ingredients can be at most ${TEXT_MAX} characters.` };

  // Category: one from the list, or a new one typed in.
  const category = tidy(fields.category === "__new__" ? (fields.newCategory ?? "") : (fields.category ?? ""));
  if (category === "") return { error: "Choose a category (or type a new one)." };
  if (category.length > CATEGORY_MAX) return { error: `A category can be at most ${CATEGORY_MAX} characters.` };

  // Pricing: ONE price (e.g. drinks) OR Small / Medium / Large (decision, Option C).
  let pricing: MenuItemInput["pricing"];
  if (fields.pricing === "single") {
    const p = parsePrice(fields.price ?? "");
    if ("error" in p) return { error: p.error };
    if (p.price === null) return { error: "Enter the price." };
    pricing = { kind: "single", price: p.price };
  } else if (fields.pricing === "sizes") {
    const small = parsePrice(fields.priceSmall ?? "");
    if ("error" in small) return { error: `Small: ${small.error}` };
    const medium = parsePrice(fields.priceMedium ?? "");
    if ("error" in medium) return { error: `Medium: ${medium.error}` };
    const large = parsePrice(fields.priceLarge ?? "");
    if ("error" in large) return { error: `Large: ${large.error}` };
    const [s, m, l] = [small.price, medium.price, large.price];
    if (s === null && m === null && l === null) {
      return { error: "Enter at least one size price (leave a size empty if it isn't offered)." };
    }
    pricing = { kind: "sizes", small: s, medium: m, large: l };
  } else {
    return { error: 'Choose "One price" or "Sizes".' };
  }

  // Allergens (SAF-2): not confirmed / confirmed none / a list.
  let allergens: string[] | null;
  if (fields.allergenMode === "unconfirmed") allergens = null;
  else if (fields.allergenMode === "none") allergens = [];
  else if (fields.allergenMode === "list") {
    const a = parseAllergens(fields.allergens ?? "");
    if ("error" in a) return { error: a.error };
    allergens = a.allergens;
  } else return { error: "Choose what we know about the allergens." };

  return {
    input: {
      name,
      description,
      ingredients,
      category,
      pricing,
      allergens,
      isMadeToOrder: fields.madeToOrder === "on",
      isDailySpecial: fields.dailySpecial === "on",
      isAvailable: fields.available === "on",
    },
  };
}

/*
 * toDbRow(input) -> the menu_items columns. A single-price item has the size
 * columns empty, and a sized item has "price" empty: the database rule
 * menu_items_one_pricing_style (0003) requires exactly that.
 */
export function toDbRow(input: MenuItemInput) {
  const p = input.pricing;
  return {
    name: input.name,
    description: input.description,
    ingredients: input.ingredients,
    category: input.category,
    price: p.kind === "single" ? p.price : null,
    price_small: p.kind === "sizes" ? p.small : null,
    price_medium: p.kind === "sizes" ? p.medium : null,
    price_large: p.kind === "sizes" ? p.large : null,
    allergens: input.allergens,
    is_made_to_order: input.isMadeToOrder,
    is_daily_special: input.isDailySpecial,
    is_available: input.isAvailable,
  };
}
