/*
 * src/app/manager/menu/[id]/page.tsx   ->   /manager/menu/12
 *
 * WHAT: "Edit item" (Step 40a, SRS QA-3): MenuItemForm filled in with the
 *       saved item. If another Manager saves the same item first, saving
 *       says so (it doesn't overwrite their change).
 *
 * LAYER: Presentation. Manager only (requireRole); saving = saveMenuItem.
 * The id comes from the address, so it's checked (only a plain number).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import MenuItemForm from "@/components/MenuItemForm";
import { requireRole } from "@/lib/auth/require-role";
import {
  categoriesInMenuOrder,
  getAdminMenuItem,
  getAdminMenuItems,
  type AdminMenuItem,
} from "@/lib/menu-admin/get-menu-admin";

export const metadata: Metadata = {
  title: "Edit menu item",
};

type Params = Promise<{ id: string }>;

export default function EditMenuItemPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-12">
      <Link href="/manager/menu" className="inline-flex min-h-11 items-center pt-4 font-semibold text-brand underline">
        ← Back to the menu
      </Link>
      <h1 className="text-3xl font-extrabold">Edit item</h1>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />}>
        <EditItemForm params={params} />
      </Suspense>
    </main>
  );
}

async function EditItemForm({ params }: { params: Params }) {
  const { id: idText } = await params;
  await requireRole(["manager"], { returnTo: `/manager/menu/${encodeURIComponent(idText)}` });

  const id = /^\d{1,15}$/.test(idText) ? Number(idText) : null;
  let item: AdminMenuItem | null = null;
  let categories: string[] = [];
  let failed = false;
  if (id !== null) {
    try {
      [item, categories] = await Promise.all([
        getAdminMenuItem(id),
        getAdminMenuItems().then(categoriesInMenuOrder),
      ]);
    } catch {
      failed = true;
    }
  }

  if (failed) {
    return (
      <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">
        We couldn&apos;t load this item. Check the connection and refresh the page.
      </p>
    );
  }
  if (!item) {
    return <p className="mt-4 rounded-lg bg-white p-4 shadow-sm">Item not found.</p>;
  }
  return (
    <div className="mt-4">
      {item.isArchived && (
        <p role="note" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          This item is removed from the menu (hidden). Saving keeps it hidden; use &quot;Restore&quot; on the menu list
          to bring it back.
        </p>
      )}
      {/* A category that's only used by this item still appears in the list. */}
      <MenuItemForm item={item} categories={categories.includes(item.category) ? categories : [...categories, item.category]} />
    </div>
  );
}
