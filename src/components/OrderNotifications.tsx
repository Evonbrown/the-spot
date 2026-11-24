/*
 * src/components/OrderNotifications.tsx
 *
 * WHAT: The "Messages we sent you" box on the customer's order page
 *       (Step 30, FR-05 SR-5.4 / AC-4). One line per notification, newest
 *       first: how it was sent and when ("SMS to •••• 1234 · 12:21 p.m."),
 *       then the message text. Before any message: a short note saying when
 *       we will send one.
 *
 * LAYER: Presentation. The notifications are written by the DATABASE trigger
 *        (migration 0012) and read through RLS by getOrderForCustomer.
 *
 * SIMULATED: no real SMS or email is sent yet; this box shows exactly what
 * the customer WOULD have received.
 *
 * LIVE: no extra code. The notification is saved in the SAME transaction as
 * the status change, so when the page re-draws for the new status
 * (OrderLiveRefresh), the message is already there.
 *
 * Server component (no "use client"): it only draws.
 */

import { formatJamaicaTime } from "@/lib/order-rules";
import type { OrderNotification } from "@/lib/orders/get-order";

/*
 * maskContact(channel, sentTo) -> the phone or email with most of it hidden:
 *   "876-555-1234"        -> "•••• 1234"
 *   "jane.doe@gmail.com"  -> "j•••@gmail.com"
 * WHY: campus computers are shared; the customer only needs to recognise
 * WHERE it went, not read their whole number off the screen.
 */
function maskContact(channel: OrderNotification["channel"], sentTo: string | null): string {
  if (!sentTo) return "no contact details on file";
  if (channel === "SMS") {
    const digits = sentTo.replace(/\D/g, ""); // keep the numbers only
    return `•••• ${digits.slice(-4)}`;
  }
  const [name, domain] = sentTo.split("@");
  return domain ? `${name.slice(0, 1)}•••@${domain}` : "•••";
}

type Props = {
  notifications: OrderNotification[];
  // true = the order is finished (or already ready): then "we'll send you an
  // SMS when it's ready" would be wrong. (Orders finished before Step 30
  // have no messages, because the trigger only acts on NEW changes.)
  pastReady: boolean;
};

export default function OrderNotifications({ notifications, pastReady }: Props) {
  return (
    <section className="mt-4 rounded-xl bg-white p-5 shadow-sm" aria-labelledby="messages-title">
      <h2 id="messages-title" className="text-lg font-bold">
        Messages we sent you
      </h2>

      {notifications.length === 0 ? (
        // Nothing yet: tell them what to expect (FR-05: Ready / Cancelled / Abandoned).
        <p className="mt-2 text-sm text-stone-600">
          {pastReady
            ? "No messages for this order."
            : "No messages yet. We'll send you an SMS when your order is ready."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {notifications.map((notification) => (
            <li key={notification.id} className="rounded-lg bg-orange-50 p-3">
              <p className="text-xs font-semibold text-stone-600">
                {notification.channel === "SMS" ? "SMS" : "Email"} to{" "}
                {maskContact(notification.channel, notification.sentTo)} ·{" "}
                {formatJamaicaTime(notification.sentAt)}
              </p>
              <p className="mt-1 break-words">{notification.message}</p>
            </li>
          ))}
        </ul>
      )}

      {/* Honest about the simulation (CLAUDE.md: notifications simulated for now). */}
      <p className="mt-3 text-xs text-stone-500">
        Sample messages: SMS and email sending isn&apos;t switched on yet.
      </p>
    </section>
  );
}
