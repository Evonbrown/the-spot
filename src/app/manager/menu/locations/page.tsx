/*
 * src/app/manager/menu/locations/page.tsx   ->   /manager/menu/locations
 *
 * WHAT: The Manager's "Delivery" tab (Step 40b, SRS QA-3): edit delivery
 *       locations (name, fee, fee confirmed, active) and add new ones.
 *
 * LAYER: Presentation. Manager only (requireRole); read fresh
 *        (get-extras-locations-admin.ts); changes = Server Actions + RLS.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import LocationsAdmin from "@/components/LocationsAdmin";
import ManagerNav from "@/components/ManagerNav";
import MenuTabs from "@/components/MenuTabs";
import { requireRole } from "@/lib/auth/require-role";
import { getAdminLocations, type AdminLocation } from "@/lib/menu-admin/get-extras-locations-admin";

export const metadata: Metadata = {
  title: "Manage delivery locations",
};

export default function ManagerLocationsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-12">
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />}>
        <LocationsScreen />
      </Suspense>
    </main>
  );
}

async function LocationsScreen() {
  await requireRole(["manager"], { returnTo: "/manager/menu/locations" });
  let locations: AdminLocation[] | null;
  try {
    locations = await getAdminLocations();
  } catch {
    locations = null;
  }
  return (
    <>
      <ManagerNav current="menu" />
      <h1 className="pt-4 text-3xl font-extrabold">Menu</h1>
      <MenuTabs current="locations" />
      <div className="mt-4">
        {locations === null ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
            We couldn&apos;t load the delivery locations. Check the connection and refresh the page.
          </p>
        ) : (
          <LocationsAdmin locations={locations} />
        )}
      </div>
    </>
  );
}
