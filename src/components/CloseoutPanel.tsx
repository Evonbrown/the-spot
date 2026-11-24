/*
 * src/components/CloseoutPanel.tsx
 *
 * WHAT: The "Daily closeout" box (Step 36, FR-06 SR-6.6, SR-6.7, SR-6.8,
 *       SR-6.10). Shown on /manager (one day) and on /staff/sales (today).
 *         - the STATUS: Not started / Count submitted / Closed and locked /
 *           Reopened;
 *         - OPEN ORDERS that block the closeout (with a warning);
 *         - the COUNT form: cash counted, expected cash, the difference
 *           (live), and an explanation box (required over the limit);
 *         - Manager only: APPROVE (with an override reason if orders are
 *           still open), REOPEN (with a reason), the HISTORY and the LIMIT.
 *
 * LAYER: Presentation. The figures come from getCloseout() (Application
 *        layer); every button calls a Server Action (closeout-actions.ts),
 *        and the database decides (migration 0019). The checks here are only
 *        instant hints.
 *
 * "use client" = it runs in the browser: it reacts to typing and taps.
 */
"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, useTransition } from "react";
import { formatPrice } from "@/lib/menu-helpers";
import { STATUS_LABELS } from "@/lib/order-status";
import { formatJamaicaDateTime } from "@/lib/order-rules";
import {
  approveCloseout,
  reopenCloseout,
  setCashDifferenceLimit,
  submitCloseoutCount,
  type CloseoutResult,
} from "@/lib/reports/closeout-actions";
import {
  cashDifference,
  needsExplanation,
  parseCashAmount,
  REASON_MIN,
  TEXT_MAX,
} from "@/lib/reports/closeout-rules";
import type { CloseoutDetails } from "@/lib/reports/get-closeout";

type Props = {
  details: CloseoutDetails;
  isManager: boolean; // false = counter staff (count only, today)
};

/* "-50" -> "J$50 short", "120" -> "J$120 over", "0" -> "exact". */
function differenceText(difference: number): string {
  if (difference === 0) return "exact";
  return `${formatPrice(Math.abs(difference))} ${difference < 0 ? "short" : "over"}`;
}

const STATUS_TEXT = {
  SUBMITTED: "Count submitted: waiting for the Manager to approve",
  APPROVED: "Closed and locked",
  REOPENED: "Reopened: count again to close",
} as const;

