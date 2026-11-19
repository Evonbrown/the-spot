# LEARNING.md — The Spot study notes

One section per part we build. Read these before presentations.

---

## ⚠️ Before deploying to Vercel (checklist)
- [ ] **Turn email confirmation back ON:** Supabase dashboard → Authentication → Sign In / Providers → Email → "Confirm email". We switched it OFF during development (Part 2) so testing is faster. Supabase's free email service only sends a few emails per hour.
- [ ] Delete the temporary `/test-connection` page (Part 1).

---

## Part 1: Connecting Next.js to Supabase (Build step 1)

**Why:** every feature needs the Data layer. Login uses Supabase Auth, the menu (FR-01) reads tables, and live tracking (FR-05 / PR-2) uses Supabase Realtime.

### Files
| File | Layer | What it does |
|---|---|---|
| `.env.local` | config | Stores the Supabase Project URL and publishable key. Ignored by git, so it never reaches GitHub. |
| `src/lib/supabase/client.ts` | Presentation ↔ Data bridge | `createClient()` for **browser** code ("use client" components). |
| `src/lib/supabase/server.ts` | Application layer | `createClient()` for **server** code (Server Components, Server Actions, Route Handlers). Reads the login session from cookies. |
| `src/app/test-connection/page.tsx` | Presentation (temporary) | Shows whether the app can reach Supabase. |
| `package.json` | n/a | Added `@supabase/supabase-js` (talks to Supabase) and `@supabase/ssr` (makes it work with Next.js cookies). |

### Key concepts
- **Environment variables:** settings kept outside the code, in `.env.local`. Names starting with `NEXT_PUBLIC_` are copied into the browser code. Anything without that prefix stays on the server only. You must restart `npm run dev` after editing the file.
- **Publishable (anon) key vs secret (service_role) key:** the publishable key is safe to show in the browser, because it can only do what Row Level Security (RLS) allows. The secret key **skips RLS**, so it must never be in browser code. We don't use it.
- **Why two helpers (browser and server)?** They run in different places. The browser can read cookies directly. The server has to read them from the incoming request with `cookies()`. CLAUDE.md says business rules must be checked on the server, so the server helper is the one our rule-checking code will use.
- **Cookies and sessions:** after login, Supabase stores a session token in a cookie. The browser sends it with every request, which is how the server knows who the user is and what role they have.
- **`<Suspense>`:** shows a fallback ("Checking…") while slow server work finishes. Our project has `cacheComponents` turned on, and that setting requires per-request work (like reading cookies) to go inside `<Suspense>`.

### Possible lecturer questions
- *Why not put the keys straight in the code?* Keys would end up on GitHub, and changing them would mean changing code.
- *Is it unsafe that the publishable key is in the browser?* No. Security comes from RLS policies and server checks, not from hiding that key.

---

## Part 2: The `profiles` table and roles (Build step 1)

**Why:** Supabase Auth stores only email and password, which are hashed (scrambled one-way, so the real password is never stored). Our app also needs each user's **role** to control access (SRS 3 Security: role-based access with RLS and server checks), plus a **phone** number (FR-04: the driver sees the customer's phone; FR-05: SMS alerts).

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0001_profiles.sql` | Data | Creates the `user_role` enum, the `profiles` table, the permissions and RLS rules, and the sign-up trigger. You run it in the Supabase SQL Editor. |

### The `profiles` table
| Column | Meaning |
|---|---|
| `id` | Same id as the login in `auth.users`. If the login is deleted, the profile is deleted too. |
| `full_name`, `phone` | Copied from the sign-up form. |
| `role` | One of `customer`, `counter_staff`, `delivery_personnel`, `manager`, `supervisor`. Default `customer`. |
| `created_at` | When the profile was made. |

### Key concepts
- **Enum:** a fixed list of allowed values. The database rejects anything else, e.g. a typo like `'manger'`.
- **One table for all roles:** the class diagram has subclasses (User → Customer, Supervisor, Staff → CounterStaff, …). They all share the same login data, so we use one table with a `role` column instead of one table per class.
- **Row Level Security (RLS):** rules inside the database that decide **which rows** a user can see or change. Once RLS is ON, everything is blocked until a policy allows it. Our policies let users read and update **only their own row** (`auth.uid() = id`).
- **Grants (column permissions):** decide **which columns** a user may touch. Users may update only `full_name` and `phone`, never `role`. Even someone sending a hand-made request with our public key cannot make themselves a manager.
- **Trigger:** code the database runs automatically. When someone signs up (a new row in `auth.users`), `handle_new_user()` creates their profile and **always** sets the role to `customer`. It never reads a role from the form.
- **`security definer`:** the trigger function runs with its owner's permissions, because the new user isn't allowed to insert into `profiles` themselves.
- **How staff get their roles (for now):** sign them up normally, then change `role` in the Supabase Table Editor. The dashboard uses an admin connection that skips RLS.

### Possible lecturer questions
- *What stops a customer from making themselves a manager?* Two things. The trigger ignores any role sent at sign-up, and the grants don't allow anyone to update the `role` column.
- *Can a customer see another customer's phone number?* No. The RLS select policy only returns the row where `id` equals the logged-in user's id.
