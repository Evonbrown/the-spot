/*
 * src/lib/menu-admin/extras-location-rules.ts
 *
 * WHAT: The checks for the Manager's "Extras" and "Delivery" tabs (Step 40b,
 *       SRS QA-3):
 *         readExtraForm(fields)    -> name, side / sauce, extra price,
 *                                     available; or a message;
 *         readLocationForm(fields) -> name, delivery fee, fee confirmed,
 *                                     active; or a message.
 *
 * LAYER: Application layer (pure rules), used by the Server Actions and easy
 *        to test. The database checks again (0004, 0005, 0027).
 */

import { parsePrice } from "@/lib/menu-admin/menu-rules";

/* Same limits as the database CHECKs (0027). */
export const EXTRA_NAME_MAX = 60;
export const LOCATION_NAME_MAX = 60;

/* "  Coleslaw   (Sample) " -> "Coleslaw (Sample)". */
function tidy(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export type ExtraInput = { name: string; kind: "side" | "sauce"; extraPrice: number; isAvailable: boolean };

/*
 * readExtraForm(fields): name, kind ("side" | "sauce"), extraPrice (J$, 0 =
 * free), available ("on" when ticked).
 */
export function readExtraForm(fields: Record<string, string>): { input: ExtraInput } | { error: string } {
  const name = tidy(fields.name ?? "");
  if (name.length < 2) return { error: "Enter the extra's name." };
  if (name.length > EXTRA_NAME_MAX) return { error: `The name can be at most ${EXTRA_NAME_MAX} characters.` };
  if (fields.kind !== "side" && fields.kind !== "sauce") return { error: 'Choose "Side" or "Sauce".' };
  const price = parsePrice(fields.extraPrice ?? "");
  if ("error" in price) return { error: price.error };
  if (price.price === null) return { error: "Enter the extra price (0 if it's free)." };
  return { input: { name, kind: fields.kind, extraPrice: price.price, isAvailable: fields.available === "on" } };
}

export type LocationInput = { name: string; deliveryFee: number; feeConfirmed: boolean; isActive: boolean };

/*
 * readLocationForm(fields): name, deliveryFee (J$), feeConfirmed ("on" =
 * the real fee, not a sample), active ("on" = customers can choose it).
 */
export function readLocationForm(fields: Record<string, string>): { input: LocationInput } | { error: string } {
  const name = tidy(fields.name ?? "");
  if (name.length < 2) return { error: "Enter the location's name." };
  if (name.length > LOCATION_NAME_MAX) return { error: `The name can be at most ${LOCATION_NAME_MAX} characters.` };
  const fee = parsePrice(fields.deliveryFee ?? "");
  if ("error" in fee) return { error: fee.error };
  if (fee.price === null) return { error: "Enter the delivery fee (0 if it's free)." };
  return {
    input: { name, deliveryFee: fee.price, feeConfirmed: fields.feeConfirmed === "on", isActive: fields.active === "on" },
  };
}
