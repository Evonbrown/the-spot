/*
 * src/app/manager/menu/new/page.tsx   ->   /manager/menu/new
 *
 * WHAT: "Add item" (Step 40a, SRS QA-3): an empty MenuItemForm. The new item
 *       goes at the end of its category.
 *
 * LAYER: Presentation. Manager only (requireRole); saving = saveMenuItem.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import MenuItemForm from "@/components/MenuItemForm";
import { requireRole } from "@/lib/auth/require-role";
import { categoriesInMenuOrder, getAdminMenuItems } from "@/lib/menu-admin/get-menu-admin";

export const metadata: Metadata = {
  title: "Add menu item",
};

export default function NewMenuItemPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-12">
      <Link href="/manager/menu" className="inline-flex min-h-11 items-center pt-4 font-semibold text-brand underline">
        ← Back to the menu
      </Link>
      <h1 className="text-3xl font-extrabold">Add item</h1>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />}>
        <NewItemForm />
      </Suspense>
    </main>
  );
}

/* Guard, then the form with the existing categories to choose from. */
async function NewItemForm() {
  await requireRole(["manager"], { returnTo: "/manager/menu/new" });
  let categories: string[] = [];
  try {
    categories = categoriesInMenuOrder(await getAdminMenuItems());
  } catch {
    // The list can't load: the Manager can still type a new category.
  }
  return (
    <div className="mt-4">
      <MenuItemForm item={null} categories={categories} />
    </div>
  );
}
