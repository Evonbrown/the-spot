/*
 * src/components/OrderLiveRefresh.tsx
 *
 * WHAT: Keeps a staff screen LIVE, and shows the small "● Live" label.
 *       It subscribes to Supabase Realtime on the orders table and, whenever
 *       a message arrives, asks the server to rebuild the page
 *       (router.refresh()). Used by:
 *         - the queue (/staff): any order added or changed (Step 24);
 *         - an order's details (/staff/orders/1004): only THAT order (Step 25).
 *       One shared piece, so both screens go live the same way.
 *
 * LAYER: Presentation (browser). The data itself is always re-read on the
 *        server, through RLS (migrations 0007/0008).
 *
 * WHY refresh instead of using the message? The message only holds the
 * orders ROW (no items, no customer). Re-reading means each screen is built
 * ONE way, so the first load and the live updates can never disagree.
 * Realtime checks RLS for each listener: only counter staff hear about every
 * order.
 *
 * "use client" = it runs in the browser, where the Realtime connection lives.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  channelName: string; // a unique name for this subscription, e.g. "staff-queue"
  orderId?: number; // only listen to ONE order (details page); leave out = all orders
};

// Connection state for the label.
type LiveState = "connecting" | "live" | "reconnecting";

export default function OrderLiveRefresh({ channelName, orderId }: Props) {
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

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT (new order) or UPDATE (e.g. status)
          schema: "public",
          table: "orders",
          // filter "id=eq.1004" = only messages about order 1004.
          ...(orderId !== undefined ? { filter: `id=eq.${orderId}` } : {}),
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
  }, [channelName, orderId, router]);

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
