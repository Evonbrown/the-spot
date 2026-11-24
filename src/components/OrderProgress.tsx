/*
 * src/components/OrderProgress.tsx
 *
 * WHAT: The customer's "where is my order?" view (Step 29, FR-05 SR-5.1):
 *         - the current status (the shared coloured StatusBadge);
 *         - ONE plain sentence saying what it means / what to do next
 *           (decision), e.g. "Your food is ready. Show Order ID #1004 at the
 *           counter.";
 *         - a progress line of the order's steps:
 *             ✓ done   ● you are here   ○ still to come
 *         - for CANCELLED / ABANDONED: no progress line, just a clear box.
 *
 * LAYER: Presentation. The steps come from statusSteps() in
 *        src/lib/order-status.ts: the SAME list the staff rules (Step 28) and
 *        the database trigger use, so what the customer sees can never
 *        disagree with what staff are allowed to do.
 *
 * WHY top-to-bottom? On a phone (360px wide), five labels like "Ready for
 * pickup" don't fit side by side, so the steps are stacked.
 *
 * ACCESSIBILITY: it's a numbered list (<ol>); the current step has
 * aria-current="step", so screen readers say "current step". The ✓ / ● / ○
 * marks are hidden from screen readers and the words "done" / "next" are
 * written for them instead (colour or symbols are never the only signal).
 *
 * This is a SERVER component (no "use client"): it only draws. It updates live
 * because the page around it is re-drawn by <OrderLiveRefresh> (Realtime).
 */

import StatusBadge from "@/components/StatusBadge";
import { STATUS_LABELS, statusSteps, type OrderStatus } from "@/lib/order-status";
import type { Fulfilment } from "@/lib/order-rules";

type Props = {
  orderId: number;
  status: OrderStatus;
  fulfilment: Fulfilment;
  locationName: string | null; // delivery only, e.g. "UWI Mona"
};

/*
 * statusSentence(...) -> the ONE plain sentence under the status (decision).
 * Written for the customer: what is happening, and what to do next.
 * For "Ready for pickup" it repeats the Order ID: SAF-1 (staff ask for it at
 * the counter).
 */
function statusSentence({ orderId, status, fulfilment, locationName }: Props): string {
  const isDelivery = fulfilment === "DELIVERY";
  switch (status) {
    case "PENDING":
      return "We've received your order. The kitchen will start on it soon.";
    case "IN_PROGRESS":
      return "Your food is being prepared.";
    case "READY_FOR_PICKUP":
      return isDelivery
        ? "Your food is ready and will leave with a driver soon."
        : `Your food is ready. Show Order ID #${orderId} at the counter.`;
    case "BEING_DELIVERED":
      return locationName ? `Your food is on its way to ${locationName}.` : "Your food is on its way.";
    case "COMPLETED":
      return isDelivery ? "Delivered. Enjoy your meal!" : "Picked up. Enjoy your meal!";
    case "CANCELLED":
      return "This order was cancelled. Questions? Please ask at the counter.";
    case "ABANDONED":
      return "This order wasn't collected, so it was marked Abandoned. Questions? Please ask at the counter.";
  }
}

export default function OrderProgress(props: Props) {
  const { status, fulfilment } = props;
  const sentence = statusSentence(props);

  // ---- Cancelled / Abandoned: the order left the normal path. ----
  // There's no progress to show, so just a clear box (no line).
  if (status === "CANCELLED" || status === "ABANDONED") {
    return (
      <div className="flex flex-col gap-3">
        <StatusBadge status={status} />
        <p className="rounded-lg bg-stone-100 p-3 font-semibold text-stone-800">{sentence}</p>
      </div>
    );
  }

  // ---- The normal path: where are we on it? ----
  const steps = statusSteps(fulfilment); // pickup: 4 steps, delivery: 5
  const current = steps.indexOf(status); // position of "you are here"

  return (
    <div className="flex flex-col gap-3">
      <StatusBadge status={status} />
      <p className="font-semibold">{sentence}</p>

      <ol className="mt-1 flex flex-col">
        {steps.map((step, index) => {
          const isDone = index < current;
          const isCurrent = index === current;
          // When the order is COMPLETED, the last step is both current and
          // done: show it as done (✓), not as "you are here".
          const showAsDone = isDone || (isCurrent && step === "COMPLETED");
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step}
              aria-current={isCurrent ? "step" : undefined}
              className="flex items-stretch gap-3"
            >
              {/* The dot, with a short line down to the next step. */}
              <div className="flex flex-col items-center" aria-hidden="true">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    showAsDone
                      ? "bg-green-600 text-white"
                      : isCurrent
                        ? "bg-brand text-white ring-4 ring-orange-200"
                        : "border-2 border-stone-300 bg-white text-stone-400"
                  }`}
                >
                  {showAsDone ? "✓" : isCurrent ? "●" : "○"}
                </span>
                {!isLast && (
                  <span className={`w-0.5 flex-1 ${isDone ? "bg-green-600" : "bg-stone-300"}`} />
                )}
              </div>

              {/* The step's name. pb-4 = space before the next step. */}
              <p
                className={`pb-4 pt-0.5 ${
                  isCurrent ? "font-bold text-stone-900" : isDone ? "text-stone-700" : "text-stone-400"
                }`}
              >
                {STATUS_LABELS[step]}
                {/* Words for screen readers instead of the symbols. */}
                <span className="sr-only">{showAsDone ? " (done)" : isCurrent ? " (current step)" : " (next)"}</span>
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
