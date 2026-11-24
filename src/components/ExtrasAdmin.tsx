/*
 * src/components/ExtrasAdmin.tsx
 *
 * WHAT: The Manager's "Extras" tab (Step 40b, SRS QA-3): one small form per
 *       extra (name, Side / Sauce, extra price, available) with "Save" and
 *       "Remove"; an "Add an extra" form; and "Removed extras" with
 *       "Restore". E.g. rename "Coleslaw (Sample)" to the real name once the
 *       client gives it (CLAUDE.md: sample extras until then).
 *
 * LAYER: Presentation. Saving / removing are Server Actions
 *        (extras-location-actions.ts); the database decides (RLS).
 *
 * "use client" = it runs in the browser: it shows messages per row.
 */
"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import type { AdminExtra } from "@/lib/menu-admin/get-extras-locations-admin";
import {
  removeExtra,
  restoreExtra,
  saveExtra,
  type RowActionResult,
  type RowFormState,
} from "@/lib/menu-admin/extras-location-actions";
import { EXTRA_NAME_MAX } from "@/lib/menu-admin/extras-location-rules";

const input = "mt-1 block min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base";
const button = "min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-60";

export default function ExtrasAdmin({ extras }: { extras: AdminExtra[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  /* Remove / Restore: run, show the message, redraw with fresh data. */
  function run(action: () => Promise<RowActionResult>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "We couldn't reach the server. Check your connection and try again." });
      }
    });
  }

  const current = extras.filter((e) => !e.isArchived);
  const removed = extras.filter((e) => e.isArchived);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone-600">
        Extras are offered on every food item (sides and sauces); drinks have none. Changes show on the menu straight
        away.
      </p>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${message.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
          {message.text}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {current.map((extra) => (
          <li key={extra.id}>
            <ExtraForm extra={extra} onRemove={() => run(() => removeExtra(extra.id))} busy={isPending} />
          </li>
        ))}
      </ul>

      <section aria-labelledby="add-extra" className="rounded-xl border-2 border-dashed border-stone-300 p-1">
        <h2 id="add-extra" className="px-3 pt-2 text-lg font-bold">
          Add an extra
        </h2>
        <ExtraForm extra={null} busy={isPending} />
      </section>

      <section aria-labelledby="removed-extras" className="rounded-xl bg-white p-4 shadow-sm">
        <h2 id="removed-extras" className="text-lg font-bold">
          Removed extras ({removed.length})
        </h2>
        <p className="text-sm text-stone-600">Hidden from customers; kept because old orders include them.</p>
        {removed.map((extra) => (
          <div key={extra.id} className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-stone-600">{extra.name}</span>
            <button type="button" onClick={() => run(() => restoreExtra(extra.id))} disabled={isPending} className={`${button} border border-brand bg-white text-brand`}>
              Restore
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

/*
 * ExtraForm: one extra (or a new one when extra is null). Its own
 * useActionState, so each row shows its own "Saved" / error message.
 */
function ExtraForm({ extra, onRemove, busy }: { extra: AdminExtra | null; onRemove?: () => void; busy: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RowFormState, FormData>(saveExtra, {});
  const [confirming, setConfirming] = useState(false);

  /* After a good save: redraw the page with the saved values. */
  useEffect(() => {
    if (state.savedAt) router.refresh();
  }, [state.savedAt, router]);

  // After an error: what was typed. Otherwise: the saved extra (or empty).
  const f = state.error ? state.fields : undefined;

  return (
    <form action={formAction} className="rounded-xl bg-white p-4 shadow-sm">
      <input type="hidden" name="id" value={extra?.id ?? ""} />
      <input type="hidden" name="expectedUpdatedAt" value={extra?.updatedAt ?? ""} />
      {/* key: the boxes are rebuilt from the saved values after a save (a
          new updatedAt), and the "Add" form empties itself after adding. The
          row's message (outside this box) stays. */}
      <div
        key={`${extra?.updatedAt ?? state.savedAt ?? 0}-${state.error ? "error" : "ok"}`}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
      >
        <label className="text-sm font-semibold">
          Name
          <input name="name" required maxLength={EXTRA_NAME_MAX} defaultValue={f?.name ?? extra?.name ?? ""} placeholder="e.g. Coleslaw" className={input} />
        </label>
        <label className="text-sm font-semibold">
          Type
          <select name="kind" defaultValue={f?.kind ?? extra?.kind ?? "side"} className={input}>
            <option value="side">Side</option>
            <option value="sauce">Sauce</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Extra price (J$)
          <input
            name="extraPrice"
            inputMode="decimal"
            required
            defaultValue={f?.extraPrice ?? (extra ? String(extra.extraPrice) : "")}
            placeholder="0 = free"
            className={input}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="available"
            defaultChecked={f ? f.available === "on" : (extra?.isAvailable ?? true)}
            className="size-5 accent-brand"
          />
          Available
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending || busy} className={`${button} bg-brand text-white hover:bg-brand-dark`}>
          {pending ? "Saving…" : extra ? "Save" : "Add extra"}
        </button>
        {extra && onRemove && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={`${button} border border-stone-300 bg-white text-red-800`}>
            Remove
          </button>
        )}
        {extra && onRemove && confirming && (
          <>
            <span className="text-sm font-semibold">Remove {extra.name}?</span>
            <button type="button" onClick={onRemove} disabled={busy} className={`${button} bg-red-700 text-white`}>
              Yes, remove
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={`${button} border border-stone-300 bg-white`}>
              Cancel
            </button>
          </>
        )}
        <span aria-live="polite" className="text-sm">
          {state.error && <span className="text-red-800">{state.error}</span>}
          {!state.error && state.message && <span className="text-green-800">{state.message}</span>}
        </span>
      </div>
    </form>
  );
}
