/*
 * src/components/LynkPaymentList.tsx
 *
 * WHAT: The Supervisor's "Lynk payments to check" list (Step 38a, FR-02,
 *       FR-06, UC-07). One card per unpaid Lynk payment:
 *         - Order ID (= the Lynk reference), amount, order time, pickup or
 *           delivery, order status, customer name + "Call";
 *         - an amber note if it was already marked "not received";
 *         - "Verify payment" -> "Received J$1,200 for #1043 in Lynk?
 *           Yes, received / Cancel" (a mis-tap must not count: once PAID it
 *           counts in sales);
 *         - "Not received" -> an optional note + "Mark not received".
 *       Below: "Verified today" (what's already done).
 *
 * LAYER: Presentation. The buttons call Server Actions (supervisor-actions.ts,
 *        Application layer); the database decides (migration 0020).
 *
 * "use client" = it runs in the browser: it reacts to taps and typing.
 */
"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, useTransition } from "react";
import StatusBadge from "@/components/StatusBadge";
import { formatPrice } from "@/lib/menu-helpers";
import { formatJamaicaDateTime, formatJamaicaTime } from "@/lib/order-rules";
import type { LynkToCheck, LynkVerified } from "@/lib/payments/get-lynk-payments";
import { flagNotReceived, verifyLynkPayment, type SupervisorResult } from "@/lib/payments/supervisor-actions";
import { NOTE_MAX } from "@/lib/payments/supervisor-rules";

type Props = {
  toCheck: LynkToCheck[];
  verifiedToday: LynkVerified[];
};

export default function LynkPaymentList({ toCheck, verifiedToday }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="lynk-title">
        <h2 id="lynk-title" className="text-xl font-bold">
          Lynk payments to check ({toCheck.length})
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Open your Lynk app and look for each amount with the Order ID as the reference. Oldest first.
        </p>
        {toCheck.length === 0 ? (
          <p className="mt-3 rounded-xl bg-white p-5 text-stone-600 shadow-sm">
            Nothing to check: every Lynk payment is verified.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {toCheck.map((payment) => (
              // key includes the flag time, so a card starts fresh after it changes.
              <LynkCard key={`${payment.orderId}-${payment.notReceived?.at ?? 0}`} payment={payment} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="verified-title">
        <h2 id="verified-title" className="text-lg font-bold">
          Verified today ({verifiedToday.length})
        </h2>
        {verifiedToday.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">None yet today.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-stone-100 rounded-xl bg-white px-4 shadow-sm">
            {verifiedToday.map((v) => (
              <li key={v.orderId} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="font-semibold">
                  #{v.orderId} · {formatPrice(v.amount)}
                </span>
                <span className="text-stone-600">
                  {formatJamaicaTime(v.verifiedAt)} · {v.byMe ? "by you" : "by another supervisor"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/*
 * LynkCard: one payment and its two buttons.
 * mode: "idle" (the two buttons), "confirm" (Yes, received?), "flag" (note).
 */
function LynkCard({ payment }: { payment: LynkToCheck }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "confirm" | "flag">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  /* Start clean when the page is left (hidden pages keep their state). */
  useLayoutEffect(() => {
    return () => {
      setMode("idle");
      setNote("");
      setError(null);
    };
  }, []);

  /*
   * run(action): call the Server Action, show its message if it failed, and
   * redraw the page with fresh data (router.refresh()): a verified payment
   * then moves from this list to "Verified today".
   */
  function run(action: () => Promise<SupervisorResult>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setMode("idle");
          setNote("");
        } else {
          setError(result.error);
        }
        router.refresh();
      } catch {
        setError("We couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  const button = "min-h-11 rounded-lg px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60";
  const tooLong = note.trim().length > NOTE_MAX;

  return (
    <li className="rounded-xl bg-white p-4 shadow-sm">
      {/* ---- The payment ---- */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-2xl font-extrabold">{formatPrice(payment.amount)}</p>
          <p className="text-sm text-stone-700">
            Reference: <span className="font-bold">{payment.orderId}</span> (Order #{payment.orderId})
          </p>
        </div>
        <StatusBadge status={payment.orderStatus} />
      </div>
      <p className="mt-2 text-sm text-stone-700">
        {payment.customerName ?? "Customer"}
        {payment.customerPhone && (
          <>
            {" · "}
            <a href={`tel:${payment.customerPhone}`} className="font-semibold text-brand underline">
              Call {payment.customerPhone}
            </a>
          </>
        )}
      </p>
      <p className="text-sm text-stone-600">
        Ordered {formatJamaicaDateTime(payment.orderedAt)} · {payment.fulfilment === "DELIVERY" ? "Delivery" : "Pickup"}
      </p>

      {/* ---- Already marked "not received" ---- */}
      {payment.notReceived && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-950">
          Marked <span className="font-semibold">not received</span> at {formatJamaicaTime(payment.notReceived.at)}
          {payment.notReceived.note && `: "${payment.notReceived.note}"`}. If the money has arrived since, verify it.
        </p>
      )}

      {/* ---- The buttons ---- */}
      {mode === "idle" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("confirm")}
            disabled={isPending}
            className={`${button} bg-brand text-white hover:bg-brand-dark`}
          >
            Verify payment
          </button>
          <button
            type="button"
            onClick={() => setMode("flag")}
            disabled={isPending}
            className={`${button} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`}
          >
            Not received
          </button>
        </div>
      )}

      {/* ---- Confirm: once PAID it counts in sales, so no mis-taps ---- */}
      {mode === "confirm" && (
        <div role="group" aria-label="Confirm payment" className="mt-3 rounded-lg bg-green-50 p-3">
          <p className="font-semibold text-green-950">
            Received {formatPrice(payment.amount)} for #{payment.orderId} in Lynk?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run(() => verifyLynkPayment(payment.orderId))}
              disabled={isPending}
              className={`${button} bg-green-700 text-white hover:bg-green-800`}
            >
              {isPending ? "Saving…" : "Yes, received"}
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              disabled={isPending}
              className={`${button} border border-stone-300 bg-white text-stone-800`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ---- Not received: optional note ---- */}
      {mode === "flag" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!tooLong) run(() => flagNotReceived(payment.orderId, note));
          }}
          className="mt-3 rounded-lg bg-stone-50 p-3"
        >
          <label className="text-sm font-semibold">
            Note for the counter staff <span className="font-normal text-stone-500">(optional)</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={NOTE_MAX + 50}
              placeholder="e.g. Nothing in Lynk at 1:15"
              disabled={isPending}
              className="mt-1 block min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base"
            />
          </label>
          {tooLong && <p className="mt-1 text-sm text-red-800">At most {NOTE_MAX} characters.</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isPending || tooLong}
              className={`${button} bg-amber-600 text-white hover:bg-amber-700`}
            >
              {isPending ? "Saving…" : "Mark not received"}
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              disabled={isPending}
              className={`${button} border border-stone-300 bg-white text-stone-800`}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-900">
          {error}
        </p>
      )}
    </li>
  );
}
