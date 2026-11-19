/*
 * src/app/driver/page.tsx   ->   http://localhost:3000/driver
 *
 * WHAT: The Delivery Personnel screen. A placeholder for now; assigned
 *       deliveries (FR-04) are built in Build step 6.
 * LAYER: Presentation. Protected by requireRole (Application layer).
 * WHO: delivery_personnel ONLY.
 * (See src/app/staff/page.tsx for why everything sits inside <Suspense>.)
 */

import { Suspense } from "react";
import ScreenPlaceholder from "@/components/ScreenPlaceholder";
import { requireRole } from "@/lib/auth/require-role";

export default function DriverPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Suspense fallback={<p>Checking access…</p>}>
        <DriverScreen />
      </Suspense>
    </main>
  );
}

async function DriverScreen() {
  // Server-side guard: not logged in -> /login, wrong role -> /no-access.
  const profile = await requireRole(["delivery_personnel"]);

  return (
    <ScreenPlaceholder
      title="My deliveries"
      profile={profile}
      upcoming={[
        "Deliveries assigned to you: Order ID, customer phone, drop-off location (FR-04)",
        "Mark an order Being Delivered",
        "Mark it Completed after confirming the Order ID (SAF-1)",
      ]}
    />
  );
}
