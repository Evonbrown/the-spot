/*
 * src/components/MenuItemForm.tsx
 *
 * WHAT: The Manager's "Add item" / "Edit item" form (Step 40a, SRS QA-3;
 *       SAF-2 ingredients and allergens):
 *         name, description, INGREDIENTS, category (from the list or a new
 *         one), pricing ("One price" OR Small / Medium / Large, an empty
 *         size = not offered), allergens (not confirmed / none / a list),
 *         made-to-order, daily special, available.
 *
 * LAYER: Presentation. Saving happens in saveMenuItem (menu-actions.ts,
 *        Application layer), which checks everything again; the database
 *        checks once more (RLS + CHECK rules).
 *
 * "use client" = it runs in the browser: parts of the form appear or hide
 * as you choose (e.g. the size boxes only for "Sizes").
 */
"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { AdminMenuItem } from "@/lib/menu-admin/get-menu-admin";
import { saveMenuItem, type MenuFormState } from "@/lib/menu-admin/menu-actions";
import { CATEGORY_MAX, NAME_MAX, TEXT_MAX } from "@/lib/menu-admin/menu-rules";

const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";
const area = "mt-1 block w-full rounded-lg border border-stone-300 bg-white p-3 text-base";

type Props = {
  item: AdminMenuItem | null; // null = a NEW item
  categories: string[]; // existing categories, in menu order
};

/* 1200 -> "1200", null -> "" (what the price boxes start with). */
const priceField = (value: number | null) => (value === null ? "" : String(value));

