/*
 * src/lib/store-info.ts
 *
 * WHAT: Facts about The Spot that pages show, and the DeliveryLocation type:
 *       opening hours, the shape of a delivery location, and how to show a
 *       delivery fee.
 *
 * LAYER: Application layer (shared values used by Presentation pages).
 *
 * Browser-safe: no server-only code here, so checkout (a client component in
 * Part 20) can use it too. The locations themselves are LOADED from the
 * database by src/lib/delivery-locations.ts (server only).
 */

import { formatPrice } from "@/lib/menu-helpers";

// FR-01: opening and delivery hours (11:00 a.m. - 7:00 p.m.).
export const OPENING_HOURS = "11:00 a.m. – 7:00 p.m.";

/*
 * DeliveryLocation: one place The Spot delivers to (table delivery_locations,
 * see migration 0005). Edited by the Manager without code changes
 * (Maintainability).
 */
export type DeliveryLocation = {
  id: number;
  name: string; // e.g. "UWI Mona"
  deliveryFee: number; // J$, exact (FR-02: added to delivery orders only)
  feeConfirmed: boolean; // false = the fee is a SAMPLE ("sample, not final")
};

/*
 * formatDeliveryFee(location) -> "J$200 (sample, not final)" or "J$200"
 * While the client hasn't confirmed the real fee, every place that shows it
 * says so clearly (decision), so nobody mistakes the sample for the real price.
 */
export function formatDeliveryFee(location: DeliveryLocation): string {
  const fee = formatPrice(location.deliveryFee);
  return location.feeConfirmed ? fee : `${fee} (sample, not final)`;
}
