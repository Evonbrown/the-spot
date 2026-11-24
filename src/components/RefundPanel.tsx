/*
 * src/components/RefundPanel.tsx
 *
 * WHAT: The Supervisor's "Refunds" box (Step 38b, UC-07, FR-06; SDS class
 *       Refund):
 *         1. FIND ORDER: type an Order ID -> the page opens
 *            /supervisor?refund=1043#refunds (a plain GET form);
 *         2. the order: customer, payment method, paid, refunded so far and
 *            what can still be refunded, plus earlier refunds;
 *         3. the REFUND form: amount ("Full refund" fills in the rest), a
 *            required reason (10-500 characters), then a confirmation
 *            "Refund J$500 by Cash to Jane for #1043? It can't be undone.";
 *         4. "Refunds today".
 *
 * LAYER: Presentation. The refund button calls the issueRefund Server Action
 *        (Application layer); the database checks everything again and saves
 *        (migration 0021). The checks here are only instant hints.
 *
 * "use client" = it runs in the browser: it reacts to typing and taps.
 */
"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, useTransition } from "react";
import StatusBadge from "@/components/StatusBadge";
import { formatPrice } from "@/lib/menu-helpers";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/order-status";
import { formatJamaicaDateTime, formatJamaicaTime } from "@/lib/order-rules";
import type { RefundLine, RefundOrder } from "@/lib/payments/get-refunds";
import { issueRefund } from "@/lib/payments/supervisor-actions";
import {
  checkRefund,
  parseRefundAmount,
  readRefundReason,
  REFUND_REASON_MAX,
  REFUND_REASON_MIN,
} from "@/lib/payments/supervisor-rules";

type Props = {
  query: string; // what was typed in "Order ID" (may be "")
  lookup: { order: RefundOrder } | { error: string } | null; // null = nothing looked up
  refundsToday: RefundLine[];
};

const INPUT_CLASS = "mt-1 block min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base";
const BUTTON_CLASS = "min-h-11 rounded-lg px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60";

