/*
 * src/components/StatusButtons.tsx
 *
 * WHAT: The "Actions" on the staff order details page:
 *         - ONE button for the next step only, e.g. "Mark In progress" (Step 26);
 *         - for a PICKUP order whose next step is Completed: "Hand over order",
 *           which opens the handover form (Step 27): type the Order ID the
 *           customer gives you, and for unpaid cash tick "Cash received (J$X)";
 *         - "Cancel order", which asks "Are you sure?" first;
 *         - nothing but "This order is finished" once it is finished.
 *       No Abandoned button yet (Step 28).
 *
 * LAYER: Presentation. The next step comes from nextStatus() (order-status.ts)
 *        and the handover rule from checkPickupHandover() (status-rules.ts),
 *        both shared with the server. Tapping calls the updateOrderStatus
 *        Server Action (Application layer), which checks again and saves.
 *
 * WHY: FR-03 / AC-3 (one step at a time), SAF-1 ("Order ID confirmed before
 * handover"), FR-06 (only PAID orders count, so cash is marked paid when it's
 * received). The page's own check is only a quick hint; the SERVER decides,
 * because a request can be sent without these buttons.
 *
 * Messages: each new tap clears the last message. A "someone else changed it"
 * message stays visible after the page shows the new status, so staff know
 * WHY the status isn't what they tapped.
 *
 * "use client" = it runs in the browser: it reacts to taps and typing.
 */
"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, useTransition } from "react";
import { formatPrice } from "@/lib/menu-helpers";
import { isFinalStatus, nextStatus, STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import type { Fulfilment } from "@/lib/order-rules";
import { updateOrderStatus } from "@/lib/orders/status-actions";
import {
  cashToCollect,
  checkPickupHandover,
  needsPickupHandover,
  type PaymentForHandover,
} from "@/lib/orders/status-rules";

type Props = {
  orderId: number;
  status: OrderStatus; // the status staff can SEE right now
  fulfilment: Fulfilment;
  payment: PaymentForHandover | null; // for the handover form (Step 27)
};

export default function StatusButtons({ orderId, status, fulfilment, payment }: Props) {
  const router = useRouter();
  // isPending = true while the server works: buttons show "Saving…" and are
  // disabled, so a double tap can't send two changes.
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // true = showing "Cancel order #1004? Yes, cancel / Keep order".
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // Step 27: the handover form (open?, what was typed, the cash tick).
  const [handingOver, setHandingOver] = useState(false);
  const [typedOrderId, setTypedOrderId] = useState("");
  const [cashReceived, setCashReceived] = useState(false);

  /*
   * Start clean when staff leave this page. (In this Next.js version a page
   * you leave is HIDDEN, not removed, so its state would otherwise still be
   * there next time: a half-typed Order ID or a ticked cash box.) The
   * cleanup function runs when the page is hidden.
   */
  useLayoutEffect(() => {
    return () => {
      setHandingOver(false);
      setTypedOrderId("");
      setCashReceived(false);
      setConfirmingCancel(false);
      setError(null);
    };
  }, []);

  // Finished: no actions (FR-03: finished orders are in Past Orders).
  if (isFinalStatus(status)) {
    return <p className="text-sm text-stone-600">This order is finished. Its status can&apos;t change.</p>;
  }

  const next = nextStatus(status, fulfilment);
  // Step 27: completing a PICKUP order goes through the handover form.
  const isHandover = next !== null && needsPickupHandover({ status, fulfilment }, next);
  const collectCash = cashToCollect(payment);

  /*
   * change(newStatus, handover?): ask the server to make the change.
   * We send the status we SAW, so the server can tell us if someone else
   * changed it in the meantime. On success, router.refresh() redraws the page
   * with the new status (Realtime would too, a moment later).
   */
  function change(newStatus: OrderStatus, handover?: { typedOrderId: string; cashReceived: boolean }) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateOrderStatus(orderId, status, newStatus, handover);
        if (result.ok) {
          setHandingOver(false);
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

  /*
   * completeHandover(): quick check in the browser first (instant message,
   * no waiting), then send. The server runs the SAME check again.
   */
  function completeHandover() {
    const handover = { typedOrderId, cashReceived };
    const problem = checkPickupHandover(orderId, payment, handover);
    if (problem) {
      setError(problem);
      return;
    }
    change("COMPLETED", handover);
  }

  // Back out of the handover form, forgetting what was typed.
  function closeHandover() {
    setHandingOver(false);
    setTypedOrderId("");
    setCashReceived(false);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ---- The ONE next step (or the handover for pickup -> Completed) ---- */}
      {next && !isHandover && (
        <button
          type="button"
          onClick={() => change(next)}
          disabled={isPending}
          className="min-h-12 w-full rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {isPending ? "Saving…" : `Mark ${STATUS_LABELS[next]}`}
        </button>
      )}

      {isHandover && !handingOver && (
        <button
          type="button"
          onClick={() => {
            setHandingOver(true);
            setConfirmingCancel(false);
            setError(null);
          }}
          disabled={isPending}
          className="min-h-12 w-full rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          Hand over order
        </button>
      )}

      {/* ---- Step 27: the handover form (SAF-1 + cash) ---- */}
      {isHandover && handingOver && (
        <form
          // onSubmit: the Enter key on the phone keyboard also submits.
          onSubmit={(event) => {
            event.preventDefault();
            completeHandover();
          }}
          className="flex flex-col gap-3 rounded-xl border-2 border-brand bg-orange-50 p-4"
          aria-labelledby="handover-title"
        >
          <h3 id="handover-title" className="font-bold">
            Hand over order
          </h3>

          {/* SAF-1: staff type what the CUSTOMER says or shows. */}
          <label className="block text-sm font-semibold">
            Order ID the customer gives you
            {/* inputMode="numeric" = phones show the number keypad.
                text-base (16px) stops iPhones zooming in on the box. */}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={20}
              value={typedOrderId}
              onChange={(event) => setTypedOrderId(event.target.value)}
              placeholder="e.g. 1004"
              className="mt-1 block min-h-12 w-full rounded-lg border border-stone-300 bg-white px-3 text-base"
            />
          </label>

          {/* FR-06: unpaid cash is collected NOW and marked PAID. */}
          {collectCash && payment && (
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg bg-white p-3">
              <input
                type="checkbox"
                checked={cashReceived}
                onChange={(event) => setCashReceived(event.target.checked)}
                className="size-5 accent-brand"
              />
              <span className="font-semibold">Cash received ({formatPrice(payment.amount)})</span>
            </label>
          )}

          {/* Lynk: nothing to collect here; the Supervisor verifies it. */}
          {payment?.method === "LYNK" && payment.status === "UNPAID" && (
            <p className="rounded-lg bg-white p-3 text-sm text-stone-700">
              Lynk payment: the Supervisor verifies it separately. You can still hand the order over.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="min-h-12 rounded-lg bg-brand px-3 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {isPending ? "Saving…" : "Complete handover"}
            </button>
            <button
              type="button"
              onClick={closeHandover}
              disabled={isPending}
              className="min-h-12 rounded-lg border border-stone-300 bg-white px-3 font-semibold hover:bg-stone-50 disabled:opacity-50"
            >
              Back
            </button>
          </div>
        </form>
      )}

      {/* ---- Cancel, with a second "are you sure?" step ---- */}
      {!handingOver &&
        (!confirmingCancel ? (
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
        ))}

      {/* role="alert": screen readers read the problem out at once. */}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}
