/*
 * src/app/staff/page.tsx   ->   http://localhost:3000/staff
 *
 * WHAT: The Counter Staff screen. A placeholder for now; the live order
 *       queue (FR-03) is built in Build step 4.
 * LAYER: Presentation. Protected by requireRole (Application layer).
 * WHO: counter_staff ONLY (strict: each role opens only its own screen).
 */

import { Suspense } from "react";
import ScreenPlaceholder from "@/components/ScreenPlaceholder";
import { requireRole } from "@/lib/auth/require-role";

/*
 * The whole screen sits inside <Suspense>, because checking the login reads
 * cookies (per-visitor data), and our "cacheComponents" setting requires that
 * inside <Suspense>. IMPORTANT: ALL the content is inside the guarded component,
 * so nothing from this screen is sent until the role check has passed.
 */
export default function StaffPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Suspense fallback={<p>Checking access…</p>}>
        <StaffScreen />
      </Suspense>
    </main>
  );
}

async function StaffScreen() {
  // Server-side guard: not logged in -> /login, wrong role -> /no-access.
  const profile = await requireRole(["counter_staff"]);

  return (
    <ScreenPlaceholder
      title="Order queue"
      profile={profile}
      upcoming={[
        "Live queue of orders, newest at the bottom (FR-03)",
        "Update order status. It can only move forward (FR-03)",
        "Assign delivery orders to a driver (FR-04)",
        "Mark pickup orders abandoned after 20 minutes",
        "Confirm the Order ID at handover (SAF-1)",
      ]}
    />
  );
}
