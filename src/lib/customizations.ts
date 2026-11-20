/*
 * src/lib/customizations.ts   (SERVER ONLY)
 *
 * WHAT: getCustomizations(): loads all extras (sides, sauces) from the
 *       customizations table.
 *
 * LAYER: Application layer. Pages (Presentation) call it; it reads the
 *        customizations table (Data layer) through the public connection.
 *
 * WHY: FR-02. The options panel (Part 15) shows these extras as tick boxes.
 *
 * SERVER ONLY, like menu.ts: it uses 'use cache' and the database, so browser
 * code ("use client") must never import it. The Customization TYPE lives in
 * menu-helpers.ts, which is safe for both.
 */

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { Customization } from "@/lib/menu-helpers";

/* What one row looks like when it comes back FROM the database. */
type CustomizationDbRow = {
  id: number;
  name: string;
  kind: "side" | "sauce";
  extra_price: number | string;
  is_available: boolean;
};

/*
 * getCustomizations()
 * Returns ALL extras (available and unavailable) in sort_order. Unavailable
 * ones are included so the panel can show them greyed out.
 *
 * CACHING: the same settings as getMenuItems() in menu.ts:
 *   - a saved copy, refreshed about every minute (PR-1, PR-3);
 *   - the SAME "menu" label, so when the Manager edits the menu in the app
 *     (Build step 7), one clear-out refreshes items AND extras together.
 *
 * Throws if the database can't be reached (errors are not cached). The pages
 * catch it and simply show the panel without extras, so food can still be
 * ordered.
 */
export async function getCustomizations(): Promise<Customization[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("menu");

  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("customizations")
    .select("id, name, kind, extra_price, is_available")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    // Logged on the server (in the terminal), never shown to customers.
    console.error("getCustomizations failed:", error.message);
    throw new Error("Could not load the customizations.");
  }

  // Convert database names (snake_case) to our code names (camelCase).
  // Number(...) makes sure the price is a number even if it arrives as text.
  return (data as CustomizationDbRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    extraPrice: Number(row.extra_price),
    isAvailable: row.is_available,
  }));
}
