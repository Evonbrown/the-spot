/*
 * src/components/StaffIdleWatcher.tsx
 *
 * WHAT: The browser side of "staff are logged out after 30 minutes without
 *       activity" (Step 39c, SRS Section 3). Shown ONLY for staff roles
 *       (SiteHeader decides; customers aren't affected).
 *         - It watches for REAL activity: taps / clicks, keys, scrolling.
 *           (Not page refreshes: staff screens refresh themselves every 30
 *           seconds, which must not count as "someone is here".)
 *         - At most once a minute it tells the server "still here"
 *           (stillHere), which records the time in the database.
 *         - At 28 minutes: a warning box "For your security you'll be logged
 *           out in 1:59. Stay logged in / Log out now".
 *         - At 30 minutes: it goes to /logout?reason=idle.
 *
 * LAYER: Presentation (browser). The SERVER also checks the time on every
 *        page and action (get-profile.ts), so switching this timer off
 *        doesn't help anyone stay logged in.
 *
 * SEVERAL TABS: the last activity time is shared through localStorage, so
 * working in one tab keeps the other tabs alive too.
 *
 * "use client" = it runs in the browser: it listens to taps and keys.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { idleStage } from "@/lib/auth/idle-rules";
import { stillHere } from "@/lib/auth/activity-actions";

type Props = {
  idleMs: number; // log out after this long without activity (30 min)
  warnMs: number; // show the warning this long before (2 min)
};

const STORAGE_KEY = "spot-last-activity";
const PING_EVERY_MS = 60_000; // tell the server at most once a minute

/* localStorage can be blocked (private windows, settings): never let that break the page. */
function readShared(): number | null {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
function writeShared(time: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(time));
  } catch {
    // ignore: this tab still keeps its own time
  }
}

/* "1:05" from 65 seconds. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function StaffIdleWatcher({ idleMs, warnMs }: Props) {
  // Times live in refs (not state): they change often and don't need a redraw.
  const lastActivity = useRef(0);
  const lastPing = useRef(0);
  // What the box shows: nothing, or the warning with seconds left.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    /*
     * Go to /logout (it clears the login cookies, then shows the login page).
     * A FULL page load on purpose (not the Next.js router): /logout is a route
     * handler, not a page, and a full load also throws away everything the
     * idle screen was showing.
     */
    function logOutNow() {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load needed (see above)
      window.location.assign("/logout?reason=idle");
    }

    /* Tell the server, at most once a minute. If it says "logged out", go. */
    function ping(now: number) {
      if (now - lastPing.current < PING_EVERY_MS) return;
      lastPing.current = now;
      stillHere()
        .then((result) => {
          if ("loggedOut" in result) logOutNow();
        })
        .catch(() => {
          // No connection: try again on the next activity.
          lastPing.current = 0;
        });
    }

    /* Someone tapped, typed or scrolled: they're here. */
    function onActivity() {
      const now = Date.now();
      lastActivity.current = now;
      writeShared(now);
      ping(now);
    }

    // Opening a page counts as activity (a person did that, not a refresh).
    onActivity();

    /* Every second: how long since the last activity (in ANY tab)? */
    const timer = window.setInterval(() => {
      const now = Date.now();
      const shared = readShared();
      if (shared && shared > lastActivity.current) lastActivity.current = shared; // another tab was used
      const stage = idleStage(lastActivity.current, now, idleMs, warnMs);
      if (stage.stage === "logout") {
        window.clearInterval(timer);
        logOutNow();
      } else {
        setSecondsLeft(stage.stage === "warning" ? stage.secondsLeft : null);
      }
    }, 1000);

    // "passive: true" = we only listen; scrolling stays smooth.
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));

    return () => {
      window.clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, onActivity));
    };
  }, [idleMs, warnMs]);

  if (secondsLeft === null) return null;

  // ---- The warning (the last 2 minutes) ----
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-title"
      aria-describedby="idle-text"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 text-stone-900"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 id="idle-title" className="text-lg font-bold">
          Are you still there?
        </h2>
        <p id="idle-text" className="mt-2 text-sm">
          For your security, you&apos;ll be logged out in{" "}
          <span className="font-bold tabular-nums">{clock(secondsLeft)}</span> because there has been no activity.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Tapping this button is itself activity (pointerdown), which resets the timer. */}
          <button
            type="button"
            autoFocus
            onClick={() => setSecondsLeft(null)}
            className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark"
          >
            Stay logged in
          </button>
          {/* A plain link: /logout clears the login cookies and shows the login page. */}
          <a
            href="/logout"
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-5 font-semibold text-stone-800"
          >
            Log out now
          </a>
        </div>
      </div>
    </div>
  );
}
