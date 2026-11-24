/*
 * src/components/AssignDriver.tsx
 *
 * WHAT: The "Assign driver" choice on the staff order details page (Step 31,
 *       FR-04 SR-4.1 / AC-1, TS-4.1.2). A list of delivery staff, each with
 *       how many ACTIVE deliveries they have, e.g. "Jane Brown (2 active)",
 *       fewest first, so staff can pick an available one. Then "Assign"
 *       (first time) or "Change driver". Only shown for DELIVERY orders that
 *       haven't left yet (the page decides with canChangeDriver()).
 *
 * LAYER: Presentation. Tapping calls the assignDriver Server Action
 *        (Application layer), which checks the rules and saves through the
 *        database function assign_delivery() (Data layer).
 *
 * We send the driver staff SAW (currentDriverId), so the server can tell us
 * if someone else changed it in the meantime (same idea as the status
 * buttons).
 *
 * "use client" = it runs in the browser: it reacts to choosing and tapping.
 */
"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, useTransition } from "react";
import { assignDriver } from "@/lib/orders/delivery-actions";
import type { DriverOption } from "@/lib/orders/get-drivers";

type Props = {
  orderId: number;
  currentDriverId: string | null; // who has it now (null = no driver yet)
  drivers: DriverOption[]; // from getDrivers(), fewest active first
};

export default function AssignDriver({ orderId, currentDriverId, drivers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // choice = what staff picked in the list. null = "not touched", so the list
  // shows the CURRENT driver (and follows it if it changes live).
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false); // shows "Driver saved." briefly

  /*
   * Start clean when staff leave the page (in this Next.js version a page you
   * leave is hidden, not removed, so its state would otherwise stay).
   */
  useLayoutEffect(() => {
    return () => {
      setChoice(null);
      setError(null);
      setSaved(false);
    };
  }, []);

  const selected = choice ?? currentDriverId ?? "";
  // The button only works when a NEW driver is picked.
  const canSave = selected !== "" && selected !== currentDriverId && !isPending;

  /* save(): ask the server to assign / change the driver. */
  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await assignDriver(orderId, currentDriverId, selected);
        if (result.ok) {
          setChoice(null); // the list now follows the saved (current) driver
          setSaved(true);
        } else {
          setError(result.error);
          setChoice(null);
        }
        router.refresh(); // show the latest driver either way
      } catch {
        setError("We couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  // Nobody to choose from yet.
  if (drivers.length === 0) {
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
        There are no delivery staff accounts yet, so this order can&apos;t be assigned. Ask a manager to add a
        driver.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`driver-${orderId}`} className="text-sm font-semibold">
        {currentDriverId ? "Change driver" : "Assign driver"}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* text-base (16px): stops iPhones zooming in on the list. */}
        <select
          id={`driver-${orderId}`}
          value={selected}
          onChange={(event) => {
            setChoice(event.target.value);
            setError(null);
            setSaved(false);
          }}
          disabled={isPending}
          className="min-h-12 flex-1 rounded-lg border border-stone-300 bg-white px-3 text-base"
        >
          {!currentDriverId && <option value="">Choose a driver…</option>}
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name} ({driver.activeCount} active)
              {driver.id === currentDriverId ? " – current" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="min-h-12 rounded-lg bg-brand px-5 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {isPending ? "Saving…" : currentDriverId ? "Change driver" : "Assign"}
        </button>
      </div>
      <p className="text-xs text-stone-500">
        &quot;Active&quot; = deliveries that aren&apos;t finished yet. Fewest first.
      </p>

      {saved && !error && (
        <p role="status" className="rounded-lg bg-green-50 p-2 text-sm text-green-900">
          Driver saved.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}
