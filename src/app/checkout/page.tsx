/*
 * src/app/checkout/page.tsx   ->   http://localhost:3000/checkout
 *
 * WHAT: The checkout page. Only for logged-in CUSTOMERS. It loads what the
 *       form needs (the customer's name and phone, the delivery locations,
 *       which items are made to order) and shows CheckoutForm.
 *
 * LAYER: Presentation. It uses requireRole (Application layer) for the access
 *        check and getDeliveryLocations / getMenuItems for the data.
 *
 * WHY:
 *   - Security (SRS 3): ordering requires login. Decision: browsing and the
 *     cart don't, but checkout does.
 *   - Strict role screens (decision): staff can't check out (they get the
 *     "no access" page).
 *   - Logged-out visitors are sent to /login?next=/checkout, so they come
 *     straight back here after logging in or signing up.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import CheckoutForm from "@/components/CheckoutForm";
import { requireRole } from "@/lib/auth/require-role";
import { getDeliveryLocations } from "@/lib/delivery-locations";
import { getMenuItems } from "@/lib/menu";
import type { DeliveryLocation } from "@/lib/store-info";
import { getOpeningHours, isIgnoreOpeningHoursOn } from "@/lib/test-settings";

export const metadata: Metadata = {
  title: "Checkout",
};

/*
 * CheckoutPage
 * The title shows instantly. Everything that depends on WHO is visiting (the
 * login check) sits inside <Suspense>, as our Next.js settings require.
 */
export default function CheckoutPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-12">
      <h1 className="pt-6 text-3xl font-extrabold">Checkout</h1>
      <Suspense
        fallback={
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3" aria-hidden="true">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <div className="h-40 animate-pulse rounded-xl bg-stone-200" />
              <div className="h-40 animate-pulse rounded-xl bg-stone-200" />
            </div>
            <div className="h-56 animate-pulse rounded-xl bg-stone-200" />
          </div>
        }
      >
        <CheckoutContent />
      </Suspense>
    </main>
  );
}

/*
 * CheckoutContent (runs on the server, per visitor)
 * 1. requireRole: customers only; logged out -> /login?next=/checkout.
 * 2. Load the active delivery locations (FR-01) and which menu items are made
 *    to order (FR-01 lead time). Both are the cached copies: good enough for
 *    SHOWING choices; the server re-checks with fresh data when ordering.
 * 3. Work out which opening hours to use (the real ones, or "open all day"
 *    only while testing on a laptop; see src/lib/test-settings.ts). This has
 *    to happen HERE on the server, because the browser can't read the setting.
 */
async function CheckoutContent() {
  const profile = await requireRole(["customer"], { returnTo: "/checkout" });

  let locations: DeliveryLocation[] = [];
  let locationsLoadError = false;
  try {
    locations = await getDeliveryLocations();
  } catch {
    locations = []; // the form then offers pickup only
    locationsLoadError = true;
  }

  let madeToOrderItemIds: number[] = [];
  try {
    const items = await getMenuItems();
    madeToOrderItemIds = items.filter((item) => item.isMadeToOrder).map((item) => item.id);
  } catch {
    madeToOrderItemIds = []; // the server still applies the real rule when ordering
  }

  return (
    <>
      {locationsLoadError && (
        <p role="note" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          We couldn&apos;t load delivery locations right now, so only pickup is available. Refresh to try again.
        </p>
      )}
      <CheckoutForm
        customerName={profile.full_name || profile.email}
        phone={profile.phone}
        locations={locations}
        madeToOrderItemIds={madeToOrderItemIds}
        hours={getOpeningHours()}
        isTestHours={isIgnoreOpeningHoursOn()}
      />
    </>
  );
}
