/*
 * src/app/manager/menu/page.tsx   ->   http://localhost:3000/manager/menu
 *
 * WHAT: The Manager's "Menu" screen (Step 40a, SRS QA-3 Maintainability):
 *       every menu item by category, with an Available switch, Edit and
 *       Remove, a "Removed items" list (Restore), and "Add item".
 *       (Step 40b adds extras and delivery locations here.)
 *
 * LAYER: Presentation. requireRole (Application layer) checks "Manager
 *        only"; the list is read fresh (get-menu-admin.ts); every change goes
 *        through a Server Action (menu-actions.ts) and RLS.
 *
 * WHO: manager ONLY.
 * (See src/app/staff/page.tsx for why everything sits inside <Suspense>.)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import ManagerNav from "@/components/ManagerNav";
import MenuAdminList from "@/components/MenuAdminList";
import { requireRole } from "@/lib/auth/require-role";
import { getAdminMenuItems, type AdminMenuItem } from "@/lib/menu-admin/get-menu-admin";

export const metadata: Metadata = {
  title: "Manage menu",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ManagerMenuPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-12">
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />}>
        <MenuScreen searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function MenuScreen({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  await requireRole(["manager"], { returnTo: "/manager/menu" });
  // "?saved=Fry Chicken" after a save (from saveMenuItem): show a short note.
  const saved = typeof params.saved === "string" ? params.saved.slice(0, 80) : null;

  let items: AdminMenuItem[] | null;
  try {
    items = await getAdminMenuItems();
  } catch {
    items = null;
  }

  return (
    <>
      <ManagerNav current="menu" />
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <h1 className="text-3xl font-extrabold">Menu</h1>
        <Link
          href="/manager/menu/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
        >
          + Add item
        </Link>
      </div>
      <p className="mt-1 text-sm text-stone-600">
        Changes show on the customer menu straight away. Carts with old prices are checked again at checkout.
      </p>

      {saved && (
        <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-900">
          Saved: {saved}.
        </p>
      )}

      <div className="mt-4">
        {items === null ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
            We couldn&apos;t load the menu. Check the connection and refresh the page.
          </p>
        ) : (
          <MenuAdminList items={items} />
        )}
      </div>
    </>
  );
}
