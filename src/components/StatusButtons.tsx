/*
 * src/components/StatusButtons.tsx
 *
 * WHAT: The "Actions" on the staff order details page (Step 26):
 *         - ONE button for the next step only, e.g. "Mark In progress";
 *         - "Cancel order", which asks "Are you sure?" first;
 *         - nothing but "This order is finished" once it is finished.
 *       No Abandoned button yet (Step 28).
 *
 * LAYER: Presentation. The next step comes from nextStatus() (order-status.ts,
 *        shared with the server). Tapping calls the updateOrderStatus Server
 *        Action (Application layer), which checks the rules and saves.
 *
 * WHY only the next step? FR-03 / AC-3: status only moves forward, one step at
 * a time. Showing only that button makes mistakes hard; the SERVER still
 * checks, because a request can be sent without these buttons.
 *
 * Messages: each new tap clears the last message. A "someone else changed it"
 * message stays visible after the page shows the new status, so staff know
 * WHY the status isn't what they tapped.
 *
 * "use client" = it runs in the browser: it reacts to taps.
 */
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { isFinalStatus, nextStatus, STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import type { Fulfilment } from "@/lib/order-rules";
import { updateOrderStatus } from "@/lib/orders/status-actions";

type Props = {
  orderId: number;
  status: OrderStatus; // the status staff can SEE right now
  fulfilment: Fulfilment;
};

export default function StatusButtons({ orderId, status, fulfilment }: Props) {
  const router = useRouter();
  // isPending = true while the server works: buttons show "Saving…" and are
  // disabled, so a double tap can't send two changes.
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // true = showing "Cancel order #1004? Yes, cancel / Keep order".
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Finished: no actions (FR-03: finished orders are in Past Orders).
  if (isFinalStatus(status)) {
    return <p className="text-sm text-stone-600">This order is finished. Its status can&apos;t change.</p>;
  }

  const next = nextStatus(status, fulfilment);

  /*
   * change(newStatus): ask the server to make the change.
   * We send the status we SAW, so the server can tell us if someone else
   * changed it in the meantime. On success, router.refresh() redraws the page
   * with the new status (Realtime would too, a moment later).
   */
  function change(newStatus: OrderStatus) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateOrderStatus(orderId, status, newStatus);
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.error);
          setConfirmingCancel(false);
          router.refresh(); // show the latest status (e.g. someone else changed it)
        }
      } catch {
        setError("We couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The ONE next step. Big button: staff use phones. */}
      {next && (
        <button
          type="button"
          onClick={() => change(next)}
          disabled={isPending}
          className="min-h-12 w-full rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {isPending ? "Saving…" : `Mark ${STATUS_LABELS[next]}`}
        </button>
      )}

      {/* Cancel, with a second "are you sure?" step so one slip can't
          cancel a customer's order. */}
      {!confirmingCancel ? (
        <button
          type="button"
          onClick={() => setConfirmingCancel(true)}
          disabled={isPending}
          className="min-h-11 w-full rounded-xl border border-red-300 bg-white px-4 font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel order
        </button>
      ) : (
        <div role="group" aria-label="Confirm cancelling" className="rounded-xl bg-red-50 p-3">
          <p className="font-semibold text-red-900">Cancel order #{orderId}? This can&apos;t be undone.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => change("CANCELLED")}
              disabled={isPending}
              className="min-h-11 rounded-lg bg-red-700 px-3 font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Yes, cancel"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              disabled={isPending}
              className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 font-semibold hover:bg-stone-50 disabled:opacity-50"
            >
              Keep order
            </button>
          </div>
        </div>
      )}

      {/* role="alert": screen readers read the problem out at once. */}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}
