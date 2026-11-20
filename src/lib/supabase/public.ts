/*
 * src/lib/supabase/public.ts
 *
 * WHAT: Creates a Supabase connection that does NOT use login cookies. It always
 *       talks to the database as an anonymous visitor ("anon").
 *
 * LAYER: Application layer. Used only to read PUBLIC data, such as the menu.
 *
 * WHY a second connection? (The normal one is src/lib/supabase/server.ts.)
 *   - Decision: the menu is public, so we don't need to know WHO is asking.
 *     RLS already lets "anon" read menu_items (see 0002_menu_items.sql).
 *   - We cache the menu (src/lib/menu.ts) so it loads fast (PR-1). Next.js does
 *     NOT allow reading cookies inside cached code, because a saved copy shared
 *     by everyone must not depend on one person's login. A connection without
 *     cookies solves that.
 *
 * SAFETY: never use this connection for private data (orders, profiles, ...).
 *         As "anon", RLS would refuse it anyway, so it fails safely.
 */

import { createClient } from "@supabase/supabase-js";

/*
 * createPublicClient()
 * Usage:  const supabase = createPublicClient();
 * Not "async": unlike server.ts, there are no cookies to wait for.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Same early, clear error as server.ts if .env.local is not filled in.
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Fill in NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart `npm run dev`."
    );
  }

  return createClient(url, key, {
    // Turn off everything to do with logins: no session is saved, refreshed or
    // read from the web address. This connection is always anonymous.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
