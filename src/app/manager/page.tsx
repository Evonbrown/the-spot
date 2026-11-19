/*
 * src/app/manager/page.tsx   ->   http://localhost:3000/manager
 *
 * WHAT: The Manager screen. A placeholder for now; reports and daily closeout
 *       (FR-06) are built in Build step 7.
 * LAYER: Presentation. Protected by requireRole (Application layer).
 * WHO: manager ONLY.
 * (See src/app/staff/page.tsx for why everything sits inside <Suspense>.)
 */

import { Suspense } from "react";
import ScreenPlaceholder from "@/components/ScreenPlaceholder";
import { requireRole } from "@/lib/auth/require-role";

export default function ManagerPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Suspense fallback={<p>Checking access…</p>}>
        <ManagerScreen />
      </Suspense>
    </main>
  );
}

async function ManagerScreen() {
  // Server-side guard: not logged in -> /login, wrong role -> /no-access.
  const profile = await requireRole(["manager"]);

  return (
    <ScreenPlaceholder
      title="Manager"
      profile={profile}
      upcoming={[
        "Sales summary from paid orders, Lynk vs Cash, item volumes, date filter, CSV export (FR-06)",
        "Daily closeout: counted cash vs expected, approve and lock the day (FR-06)",
        "Edit menu items, prices and delivery locations",
      ]}
    />
  );
}
