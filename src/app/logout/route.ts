/*
 * src/app/logout/route.ts   ->   GET /logout?reason=idle
 *
 * WHAT: Logs the person out (deletes the login cookies) and sends them to the
 *       login page (Step 39c). Used when a STAFF member has been idle for 30
 *       minutes: by their own screen's timer (StaffIdleWatcher) and by the
 *       server (requireRole), so they see "You were logged out after 30
 *       minutes without activity."
 *
 * LAYER: Application layer. A "route handler" (route.ts): unlike a page, it
 *        may change cookies, which logging out needs.
 *
 * SAFE AS A LINK? Anyone could send you a link to /logout, but all it can do
 * is log YOU out (no data changes), so that's harmless. The normal "Log out"
 * button still uses the logOut Server Action.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error("logout: signOut failed:", error.message);

  // Only the one known reason is passed on (never anything else from the address).
  const reason = new URL(request.url).searchParams.get("reason") === "idle" ? "?reason=idle" : "";
  return NextResponse.redirect(new URL(`/login${reason}`, request.url));
}
