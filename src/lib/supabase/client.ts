/*
 * src/lib/supabase/client.ts
 *
 * WHAT: Creates a Supabase connection for code that runs IN THE BROWSER
 *       (files that start with "use client", e.g. buttons, forms, live order status).
 *
 * LAYER: This is the bridge between the Presentation layer (screens in src/app/)
 *        and the Data layer (Supabase). It holds no business rules itself.
 *
 * WHY a separate browser helper? Browser code and server code store the login
 * session differently. In the browser, @supabase/ssr reads and writes the session
 * cookies directly using document.cookie, so we don't need to pass any cookie code in.
 *
 * Later we will use this for Supabase Realtime (FR-05, PR-2: the customer sees
 * status updates within 5 seconds without refreshing the page).
 */

import { createBrowserClient } from "@supabase/ssr";

/*
 * createClient()
 * Call this inside a browser component whenever you need to talk to Supabase:
 *   const supabase = createClient();
 *
 * We read the URL and key from .env.local. Because their names start with
 * NEXT_PUBLIC_, Next.js copies them into the browser code when it builds the app.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Fail early with a clear message instead of a confusing error later on.
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Fill in NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart `npm run dev`."
    );
  }

  return createBrowserClient(url, key);
}
