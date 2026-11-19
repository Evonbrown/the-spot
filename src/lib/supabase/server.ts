/*
 * src/lib/supabase/server.ts
 *
 * WHAT: Creates a Supabase connection for code that runs ON THE SERVER:
 *       Server Components (pages without "use client"), Server Actions and
 *       Route Handlers (src/app/api/...).
 *
 * LAYER: Application layer. CLAUDE.md says all business rules must be checked on
 *        the server (e.g. "status can only move forward"), and this is the
 *        connection those server checks will use to read and write the Data layer.
 *
 * WHY cookies? When a user logs in, Supabase saves their session in browser
 * cookies. The browser sends those cookies with every request, so the server can
 * read them and know WHO is asking. That matters for role checks (customer vs
 * counter_staff vs manager) and for Row Level Security (RLS), which decides which
 * database rows each user may see.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/*
 * createClient()
 * Usage on the server:
 *   const supabase = await createClient();
 *
 * It is "async" because in this version of Next.js, cookies() returns a Promise,
 * so we have to "await" it before we can read the cookies.
 *
 * IMPORTANT: make a NEW client for every request (never share one between users),
 * otherwise one user's session could leak into another user's request.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Fail early with a clear message if .env.local is not filled in.
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Fill in NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart `npm run dev`."
    );
  }

  // The cookie jar for THIS request (the cookies the browser sent us).
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      // Supabase calls this to READ the session cookies.
      getAll() {
        return cookieStore.getAll();
      },
      // Supabase calls this to WRITE cookies (for example after it refreshes an
      // expired login token).
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Next.js only allows setting cookies in Server Actions and Route
          // Handlers, NOT while rendering a Server Component page. If we land
          // here from a page, it is safe to ignore: in the login part we will
          // add a "proxy" file that refreshes the session cookies on every
          // request, so they are kept up to date there instead.
        }
      },
    },
  });
}