export default function RefundPanel({ query, lookup, refundsToday }: Props) {
  return (
    <section id="refunds" aria-labelledby="refunds-title" className="scroll-mt-20">
      <h2 id="refunds-title" className="text-xl font-bold">
        Refunds
      </h2>
      <p className="mt-1 text-sm text-stone-600">
        Only the Supervisor can refund. Refunds count on the day they&apos;re issued.
      </p>

      {/* ---- 1. Find the order (GET form: works without JavaScript) ---- */}
      <form
        method="get"
        action="/supervisor#refunds"
        aria-label="Find order for refund"
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="w-full text-sm font-semibold sm:w-auto">
          Order ID
          <input
            type="text"
            name="refund"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={query}
            placeholder="e.g. 1043"
            className={`${INPUT_CLASS} sm:w-44`}
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
        >
          Find order
        </button>
      </form>

      {lookup && "error" in lookup && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {lookup.error}
        </p>
      )}
      {lookup && "order" in lookup && (
        // key = the Order ID: looking up ANOTHER order starts a fresh card;
        // after a refund the same card stays, so its "Refunded ..." message stays.
        <RefundOrderCard key={lookup.order.orderId} order={lookup.order} />
      )}

      {/* ---- 4. Refunds today ---- */}
      <h3 className="mt-6 text-lg font-bold">Refunds today ({refundsToday.length})</h3>
      {refundsToday.length === 0 ? (
        <p className="mt-2 text-sm text-stone-600">No refunds today.</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-stone-100 rounded-xl bg-white px-4 shadow-sm">
          {refundsToday.map((r) => (
            <li key={r.id} className="py-2 text-sm">
              <p className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">
                  #{r.orderId} · {formatPrice(r.amount)} · {PAYMENT_METHOD_LABELS[r.method]}
                </span>
                <span className="text-stone-600">
                  {formatJamaicaTime(r.refundedAt)} · {r.byMe ? "by you" : "by another supervisor"}
                </span>
              </p>
              <p className="text-stone-600">&quot;{r.reason}&quot;</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/*
 * RefundOrderCard: one order, its money figures and the refund form.
 * mode: "form" (typing) or "confirm" ("Refund J$X ...? Yes, refund / Cancel").
 */
function RefundOrderCard({ order }: { order: RefundOrder }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"form" | "confirm">("form");
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /* Start clean when the page is left (hidden pages keep their state). */
  useLayoutEffect(() => {
    return () => {
      setMode("form");
      setAmountText("");
      setReason("");
      setError(null);
      setDone(null);
    };
  }, []);

  const canRefund = order.payStatus !== "UNPAID" && order.refundable > 0;
  const customer = order.customerName ?? "the customer";

  /* "Refund" pressed: check the amount and reason first (instant hint). */
  function review() {
    setError(null);
    setDone(null);
    const amount = parseRefundAmount(amountText);
    if ("error" in amount) return setError(amount.error);
    const problem = checkRefund(amount.amount, order.refundable);
    if (problem) return setError(problem);
    const why = readRefundReason(reason);
    if ("error" in why) return setError(why.error);
    setMode("confirm");
  }

  /* "Yes, refund": the server and the database decide. */
  function confirm() {
    const amount = parseRefundAmount(amountText);
    startTransition(async () => {
      try {
        const result = await issueRefund(order.orderId, amountText, reason, order.refunded);
        if (result.ok) {
          setDone(
            `Refunded ${"amount" in amount ? formatPrice(amount.amount) : ""} for #${order.orderId}. ${
              order.method === "CASH"
                ? "Give the cash to the customer from the till."
                : "Send the money back to the customer in your Lynk app."
            }`
          );
          setAmountText("");
          setReason("");
        } else {
          setError(result.error);
        }
        setMode("form");
        router.refresh();
      } catch {
        setError("We couldn't reach the server. Check your connection and try again.");
        setMode("form");
      }
    });
  }

  const parsed = parseRefundAmount(amountText);

  return (
    <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
      {/* ---- 2. The order and its money figures ---- */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xl font-extrabold">Order #{order.orderId}</p>
          <p className="text-sm text-stone-600">
            {customer}
            {order.customerPhone && ` · ${order.customerPhone}`} · placed {formatJamaicaDateTime(order.placedAt)}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-stone-500">Payment</dt>
          <dd className="font-semibold">
            {PAYMENT_METHOD_LABELS[order.method]} · {PAYMENT_STATUS_LABELS[order.payStatus]}
          </dd>
        </div>
        <div>
          <dt className="text-stone-500">Paid</dt>
          <dd className="font-semibold">{order.payStatus === "UNPAID" ? "–" : formatPrice(order.paid)}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Refunded so far</dt>
          <dd className="font-semibold">{formatPrice(order.refunded)}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Can still refund</dt>
          <dd className="text-lg font-extrabold text-brand">{formatPrice(order.refundable)}</dd>
        </div>
      </dl>

      {order.refunds.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm text-stone-700">
          {order.refunds.map((r) => (
            <li key={r.id}>
              {formatJamaicaDateTime(r.refundedAt)}: {formatPrice(r.amount)} by {r.byMe ? "you" : "another supervisor"} —
              &quot;{r.reason}&quot;
            </li>
          ))}
        </ul>
      )}

      {done && (
        <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-900">
          {done}
        </p>
      )}

      {/* ---- Why there's no form ---- */}
      {!canRefund && (
        <p className="mt-3 rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
          {order.payStatus === "UNPAID"
            ? "This order isn't paid yet, so there's nothing to refund."
            : "This order is fully refunded."}
        </p>
      )}

      {/* ---- 3. The refund form ---- */}
      {canRefund && mode === "form" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            review();
          }}
          className="mt-4 flex flex-col gap-3 border-t border-stone-100 pt-4"
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="w-full text-sm font-semibold sm:w-auto">
              Amount to refund (J$)
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                placeholder="e.g. 500"
                disabled={isPending}
                className={`${INPUT_CLASS} sm:w-44`}
              />
            </label>
            <button
              type="button"
              onClick={() => setAmountText(order.refundable.toFixed(2))}
              disabled={isPending}
              className={`${BUTTON_CLASS} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`}
            >
              Full refund ({formatPrice(order.refundable)})
            </button>
          </div>
          <div>
            <label htmlFor={`refund-reason-${order.orderId}`} className="text-sm font-semibold">
              Reason <span className="font-normal text-stone-500">(required, at least {REFUND_REASON_MIN} characters)</span>
            </label>
            <textarea
              id={`refund-reason-${order.orderId}`}
              aria-describedby={`refund-reason-count-${order.orderId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={REFUND_REASON_MAX}
              rows={2}
              placeholder="e.g. Wrong order: customer got chicken instead of pork"
              disabled={isPending}
              className="mt-1 block w-full rounded-lg border border-stone-300 bg-white p-3 text-base"
            />
            <p id={`refund-reason-count-${order.orderId}`} className="mt-1 text-right text-xs text-stone-500">
              {reason.trim().length}/{REFUND_REASON_MIN} min · {reason.length}/{REFUND_REASON_MAX}
            </p>
          </div>
          <div>
            <button type="submit" disabled={isPending} className={`${BUTTON_CLASS} bg-brand text-white hover:bg-brand-dark`}>
              Refund
            </button>
          </div>
        </form>
      )}

      {/* ---- Confirm: a refund can't be undone ---- */}
      {canRefund && mode === "confirm" && "amount" in parsed && (
        <div role="group" aria-label="Confirm refund" className="mt-4 rounded-lg bg-amber-50 p-3">
          <p className="font-semibold text-amber-950">
            Refund {formatPrice(parsed.amount)} by {PAYMENT_METHOD_LABELS[order.method]} to {customer} for #
            {order.orderId}? It can&apos;t be undone.
          </p>
          <p className="mt-1 text-sm text-amber-950">Reason: &quot;{reason.trim()}&quot;</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={isPending}
              className={`${BUTTON_CLASS} bg-amber-600 text-white hover:bg-amber-700`}
            >
              {isPending ? "Saving…" : "Yes, refund"}
            </button>
            <button
              type="button"
              onClick={() => setMode("form")}
              disabled={isPending}
              className={`${BUTTON_CLASS} border border-stone-300 bg-white text-stone-800`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}
