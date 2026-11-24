/*
 * src/components/PaymentInstructions.tsx
 *
 * WHAT: The "How to pay" box on the order confirmation page (Part 23):
 *         - Lynk:            a SAMPLE QR code, the amount, the reference
 *                            (Order ID), the Lynk ID to type in, and "a
 *                            supervisor will confirm your payment";
 *         - Cash + pickup:   "Pay J$X at the counter";
 *         - Cash + delivery: "Pay J$X to the driver when your food arrives".
 *
 * LAYER: Presentation. The payment details come from generateLynkQRCode()
 *        (src/lib/payments/lynk.ts, Application layer); this file only draws them.
 *
 * WHY: FR-02 (Lynk with QR code or Cash; Lynk verified by the Supervisor, the
 *      order is still submitted straight away). Decision: cash is allowed for
 *      pickup AND delivery (paid to the driver).
 *
 * NOT HERE YET (decision): payment status. In Build step 7, once a payment is
 * marked PAID, this box will say "Paid" instead.
 *
 * No "use client": nothing here needs the browser, so it's drawn on the
 * server and arrives as plain HTML (fast on phones).
 */

import { formatPrice } from "@/lib/menu-helpers";
import type { Fulfilment } from "@/lib/order-rules";
import { generateLynkQRCode, type LynkQRCode } from "@/lib/payments/lynk";

type Props = {
  orderId: number;
  total: number; // J$, what the customer pays (items + extras + delivery fee)
  fulfilment: Fulfilment;
  paymentMethod: "LYNK" | "CASH" | null;
};

export default function PaymentInstructions({ orderId, total, fulfilment, paymentMethod }: Props) {
  if (paymentMethod === null) return null; // no payment row: nothing to explain

  return (
    <section className="mt-4 rounded-xl bg-white p-5 shadow-sm" aria-labelledby="how-to-pay">
      <h2 id="how-to-pay" className="text-lg font-bold">
        How to pay
      </h2>
      {paymentMethod === "LYNK" ? (
        <LynkPayment qr={generateLynkQRCode({ orderId, amount: total })} />
      ) : (
        // Cash: where depends on pickup or delivery (decision).
        <p className="mt-2 text-lg">
          {fulfilment === "DELIVERY" ? (
            <>
              Pay <strong>{formatPrice(total)}</strong> to the driver when your food arrives.
            </>
          ) : (
            <>
              Pay <strong>{formatPrice(total)}</strong> at the counter.
            </>
          )}
        </p>
      )}
    </section>
  );
}

/*
 * LynkPayment: the SAMPLE QR code and the details a customer needs to pay.
 * PHONES: QR on top, details under it. WIDER SCREENS: side by side.
 */
function LynkPayment({ qr }: { qr: LynkQRCode }) {
  return (
    <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <SampleQRPicture qr={qr} />

      <div className="w-full min-w-0">
        {/* dl = label + value pairs (screen readers announce them as such). */}
        <dl className="flex flex-col gap-2">
          <div>
            <dt className="text-sm text-stone-500">Amount</dt>
            <dd className="text-2xl font-extrabold">{formatPrice(qr.amount)}</dd>
          </div>
          <div>
            {/* FR-02: the Order ID is the reference, so the Supervisor can
                match the Lynk payment to this order. */}
            <dt className="text-sm text-stone-500">Payment reference</dt>
            <dd className="text-xl font-bold">{qr.reference}</dd>
          </div>
          <div>
            {/* Decision: on a phone you can't scan your own screen, so the
                Lynk ID can be typed into the Lynk app instead. */}
            <dt className="text-sm text-stone-500">Or pay to Lynk ID</dt>
            <dd className="break-words font-semibold">
              {qr.payeeLynkId}
              {!qr.payeeLynkIdConfirmed && (
                <span className="font-normal text-stone-500"> (sample: the real ID comes from The Spot)</span>
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-3 rounded-lg bg-orange-50 p-3 text-sm">
          Use <strong>{qr.reference}</strong> as the reference. A supervisor will confirm your
          payment. Your order has already been placed.
        </p>
      </div>
    </div>
  );
}

/*
 * SampleQRPicture: draws the cells as an SVG picture, with SAMPLE over it.
 * SVG = a picture described as shapes (here: one small square per black
 * cell), so it stays sharp at any size. viewBox adds a 2-cell white "quiet
 * zone" around the grid, like a real QR code.
 * The red SAMPLE band and the caption make sure nobody mistakes it for a real
 * payment code (decision: "clearly marked SAMPLE").
 */
function SampleQRPicture({ qr }: { qr: LynkQRCode }) {
  const size = qr.cells.length;
  // One path for all squares: "M col row h1 v1 h-1 z" = draw a 1 × 1 square there.
  const squares = qr.cells
    .flatMap((line, row) => line.map((black, col) => (black ? `M${col} ${row}h1v1h-1z` : "")))
    .join("");

  return (
    <figure className="flex w-48 shrink-0 flex-col items-center">
      <div className="relative w-48">
        <svg
          viewBox={`-2 -2 ${size + 4} ${size + 4}`}
          role="img"
          aria-label="Sample QR code. Not a real payment code."
          className="block w-48 rounded-lg border border-stone-200 bg-white"
          shapeRendering="crispEdges"
        >
          <path d={squares} fill="#000" />
        </svg>
        {/* aria-hidden: the picture's label already says "Sample". */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 -rotate-12 bg-red-600/90 py-1 text-center text-2xl font-extrabold tracking-widest text-white"
        >
          SAMPLE
        </span>
      </div>
      <figcaption className="mt-2 text-center text-xs text-stone-600">
        Sample only. This is not a real Lynk code, so don&apos;t try to pay with it.
      </figcaption>
    </figure>
  );
}
