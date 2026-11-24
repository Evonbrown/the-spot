/*
 * src/components/LocationsAdmin.tsx
 *
 * WHAT: The Manager's "Delivery" tab (Step 40b, SRS QA-3): one small form per
 *       delivery location (name, fee, "Fee confirmed", active) with "Save",
 *       and an "Add a location" form.
 *         - "Fee confirmed" unticked = checkout shows "(sample, not final)"
 *           (decision: sample J$200 until the client gives the real fee);
 *         - "Active" unticked = customers can't choose it any more.
 *       There's NO delete: old orders point at their location, so the
 *       Manager switches it off instead.
 *
 * LAYER: Presentation. Saving = saveLocation (extras-location-actions.ts);
 *        the database decides (RLS + CHECKs).
 *
 * "use client" = it runs in the browser: it shows messages per row.
 */
"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import type { AdminLocation } from "@/lib/menu-admin/get-extras-locations-admin";
import { saveLocation, type RowFormState } from "@/lib/menu-admin/extras-location-actions";
import { LOCATION_NAME_MAX } from "@/lib/menu-admin/extras-location-rules";

const input = "mt-1 block min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base";
const button = "min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-60";

export default function LocationsAdmin({ locations }: { locations: AdminLocation[] }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Decision (Step 40): new locations are allowed, but the SRS lists three. */}
      <p role="note" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
        The SRS (FR-01 / FR-04) lists three delivery locations: UWI Mona, UTech and UWI Hospital. You can add others
        here, but check with the client first.
      </p>
      <ul className="flex flex-col gap-3">
        {locations.map((location) => (
          <li key={location.id}>
            <LocationForm location={location} />
          </li>
        ))}
      </ul>
      <section aria-labelledby="add-location" className="rounded-xl border-2 border-dashed border-stone-300 p-1">
        <h2 id="add-location" className="px-3 pt-2 text-lg font-bold">
          Add a location
        </h2>
        <LocationForm location={null} />
      </section>
    </div>
  );
}

/* One location (or a new one when location is null), with its own message. */
function LocationForm({ location }: { location: AdminLocation | null }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RowFormState, FormData>(saveLocation, {});

  /* After a good save: redraw the page with the saved values. */
  useEffect(() => {
    if (state.savedAt) router.refresh();
  }, [state.savedAt, router]);

  const f = state.error ? state.fields : undefined;

  return (
    <form action={formAction} className={`rounded-xl bg-white p-4 shadow-sm ${location && !location.isActive ? "opacity-70" : ""}`}>
      <input type="hidden" name="id" value={location?.id ?? ""} />
      <input type="hidden" name="expectedUpdatedAt" value={location?.updatedAt ?? ""} />
      {/* key: see ExtrasAdmin (boxes rebuilt after a save, message kept). */}
      <div
        key={`${location?.updatedAt ?? state.savedAt ?? 0}-${state.error ? "error" : "ok"}`}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto_auto] sm:items-end"
      >
        <label className="text-sm font-semibold">
          Name
          <input name="name" required maxLength={LOCATION_NAME_MAX} defaultValue={f?.name ?? location?.name ?? ""} className={input} />
        </label>
        <label className="text-sm font-semibold">
          Delivery fee (J$)
          <input
            name="deliveryFee"
            inputMode="decimal"
            required
            defaultValue={f?.deliveryFee ?? (location ? String(location.deliveryFee) : "")}
            className={input}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="feeConfirmed"
            defaultChecked={f ? f.feeConfirmed === "on" : (location?.feeConfirmed ?? false)}
            className="size-5 accent-brand"
          />
          Fee confirmed
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="active"
            defaultChecked={f ? f.active === "on" : (location?.isActive ?? true)}
            className="size-5 accent-brand"
          />
          Active
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={`${button} bg-brand text-white hover:bg-brand-dark`}>
          {pending ? "Saving…" : location ? "Save" : "Add location"}
        </button>
        {location && !location.feeConfirmed && (
          <span className="text-xs text-stone-500">Checkout shows this fee as &quot;(sample, not final)&quot;.</span>
        )}
        <span aria-live="polite" className="text-sm">
          {state.error && <span className="text-red-800">{state.error}</span>}
          {!state.error && state.message && <span className="text-green-800">{state.message}</span>}
        </span>
      </div>
    </form>
  );
}
