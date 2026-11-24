/*
 * src/lib/orders/get-drivers.ts   (SERVER ONLY)
 *
 * WHAT: getDrivers(): every delivery staff member (role delivery_personnel)
 *       with HOW MANY ACTIVE deliveries they have right now, for the
 *       "Assign driver" list (Step 31, FR-04 SR-4.1: "assign them to the
 *       AVAILABLE delivery person"). Fewest active first, so the most
 *       available driver is at the top.
 *
 * LAYER: Application layer. The staff order page (Presentation) calls it;
 *        it reads profiles and deliveries (Data layer) through RLS:
 *        counter staff may read delivery staff profiles and all deliveries
 *        (migration 0013).
 *
 * "ACTIVE" = a delivery whose order isn't finished yet (Pending, In progress,
 * Ready for pickup or Being delivered). There's no separate "available"
 * switch (decision): the count tells staff who is busy.
 */

import "server-only";
import { ACTIVE_STATUSES } from "@/lib/order-status";
import { createClient } from "@/lib/supabase/server";

/* One entry in the "Assign driver" list. */
export type DriverOption = {
  id: string; // the driver's profile id
  name: string;
  activeCount: number; // their unfinished deliveries
};

/*
 * getDrivers() -> all drivers, fewest active deliveries first (then by name).
 * THROWS if the database can't be reached; the page shows a message.
 */
export async function getDrivers(): Promise<DriverOption[]> {
  const supabase = await createClient();

  // Two small reads at the same time:
  //   1. the drivers themselves;
  //   2. the deliveries whose ORDER is still active. "orders!inner" = only
  //      deliveries that HAVE a matching order passing the filter below.
  const [driversResult, activeResult] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "delivery_personnel"),
    supabase.from("deliveries").select("driver_id, orders!inner ( status )").in("orders.status", ACTIVE_STATUSES),
  ]);

  if (driversResult.error || activeResult.error) {
    console.error(
      "getDrivers failed:",
      driversResult.error?.message ?? activeResult.error?.message
    );
    throw new Error("Could not load the drivers.");
  }

  // Count active deliveries per driver: { "driver id": 2, ... }
  const counts = new Map<string, number>();
  for (const row of activeResult.data ?? []) {
    counts.set(row.driver_id, (counts.get(row.driver_id) ?? 0) + 1);
  }

  return (driversResult.data ?? [])
    .map((driver) => ({
      id: driver.id,
      name: driver.full_name?.trim() || "Driver (no name)",
      activeCount: counts.get(driver.id) ?? 0,
    }))
    .sort((a, b) => a.activeCount - b.activeCount || a.name.localeCompare(b.name));
}
