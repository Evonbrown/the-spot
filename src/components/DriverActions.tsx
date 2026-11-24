/*
 * src/components/DriverActions.tsx
 *
 * WHAT: The DRIVER's buttons on one delivery card (Step 33, FR-04 SR-4.2
 *       update part, SR-4.4 / AC-2-AC-4, SAF-1, FR-06). One step at a time:
 *         - Pending / In progress: "Not ready yet" (no button);
 *         - Ready for pickup: "Mark Being delivered", then "Leaving now with
 *           order #1004? Yes, leaving now / Not yet" (decision: statuses
 *           can't go back, so a mis-tap on a phone must not count);
 *         - Being delivered: "Hand over", which opens the handover form:
 *           type the Order ID the customer gives you, tick "Cash received
 *           (J$X)" for unpaid cash, then "Complete handover".
 *
 * LAYER: Presentation. The handover check is checkHandover() (status-rules.ts),
 *        the SAME one counter staff use for pickup. Tapping calls the
 *        updateDeliveryStatus Server Action (Application layer), which checks
 *        everything again and saves (Data layer, migration 0015).
 *
 * The page's own check is only a quick hint; the SERVER decides.
 *
 * "use client" = it runs in the browser: it reacts to taps and typing.
 */
"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, useTransition } from "react";
import { formatPrice } from "@/lib/menu-helpers";
import type { OrderStatus } from "@/lib/order-status";
import { updateDeliveryStatus } from "@/lib/orders/delivery-actions";
import { cashToCollect, checkHandover, type PaymentForHandover } from "@/lib/orders/status-rules";

type Props = {
  orderId: number;
  status: OrderStatus; // the status the driver can SEE right now
  payment: PaymentForHandover | null;
};

export default function DriverActions({ orderId, status, payment }: Props) {
  const router = useRouter();
  // isPending = true while the server works: buttons show "Saving…" and are
  // disabled, so a double tap can't send two changes.
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false); // "Leaving now?"
  const [handingOver, setHandingOver] = useState(false); // handover form open?
  const [typedOrderId, setTypedOrderId] = useState("");
  const [cashReceived, setCashReceived] = useState(false);

  /*
   * Start clean when the driver leaves the page (in this Next.js version a
   * page you leave is hidden, not removed, so a half-typed Order ID or a
   * ticked cash box would otherwise still be there next time).
   */
  useLayoutEffect(() => {
    return () => {
      setConfirmingLeave(false);
      setHandingOver(false);
      setTypedOrderId("");
      setCashReceived(false);
      setError(null);
    };
  }, []);

  const collectCash = cashToCollect(payment);

  /*
   * send(newStatus, handover?): ask the server. We send the status we SAW, so
   * the server can tell us if it changed meanwhile. router.refresh() redraws
   * the list (Realtime would too, a moment later).
   */
  function send(newStatus: OrderStatus, handover?: { typedOrderId: string; cashReceived: boolean }) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateDeliveryStatus(orderId, status, newStatus, handover);
        if (result.ok) {
          setConfirmingLeave(false);
          setHandingOver(false);
        } else {
          setError(result.error);
          setConfirmingLeave(false);
        }
        router.refresh();
      } catch {
        setError("We couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  /* completeHandover(): quick check first (instant message), then send. */
  function completeHandover() {
    const handover = { typedOrderId, cashReceived };
    const problem = checkHandover(orderId, payment, handover);
    if (problem) {
      setError(problem);
      return;
    }
    send("COMPLETED", handover);
  }

  // Shared look for the big buttons (min-h-12 = easy to tap on a phone).
  const primary =
    "min-h-12 w-full rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400";
  const secondary =
    "min-h-12 rounded-lg border border-stone-300 bg-white px-3 font-semibold hover:bg-stone-50 disabled:opacity-50";

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-stone-100 pt-3">
      {/* ---- Not ready yet ---- */}
      {(status === "PENDING" || status === "IN_PROGRESS") && (
        <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
          Not ready yet: wait for the counter to mark it Ready for pickup.
        </p>
      )}

      {/* ---- Ready: "Mark Being delivered", with "Leaving now?" ---- */}
      {status === "READY_FOR_PICKUP" &&
        (!confirmingLeave ? (
          <button
            type="button"
            onClick={() => {
              setConfirmingLeave(true);
              setError(null);
            }}
            disabled={isPending}
            className={primary}
          >
            Mark Being delivered
          </button>
        ) : (
          <div role="group" aria-label="Confirm leaving" className="rounded-xl bg-orange-50 p-3">
            <p className="font-semibold">Leaving now with order #{orderId}? This can&apos;t be undone.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => send("BEING_DELIVERED")} disabled={isPending} className={primary}>
                {isPending ? "Saving…" : "Yes, leaving now"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingLeave(false)}
                disabled={isPending}
                className={secondary}
              >
                Not yet
              </button>
            </div>
          </div>
        ))}

      {/* ---- Being delivered: the handover (SAF-1 + cash) ---- */}
      {status === "BEING_DELIVERED" && !handingOver && (
        <button
          type="button"
          onClick={() => {
            setHandingOver(true);
            setError(null);
          }}
          disabled={isPending}
          className={primary}
        >
          Hand over
        </button>
      )}

      {status === "BEING_DELIVERED" && handingOver && (
        <form
          // onSubmit: the Enter key on the phone keyboard also submits.
          onSubmit={(event) => {
            event.preventDefault();
            completeHandover();
          }}
          className="flex flex-col gap-3 rounded-xl border-2 border-brand bg-orange-50 p-4"
          aria-labelledby={`handover-title-${orderId}`}
        >
          <h4 id={`handover-title-${orderId}`} className="font-bold">
            Hand over order
          </h4>

          {/* SAF-1: type what the CUSTOMER says or shows. */}
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

          {/* Lynk: nothing to collect; the Supervisor verifies it. */}
          {payment?.method === "LYNK" && payment.status === "UNPAID" && (
            <p className="rounded-lg bg-white p-3 text-sm text-stone-700">
              Lynk payment: don&apos;t collect money. The Supervisor verifies it separately.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button type="submit" disabled={isPending} className={primary}>
              {isPending ? "Saving…" : "Complete handover"}
            </button>
            <button
              type="button"
              onClick={() => {
                setHandingOver(false);
                setTypedOrderId("");
                setCashReceived(false);
                setError(null);
              }}
              disabled={isPending}
              className={secondary}
            >
              Back
            </button>
          </div>
        </form>
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
