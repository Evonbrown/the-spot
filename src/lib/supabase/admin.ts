/*
 * src/lib/supabase/admin.ts   (SERVER ONLY)
 *
 * WHAT: createAdminClient(): a Supabase connection that uses the SECRET key
 *       (SUPABASE_SECRET_KEY in .env.local). The database treats it as the
 *       "service_role", which SKIPS Row Level Security.
 *
 * LAYER: Application layer. Only server code that has ALREADY checked every
 *        rule may use it. Right now that is just placeOrder (Part 21), which
 *        uses it to run the create_order() database function. Customers can't
 *        run that function themselves (see migration 0006, section 11).
 *
 * WHY SO CAREFUL? With this key you can read and change EVERY table. So:
 *   - The variable has NO "NEXT_PUBLIC_" prefix: Next.js never sends it to
 *     the browser.
 *   - `import "server-only"` makes the build FAIL if a browser component
 *     ever imports this file (by accident or otherwise).
 *   - Use it for as little as possible ("least privilege"): placeOrder reads
 *     the menu with the normal public connection and only uses this one to
 *     save the order.
 *   - The key lives only in .env.local (ignored by git) and, later, in
 *     Vercel's settings. Never in code, chat or screenshots.
 */

import "server-only";
import { createClient } from "@supabase/supabase-js";

/*
 * createAdminClient()
 * A new connection each time (cheap: it's just settings, no login).
 * No cookies and no session: it never acts AS a user, so whose order it is
 * must be passed in explicitly (placeOrder takes it from the login cookie).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  // Fail early with a clear message (shown in the terminal, not to customers).
  if (!url || !key) {
    throw new Error(
      "The Supabase secret key is missing. Add SUPABASE_SECRET_KEY to .env.local " +
        "(no NEXT_PUBLIC_ prefix), then restart `npm run dev`."
    );
  }

  return createClient(url, key, {
    // Like the public client: nothing to do with logins is saved or refreshed.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
