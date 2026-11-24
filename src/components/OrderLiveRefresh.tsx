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
 *           only that order, and "My orders" (/orders), only THEIR orders;
 *         - Step 32 (FR-04): the driver's screen (/driver), their deliveries,
 *           plus a refresh every 30 seconds (see refreshEverySeconds).
 *       One shared piece, so every screen goes live the same way.
 *
 * LAYER: Presentation (browser). The data itself is always re-read on the
 *        server, through RLS (migrations 0006/0007/0008/0014).
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
 * STEP 32 FIX (the "not live" known issue): Realtime must know WHO is
 * listening, so it needs the user's login token. The browser loads that token
 * from the cookies in the background, and we used to join the channel before
 * it had arrived. Realtime then treated us as a logged-out visitor, who may
 * not read orders (RLS), and REFUSED the subscription ("invalid column for
 * filter id"). Now we hand Realtime the token FIRST, then join, and if the
 * server still refuses, the label says so instead of showing "● Live".
 *
 * "use client" = it runs in the browser, where the Realtime connection lives.
 */
"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  channelName: string; // a unique name for this subscription, e.g. "staff-queue"
  orderId?: number; // only listen to ONE order (details pages)
  customerId?: string; // only listen to ONE customer's orders ("My orders", Step 29)
  // Leave both out = all orders the listener may read (the staff queue).
  // Step 32: ALSO re-read the page every N seconds (driver screen). Needed
  // when a change can't reach us by Realtime, e.g. a delivery moved to
  // ANOTHER driver: we may no longer read that order, so Realtime (which
  // checks RLS) never tells us. Leave out = Realtime only.
  refreshEverySeconds?: number;
};

// Connection state for the label.
//   "error" = the server refused the subscription: live updates are OFF.
type LiveState = "connecting" | "live" | "reconnecting" | "error";

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

export default function OrderLiveRefresh({ channelName, orderId, customerId, refreshEverySeconds }: Props) {
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
    let channel: RealtimeChannel | null = null;
    // "cancelled" = the screen went away while we were still getting ready;
    // then we must NOT subscribe any more.
    let cancelled = false;

    async function start() {
      // 1. THE FIX: give Realtime the logged-in user's token BEFORE joining,
      //    so it knows who is listening (and RLS lets us read our orders).
      //    getSession() reads the login cookie (and renews an old token).
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (cancelled) return;

      // 2. Join and listen.
      channel = supabase
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
        // The server's own notes about this subscription. "status: error" =
        // it REFUSED to send us changes (e.g. not allowed to read orders).
        .on("system", {}, (message: { status?: string; message?: string }) => {
          if (message?.status === "error") {
            console.error("Live updates were refused:", message.message);
            setLive("error");
          }
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Don't hide an "error" the server already sent.
            setLive((current) => (current === "error" ? current : "live"));
            // Re-read once on (re)connecting: catches changes made while we were
            // disconnected or the page was hidden.
            router.refresh();
          } else {
            // CHANNEL_ERROR, TIMED_OUT or CLOSED: Supabase keeps retrying.
            setLive("reconnecting");
          }
        });
    }

    start().catch((error) => {
      console.error("Could not start live updates:", error);
      if (!cancelled) setLive("error");
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [channelName, orderId, customerId, router]);

  /*
   * Step 32: the extra timed refresh (driver screen only), and a refresh when
   * the person comes BACK to the tab or app (phones pause hidden pages).
   */
  useEffect(() => {
    if (!refreshEverySeconds) return;
    const timer = setInterval(() => router.refresh(), refreshEverySeconds * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshEverySeconds, router]);

  // role="status": screen readers announce when this changes.
  return (
    <p role="status" className="text-sm font-semibold">
      {live === "live" ? (
        <span className="text-green-700">● Live</span>
      ) : live === "connecting" ? (
        <span className="text-stone-500">Connecting…</span>
      ) : live === "error" ? (
        <span className="text-red-700">Live updates off: refresh the page</span>
      ) : (
        <span className="text-red-700">Reconnecting… (refresh if this stays)</span>
      )}
    </p>
  );
}
