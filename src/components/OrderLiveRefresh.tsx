/*
 * src/components/OrderLiveRefresh.tsx
 *
 * WHAT: Keeps a screen LIVE, and shows the small "● Live" label.
 *       It subscribes to Supabase Realtime on the orders table and, whenever
 *       a message arrives, asks the server to rebuild the page
 *       (router.refresh()). Used by:
 *         - the staff queue (/staff): any order added or changed (Step 24);
 *         - staff order details (/staff/orders/1004): only THAT order (Step 25);
 *         - Step 29 (FR-05 SR-5.2): the customer's order page (/orders/1004),
 *           only that order, and "My orders" (/orders), only THEIR orders.
 *       One shared piece, so every screen goes live the same way.
 *
 * LAYER: Presentation (browser). The data itself is always re-read on the
 *        server, through RLS (migrations 0006/0007/0008).
 *
 * WHY refresh instead of using the message? The message only holds the
 * orders ROW (no items, no customer). Re-reading means each screen is built
 * ONE way, so the first load and the live updates can never disagree.
 *
 * IS IT SAFE FOR CUSTOMERS? Yes. Realtime checks RLS for EACH listener before
 * sending a message: a customer only ever hears about their OWN orders
 * (0006), while counter staff hear about every order (0007). The filters
 * below only make the list of messages shorter; RLS is the real lock.
 *
 * "use client" = it runs in the browser, where the Realtime connection lives.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  channelName: string; // a unique name for this subscription, e.g. "staff-queue"
  orderId?: number; // only listen to ONE order (details pages)
  customerId?: string; // only listen to ONE customer's orders ("My orders", Step 29)
  // Leave both out = all orders the listener may read (the staff queue).
};

// Connection state for the label.
type LiveState = "connecting" | "live" | "reconnecting";

/*
 * whichOrders(orderId, customerId) -> the Realtime filter, or undefined for
 * "no filter". Realtime allows ONE filter per listener, so orderId wins
 * (it's the narrower one).
 *   "id=eq.1004"           = only messages about order 1004;
 *   "customer_id=eq.<id>"  = only messages about this customer's orders.
 */
function whichOrders(orderId?: number, customerId?: string): string | undefined {
  if (orderId !== undefined) return `id=eq.${orderId}`;
  if (customerId !== undefined) return `customer_id=eq.${customerId}`;
  return undefined;
}

export default function OrderLiveRefresh({ channelName, orderId, customerId }: Props) {
  const router = useRouter();
  const [live, setLive] = useState<LiveState>("connecting");

  /*
   * The subscription. Runs when the screen appears; the function it returns
   * ("cleanup") closes it when the screen disappears, so a hidden or closed
   * page doesn't keep listening. (In this Next.js version a page you leave is
   * HIDDEN, not removed; the cleanup still runs, and the subscription starts
   * again, with one refresh, when you come back.)
   */
  useEffect(() => {
    const supabase = createClient();
    const filter = whichOrders(orderId, customerId);

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT (new order) or UPDATE (e.g. status)
          schema: "public",
          table: "orders",
          ...(filter !== undefined ? { filter } : {}),
        },
        () => router.refresh()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLive("live");
          // Re-read once on (re)connecting: catches changes made while we were
          // disconnected or the page was hidden.
          router.refresh();
        } else {
          // CHANNEL_ERROR, TIMED_OUT or CLOSED: Supabase keeps retrying.
          setLive("reconnecting");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, orderId, customerId, router]);

  // role="status": screen readers announce when this changes.
  return (
    <p role="status" className="text-sm font-semibold">
      {live === "live" ? (
        <span className="text-green-700">● Live</span>
      ) : live === "connecting" ? (
        <span className="text-stone-500">Connecting…</span>
      ) : (
        <span className="text-red-700">Reconnecting… (refresh if this stays)</span>
      )}
    </p>
  );
}
