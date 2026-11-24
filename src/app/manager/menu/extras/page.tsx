/*
 * src/app/manager/menu/extras/page.tsx   ->   /manager/menu/extras
 *
 * WHAT: The Manager's "Extras" tab (Step 40b, SRS QA-3): edit, add, remove
 *       and restore the extras (sides and sauces) offered on food items.
 *
 * LAYER: Presentation. Manager only (requireRole); read fresh
 *        (get-extras-locations-admin.ts); changes = Server Actions + RLS.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import ExtrasAdmin from "@/components/ExtrasAdmin";
import ManagerNav from "@/components/ManagerNav";
import MenuTabs from "@/components/MenuTabs";
import { requireRole } from "@/lib/auth/require-role";
import { getAdminExtras, type AdminExtra } from "@/lib/menu-admin/get-extras-locations-admin";

export const metadata: Metadata = {
  title: "Manage extras",
};

export default function ManagerExtrasPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-12">
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />}>
        <ExtrasScreen />
      </Suspense>
    </main>
  );
}

async function ExtrasScreen() {
  await requireRole(["manager"], { returnTo: "/manager/menu/extras" });
  let extras: AdminExtra[] | null;
  try {
    extras = await getAdminExtras();
  } catch {
    extras = null;
  }
  return (
    <>
      <ManagerNav current="menu" />
      <h1 className="pt-4 text-3xl font-extrabold">Menu</h1>
      <MenuTabs current="extras" />
      <div className="mt-4">
        {extras === null ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
            We couldn&apos;t load the extras. Check the connection and refresh the page.
          </p>
        ) : (
          <ExtrasAdmin extras={extras} />
        )}
      </div>
    </>
  );
}