export default function CloseoutPanel({ details, isManager }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // The form fields.
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [limitText, setLimitText] = useState("");

  /* Start clean when the page is left (hidden pages keep their state). */
  useLayoutEffect(() => {
    return () => {
      setCounted("");
      setNote("");
      setOverrideReason("");
      setReopenReason("");
      setLimitText("");
      setError(null);
      setDone(null);
    };
  }, []);

  const c = details.closeout;
  const locked = c?.isLocked === true;
  const hasOpen = details.openOrders.length > 0;
  // Counter staff can't count while orders are open (the database refuses too).
  const countBlocked = hasOpen && !isManager;

  // Live preview of the difference while typing (the server works it out again).
  const parsed = counted.trim() === "" ? null : parseCashAmount(counted);
  const preview = parsed && "amount" in parsed ? cashDifference(parsed.amount, details.expectedCash) : null;
  const explanationNeeded = preview !== null && needsExplanation(preview, details.limit);

  /*
   * run(action, successText): call a Server Action, show its message, and
   * redraw the page with the new figures (router.refresh()).
   */
  function run(action: () => Promise<CloseoutResult>, successText: string, clear: () => void) {
    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          clear();
          setDone(successText);
        } else {
          setError(result.error);
        }
        router.refresh();
      } catch {
        setError("We couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  const input = "mt-1 block min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base";
  const button =
    "min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-stone-400";

  return (
    <section aria-labelledby="closeout-title" className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="closeout-title" className="text-lg font-bold">
          Daily closeout
        </h2>
        {/* The status (shown on the report for that day). */}
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            locked ? "bg-green-100 text-green-900" : c ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-700"
          }`}
        >
          {c ? STATUS_TEXT[c.status] : "Not started"}
        </span>
      </div>

      {/* ---- Closed: who and when ---- */}
      {locked && c && (
        <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-950">
          <p className="font-semibold">
            Closed by {c.approvedBy ?? "the Manager"}
            {c.approvedAt && `, ${formatJamaicaDateTime(c.approvedAt)}`}. This day can&apos;t be changed.
          </p>
          <p className="mt-1">
            Cash: expected {formatPrice(c.expectedCash)}, counted {formatPrice(c.countedCash)} (
            {differenceText(c.cashDifference)}).
          </p>
          {c.differenceNote && <p className="mt-1">Explanation: &quot;{c.differenceNote}&quot;</p>}
          {c.overrideReason && <p className="mt-1">Closed with open orders: &quot;{c.overrideReason}&quot;</p>}
        </div>
      )}

      {/* ---- SR-6.6: open orders ---- */}
      {hasOpen && !locked && (
        <div role="note" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">
            {details.openOrders.length} order{details.openOrders.length === 1 ? " is" : "s are"} still open:
          </p>
          <p className="mt-1">
            {details.openOrders.map((o) => `#${o.id} (${STATUS_LABELS[o.status]})`).join(", ")}
          </p>
          <p className="mt-1">
            {isManager
              ? "Finish or cancel them first. If you close the day anyway (with a reason), these orders are frozen until the day is reopened."
              : "Finish or cancel them before closing out."}
          </p>
        </div>
      )}

      {/* ---- A count waiting for approval ---- */}
      {c && c.status === "SUBMITTED" && (
        <p className="mt-3 text-sm text-stone-700">
          Counted {formatPrice(c.countedCash)} by {c.submittedBy ?? "staff"}, {formatJamaicaDateTime(c.submittedAt)}:
          expected {formatPrice(c.expectedCash)}, {differenceText(c.cashDifference)}.
          {c.differenceNote && ` Explanation: "${c.differenceNote}"`}
        </p>
      )}

      {/* ---- 1. The COUNT form (not when locked) ---- */}
      {!locked && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => submitCloseoutCount(details.day, counted, note),
              "Cash count saved.",
              () => {
                setCounted("");
                setNote("");
              }
            );
          }}
          className="mt-4 flex flex-col gap-3 border-t border-stone-100 pt-4"
        >
          <p className="text-sm">
            {/* Step 38b: the day's cash refunds come out of the till. */}
            Expected cash (paid cash orders − cash refunds):{" "}
            <span className="font-bold">{formatPrice(details.expectedCash)}</span>
            <span className="text-stone-500"> · allowed difference {formatPrice(details.limit)}</span>
          </p>
          <label className="text-sm font-semibold">
            {c ? "Count again: cash counted in the till (J$)" : "Cash counted in the till (J$)"}
            {/* inputMode="decimal" = phones show a number keypad with a dot. */}
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
              placeholder="e.g. 2650"
              disabled={countBlocked || isPending}
              className={input}
            />
          </label>
          {preview !== null && (
            <p className={`text-sm ${explanationNeeded ? "font-semibold text-red-800" : "text-stone-700"}`}>
              Difference: {differenceText(preview)}
              {explanationNeeded && ` — more than ${formatPrice(details.limit)}, so an explanation is required.`}
            </p>
          )}
          {parsed && "error" in parsed && <p className="text-sm text-red-800">{parsed.error}</p>}
          <label className="text-sm font-semibold">
            Explanation {explanationNeeded ? `(required, at least ${REASON_MIN} characters)` : "(optional)"}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={TEXT_MAX}
              rows={2}
              disabled={countBlocked || isPending}
              className={`${input} py-2`}
            />
          </label>
          <div>
            <button type="submit" disabled={countBlocked || isPending || counted.trim() === ""} className={button}>
              {isPending ? "Saving…" : "Submit cash count"}
            </button>
          </div>
        </form>
      )}

      {/* ---- 2. APPROVE (Manager, a count waiting) ---- */}
      {isManager && c?.status === "SUBMITTED" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => approveCloseout(details.day, overrideReason),
              "Day approved and locked.",
              () => setOverrideReason("")
            );
          }}
          className="mt-4 flex flex-col gap-3 border-t border-stone-100 pt-4"
        >
          {hasOpen && (
            <label className="text-sm font-semibold">
              Reason for closing with open orders (required, at least {REASON_MIN} characters)
              <textarea
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                maxLength={TEXT_MAX}
                rows={2}
                className={`${input} py-2`}
              />
            </label>
          )}
          <p className="text-sm text-stone-600">
            Approving saves the day&apos;s figures and LOCKS the day: its orders and payments can&apos;t change, and no
            new orders can be placed for it.
          </p>
          <div>
            <button type="submit" disabled={isPending} className={button}>
              {isPending ? "Saving…" : "Approve and lock the day"}
            </button>
          </div>
        </form>
      )}

      {/* ---- 3. REOPEN (Manager, a closed day) ---- */}
      {isManager && locked && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => reopenCloseout(details.day, reopenReason), "Day reopened.", () => setReopenReason(""));
          }}
          className="mt-4 flex flex-col gap-3 border-t border-stone-100 pt-4"
        >
          <label className="text-sm font-semibold">
            Reopen this day: why? (required, at least {REASON_MIN} characters)
            <textarea
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              maxLength={TEXT_MAX}
              rows={2}
              className={`${input} py-2`}
            />
          </label>
          <div>
            <button
              type="submit"
              disabled={isPending || reopenReason.trim().length < REASON_MIN}
              className="min-h-11 rounded-lg border border-stone-400 bg-white px-5 font-semibold text-stone-800 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Reopen day"}
            </button>
          </div>
        </form>
      )}

      {/* Messages. role="alert": read out at once by screen readers. */}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {done && !error && (
        <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-900">
          {done}
        </p>
      )}

      {/* ---- Manager: the HISTORY and the LIMIT ---- */}
      {isManager && details.events.length > 0 && (
        <div className="mt-4 border-t border-stone-100 pt-4">
          <h3 className="text-sm font-bold">History</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-stone-700">
            {details.events.map((event, index) => (
              <li key={index}>
                {formatJamaicaDateTime(event.createdAt)}: {event.action === "SUBMITTED" ? "Cash counted" : event.action === "APPROVED" ? "Approved and locked" : "Reopened"}{" "}
                by {event.actor ?? "staff"}
                {event.reason && ` — "${event.reason}"`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isManager && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => setCashDifferenceLimit(limitText), "Limit saved.", () => setLimitText(""));
          }}
          className="mt-4 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-4"
        >
          <label className="text-sm font-semibold">
            Allowed cash difference (now {formatPrice(details.limit)})
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={limitText}
              onChange={(event) => setLimitText(event.target.value)}
              placeholder="e.g. 500"
              className={input}
            />
          </label>
          <button
            type="submit"
            disabled={isPending || limitText.trim() === ""}
            className="min-h-11 rounded-lg border border-stone-400 bg-white px-5 font-semibold text-stone-800 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save limit
          </button>
        </form>
      )}
    </section>
  );
}
