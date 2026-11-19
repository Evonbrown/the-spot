/*
 * src/app/supervisor/page.tsx   ->   http://localhost:3000/supervisor
 *
 * WHAT: The Supervisor screen. A placeholder for now; payment verification
 *       and refunds (UC-07) are built in Build step 7.
 * LAYER: Presentation. Protected by requireRole (Application layer).
 * WHO: supervisor ONLY. (The Supervisor is the only role that can issue refunds.)
 * (See src/app/staff/page.tsx for why everything sits inside <Suspense>.)
 */

import { Suspense } from "react";
import ScreenPlaceholder from "@/components/ScreenPlaceholder";
import { requireRole } from "@/lib/auth/require-role";

export default function SupervisorPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Suspense fallback={<p>Checking access…</p>}>
        <SupervisorScreen />
      </Suspense>
    </main>
  );
}

async function SupervisorScreen() {
  // Server-side guard: not logged in -> /login, wrong role -> /no-access.
  const profile = await requireRole(["supervisor"]);

  return (
    <ScreenPlaceholder
      title="Payments"
      profile={profile}
      upcoming={[
        "Verify Lynk (Jamdex) QR payments (FR-02)",
        "Issue refunds. Only the Supervisor can do this (UC-07)",
      ]}
    />
  );
}