export default function MenuItemForm({ item, categories }: Props) {
  const [state, formAction, pending] = useActionState<MenuFormState, FormData>(saveMenuItem, {});

  // Starting values: what was typed (after an error), else the saved item, else empty.
  const f = state.fields;
  const start = {
    name: f?.name ?? item?.name ?? "",
    description: f?.description ?? item?.description ?? "",
    ingredients: f?.ingredients ?? item?.ingredients ?? "",
    price: f?.price ?? priceField(item?.price ?? null),
    priceSmall: f?.priceSmall ?? priceField(item?.priceSmall ?? null),
    priceMedium: f?.priceMedium ?? priceField(item?.priceMedium ?? null),
    priceLarge: f?.priceLarge ?? priceField(item?.priceLarge ?? null),
    allergens: f?.allergens ?? (item?.allergens ?? []).join(", "),
    madeToOrder: f ? f.madeToOrder === "on" : (item?.isMadeToOrder ?? false),
    dailySpecial: f ? f.dailySpecial === "on" : (item?.isDailySpecial ?? false),
    available: f ? f.available === "on" : (item?.isAvailable ?? true),
  };

  // The choices that show / hide parts of the form.
  const [category, setCategory] = useState<string>(f?.category ?? item?.category ?? categories[0] ?? "__new__");
  const [pricing, setPricing] = useState<string>(f?.pricing ?? (item && item.price === null ? "sizes" : "single"));
  const [allergenMode, setAllergenMode] = useState<string>(
    f?.allergenMode ?? (item === null || item.allergens === null ? "unconfirmed" : item.allergens.length === 0 ? "none" : "list")
  );

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-sm">
      {/* Which item (empty = new), and the version this form was opened with. */}
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <input type="hidden" name="expectedUpdatedAt" value={item?.updatedAt ?? ""} />

      <label className="text-sm font-semibold">
        Name
        <input name="name" required maxLength={NAME_MAX} defaultValue={start.name} className={input} />
      </label>

      <label className="text-sm font-semibold">
        Description <span className="font-normal text-stone-500">(optional, e.g. what comes with it)</span>
        <textarea name="description" rows={2} maxLength={TEXT_MAX} defaultValue={start.description} className={area} />
      </label>

      <label className="text-sm font-semibold">
        Ingredients <span className="font-normal text-stone-500">(optional, shown on the menu)</span>
        <textarea
          name="ingredients"
          rows={2}
          maxLength={TEXT_MAX}
          placeholder="e.g. Chicken, flour, garlic, black pepper"
          defaultValue={start.ingredients}
          className={area}
        />
      </label>

      {/* ---- Category: from the list, or a new one ---- */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1 text-sm font-semibold">
          Category
          <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__new__">New category…</option>
          </select>
        </label>
        {category === "__new__" && (
          <label className="flex-1 text-sm font-semibold">
            New category name
            <input
              name="newCategory"
              required
              maxLength={CATEGORY_MAX}
              defaultValue={f?.newCategory ?? ""}
              placeholder="e.g. Desserts"
              className={input}
            />
          </label>
        )}
      </div>

      {/* ---- Pricing (decision, Option C): one price OR sizes ---- */}
      <fieldset className="rounded-lg border border-stone-200 p-3">
        <legend className="px-1 text-sm font-semibold">Price</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="pricing" value="single" checked={pricing === "single"} onChange={() => setPricing("single")} className="size-5 accent-brand" />
            One price (e.g. drinks)
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="pricing" value="sizes" checked={pricing === "sizes"} onChange={() => setPricing("sizes")} className="size-5 accent-brand" />
            Sizes (Small / Medium / Large)
          </label>
        </div>
        {pricing === "single" ? (
          <label className="mt-2 block text-sm font-semibold">
            Price (J$)
            <input name="price" inputMode="decimal" defaultValue={start.price} placeholder="e.g. 220" className={`${input} sm:w-40`} />
          </label>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                ["priceSmall", "Small", start.priceSmall],
                ["priceMedium", "Medium", start.priceMedium],
                ["priceLarge", "Large", start.priceLarge],
              ] as const
            ).map(([name, label, value]) => (
              <label key={name} className="text-sm font-semibold">
                {label} (J$)
                <input name={name} inputMode="decimal" defaultValue={value} className={input} />
              </label>
            ))}
            <p className="col-span-3 text-xs text-stone-500">Leave a size empty if it isn&apos;t offered.</p>
          </div>
        )}
      </fieldset>

      {/* ---- Allergens (SAF-2: never say "None" unless it's confirmed) ---- */}
      <fieldset className="rounded-lg border border-stone-200 p-3">
        <legend className="px-1 text-sm font-semibold">Allergens</legend>
        {(
          [
            ["unconfirmed", "Not confirmed yet (customers are told to ask at the counter)"],
            ["none", "None (confirmed)"],
            ["list", "Contains…"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="allergenMode"
              value={value}
              checked={allergenMode === value}
              onChange={() => setAllergenMode(value)}
              className="size-5 accent-brand"
            />
            {label}
          </label>
        ))}
        {allergenMode === "list" && (
          <label className="mt-1 block text-sm font-semibold">
            Allergens, separated by commas
            <input name="allergens" defaultValue={start.allergens} placeholder="e.g. Gluten, Milk, Peanuts" className={input} />
          </label>
        )}
      </fieldset>

      {/* ---- Check boxes ---- */}
      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="madeToOrder" defaultChecked={start.madeToOrder} className="size-5 accent-brand" />
          Made to order <span className="text-sm text-stone-500">(pickup needs at least 15 minutes, FR-01)</span>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="dailySpecial" defaultChecked={start.dailySpecial} className="size-5 accent-brand" />
          Daily special <span className="text-sm text-stone-500">(shown under &quot;Today&apos;s specials&quot; when available)</span>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="available" defaultChecked={start.available} className="size-5 accent-brand" />
          Available <span className="text-sm text-stone-500">(untick = greyed out, can&apos;t be ordered)</span>
        </label>
      </div>

      <div aria-live="polite">
        {state.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{state.error}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Saving…" : item ? "Save changes" : "Add to menu"}
        </button>
        <Link href="/manager/menu" className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-5 font-semibold">
          Cancel
        </Link>
      </div>
    </form>
  );
}
