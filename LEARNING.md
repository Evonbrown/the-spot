# LEARNING.md — The Spot study notes

One section per part we build. Read these before presentations.

---

## ⚠️ Before deploying to Vercel (checklist)
- [ ] **Turn email confirmation back ON:** Supabase dashboard → Authentication → Sign In / Providers → Email → "Confirm email". We switched it OFF during development (Part 2) so testing is faster. Supabase's free email service only sends a few emails per hour.
- [ ] Delete the temporary `/test-connection` page (Part 1).
- [ ] **Decide on student ID login** before Build step 8. The SRS says users log in with "email or student ID", but we built **email only** (Part 4). Decide whether to add student ID login, and how non-students would log in.

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

---

## Part 3: Design preview — Home and Menu pages (sample data)

**Why:** to agree on the look before building more screens. It's also a head start on **FR-01**: menu with prices, descriptions, daily specials and allergens; unavailable items greyed out. It covers **SAF-2** too: allergens are shown on every item. The items are **made-up samples**. In Build step 2 they come from the Supabase `menu_items` table.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/sample-menu.ts` | stand-in for Data (temporary) | The `MenuItem` type, 8 sample items, opening hours, delivery locations, and `formatPrice()` (1200 → "J$1,200"). |
| `src/components/SiteHeader.tsx` | Presentation | Orange top bar with "The Spot" and the Home/Menu links. Sticks to the top while scrolling. |
| `src/components/MenuItemCard.tsx` | Presentation | One item card: badges, name, description, allergens, price, and the Add button (disabled and greyed out when unavailable). |
| `src/app/page.tsx` | Presentation | Home (`/`): welcome, "View menu" button, hours, pickup/delivery locations, today's specials. |
| `src/app/menu/page.tsx` | Presentation | Menu (`/menu`): category buttons that jump to Meals / Sides / Drinks sections. |
| `src/app/layout.tsx` | Presentation | The frame around every page: tab title "The Spot" and the header. |
| `src/app/globals.css` | Presentation | Brand colours (`brand` orange, `brand-dark`, `cream`, `ink`), defined once. |

### Key concepts
- **Component:** a reusable piece of a page, written as a function that returns HTML-like code (JSX). `MenuItemCard` is used on both the Home and Menu pages, so cards always look the same.
- **Props:** information passed into a component, like arguments to a function: `<MenuItemCard item={...} />`.
- **File-based routing:** in Next.js the folder decides the web address: `app/menu/page.tsx` → `/menu`. `layout.tsx` wraps every page.
- **Mobile-first design:** write the phone layout first (one column). Then add bigger-screen changes with prefixes: `sm:` (640px and wider) and `lg:` (1024px and wider), e.g. `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. Buttons are at least 44px tall (`min-h-11`) so they are easy to tap.
- **Tailwind theme colours:** `--color-brand` in `globals.css` creates `bg-brand`, `text-brand`, etc. Changing one line recolours the whole site.
- **TypeScript type:** `MenuItem` lists the fields every item must have. If one is missing or the wrong kind, the editor shows an error before the app even runs.

### Possible lecturer questions
- *Where is "unavailable items cannot be added" enforced?* For now only on screen: the Add button is `disabled`. When we build the cart and checkout, the **server** will also reject unavailable items, because CLAUDE.md says rules must never live only in the browser.
- *Why no stock count?* The client said food never runs out, so we use `isAvailable` instead of inventory tracking.

---

## Part 4: Sign up, log in and log out (Build step 1)

**Why:** SRS 3 Security says login is required, and passwords are handled by Supabase Auth, which stores them hashed. Every later feature needs to know **who** the user is and **what role** they have.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/auth/actions.ts` | Application | Server Actions `signUp`, `logIn` and `logOut`. They check the input on the server, then call Supabase Auth. |
| `src/lib/auth/get-profile.ts` | Application | `getCurrentProfile()`: returns the logged-in user's profile (name, phone, role), or `null`. Also the `UserRole` type. |
| `src/proxy.ts` | Application | Runs before every page request and renews the login token when it expires (about every hour). |
| `src/components/SignUpForm.tsx` | Presentation | Sign-up form (Client Component) |
| `src/components/LoginForm.tsx` | Presentation | Log-in form for every role (Client Component) |
| `src/app/signup/page.tsx`, `src/app/login/page.tsx` | Presentation | The `/signup` and `/login` pages |
| `src/components/SiteHeader.tsx` | Presentation | Shows "Log in", or your name, role and "Log out". Tapping "The Spot" goes home. |

### Rules enforced (on the server, in `actions.ts`)
- Full name required. **Phone required** (7–15 digits; spaces, dashes and a leading + allowed). Valid email.
- **Password at least 8 characters.** Also set in the Supabase dashboard, so the rule is checked in two places.
- Sign-up **never sends a role**. The Part 2 trigger always creates a `customer`.
- A failed login always says **"Email or password is incorrect."** It never says which one, so attackers can't find out which emails have accounts.
- Login is **email only** for now. Student ID login is still to decide (see the checklist at the top).

### Key concepts
- **Server Action:** a function that a form calls, but which runs **on the server** (`"use server"`). The browser can't skip its checks, which is why business rules live here.
- **Server vs Client Components:** most components run on the server and send finished HTML. A component marked `"use client"` runs in the browser and can react to the user. We need that for showing errors and disabling the button while waiting.
- **`useActionState`:** a React hook that connects a form to a Server Action. It gives back `state` (the latest result, e.g. an error), `formAction` (pass it to `<form action>`) and `pending` (true while waiting).
- **Session and cookies:** after login, Supabase puts a signed token in a cookie. `getClaims()` checks the token's **signature**, so a faked cookie is rejected.
- **Proxy (formerly "middleware"):** code that runs before every request. Pages aren't allowed to write cookies, but the proxy is, so it's the place to save a renewed token.
- **Two layers of checks:** browser checks (`required`, `type="email"`, `minLength`) are only for convenience. The server checks everything again, because anyone can skip the browser.

### Possible lecturer questions
- *Where are passwords stored?* Not in our tables at all. Supabase Auth stores them hashed. We never see or store the real password.
- *What happens when a login token expires?* `proxy.ts` asks Supabase to renew it on the next request and saves the new cookie, so the user stays logged in.
- *Why does a wrong password give the same message as an unknown email?* So nobody can use the login form to find out which emails are registered.

### Fix: the "Blocking Route" / `Date.now()` error
- **What happened:** Next.js tries to **prepare pages in advance** (prerendering) so they open instantly. When you were logged in, Supabase checked whether your login token had expired by comparing it with the current time (`Date.now()`). A time worked out in advance would be wrong later, so Next.js stopped and reported it.
- **Fix chosen:** `await connection()` at the start of `getCurrentProfile()` (`src/lib/auth/get-profile.ts`). It tells Next.js to wait for the real request before running the login check.
- **Why this fix:** login and role information must be **fresh on every request**. If it were cached, someone whose role was removed, or who just logged out, might still be shown as logged in or keep their old role. The next part uses this same helper to protect pages, so it must never be stale.
- **Trade-off:** the account area in the header can't be prepared in advance, so it appears a split second after the rest of the header. That's fine.
- **Other fixes Next.js offered (not chosen):** `"use cache: private"` saves the result for a while, which risks a stale role. Moving the check into the browser (`"use client"`) breaks our "rules on the server" principle.

---

## Part 5: A screen for each role, and blocking pages (Build step 1)

**Why:** SRS 3 Security requires role-based access, enforced by **server checks and RLS**. Without this, anyone could type `/manager` into the address bar.

### Where each role goes after logging in
| Role | Screen | Built in |
|---|---|---|
| customer | `/` (Home), `/menu` | steps 2, 3, 5 |
| counter_staff | `/staff` | step 4 |
| delivery_personnel | `/driver` | step 6 |
| manager | `/manager` | step 7 |
| supervisor | `/supervisor` | step 7 |

**Strict rule (our decision):** each role can open **only its own screen**. A Manager can't open `/staff` either. We can widen this later.

### Files
| File | Layer | What it does |
|---|---|---|
| `src/lib/auth/roles.ts` | Application | One place for the role names, labels, each role's home screen (`ROLE_HOME`) and the protected paths. |
| `src/lib/auth/require-role.ts` | Application | `requireRole([...])`, the page guard. Not logged in → `/login`. Wrong role → `/no-access`. |
| `src/proxy.ts` | Application | Also sends **logged-out** visitors away from `/staff`, `/driver`, `/manager` and `/supervisor`. |
| `src/lib/auth/actions.ts` | Application | `logIn` now reads your role from the database and sends you to your screen. |
| `src/app/staff`, `driver`, `manager`, `supervisor` (`page.tsx`) | Presentation | Placeholder screens. Each one calls `requireRole` itself. |
| `src/components/ScreenPlaceholder.tsx` | Presentation | The shared "coming soon" box for those screens (temporary). |
| `src/app/no-access/page.tsx` | Presentation | "You don't have access to this page", with a button to your own screen. |
| `src/components/RedirectIfLoggedIn.tsx` | Presentation | On `/login` and `/signup`: if you're already logged in, it sends you to your screen. |
| `src/components/SiteHeader.tsx` | Presentation | Staff see a link to their own screen (Queue / Deliveries / Reports / Payments) instead of "Menu". |

### Key concepts
- **Authentication vs authorization:** authentication asks *who are you?* (logging in). Authorization asks *are you allowed here?* (your role). `requireRole` does both: no login → `/login`, wrong role → `/no-access`.
- **Defence in depth (several layers of protection):**
  1. `proxy.ts`: a quick check that sends logged-out visitors to `/login`. It doesn't look at roles.
  2. `requireRole()` in **every** protected page: the real role check, on the server.
  3. **RLS** in the database: even if a page check were missed, the database won't hand over rows you aren't allowed to see.
  - The header link is only a shortcut, **not** security. Hiding a link doesn't stop someone typing the address.
- **Why the check is in each page, not in a layout:** in this Next.js version, a layout doesn't re-run when you move between pages, so a check there could be skipped. The Next.js docs say to check close to the page or data. Later, each **Server Action** will call `requireRole` too, because an action can be called without the page.
- **Nothing leaks before the check:** each protected page puts **all** its content inside the guarded component (inside `<Suspense>`). Nothing from the screen is sent until the role check has passed.

### Possible lecturer questions
- *What stops a customer from opening the Manager screen?* `requireRole(["manager"])` runs on the server and sends them to `/no-access`. Typing the address doesn't help.
- *Why do you need the proxy if pages already check?* It's faster for logged-out visitors, and it's an extra layer. Security never depends on one check alone.
- *Where does the app get the role from?* The `profiles` table, read on the server for the logged-in user. Never from anything the browser sends.

---

## ✅ Build step 1 complete: recap
Step 1 was "Project setup, Supabase connection, auth (sign up / log in) and roles". It took 5 parts:
1. **Supabase connection:** browser and server helpers, and the keys in `.env.local`.
2. **`profiles` table:** the 5 roles as an enum. RLS means users see and edit only their own row, and can never change their role. A trigger makes every new sign-up a customer.
3. **Design preview:** Home and Menu with sample items (Build step 2 swaps in the real database).
4. **Sign up, log in, log out:** Server Actions with server-side checks, a proxy that keeps sessions fresh, and the `connection()` fix for the Blocking Route error.
5. **Role screens and blocking:** each role is sent to its own screen. Protection comes in three layers: proxy, then `requireRole` on every page, then RLS.

**How one request flows through our three layers** (example: a manager opens `/manager`):
- `proxy.ts` sees a valid login cookie and lets the request through.
- The page calls `requireRole(["manager"])` (Application layer).
- That calls `getCurrentProfile()`, which reads the `profiles` row. RLS allows it because it's the manager's own row (Data layer).
- The role matches, so the screen is shown (Presentation layer).

---

## Part 6: The `menu_items` table (Build step 2)
The menu moves from a code file into a real database table, so the Manager can later change items and prices without code changes (Maintainability, SRS 3). The pages still use the sample file until Part 7.

### Files
| File | Layer | What it does |
|---|---|---|
| `supabase/migrations/0002_menu_items.sql` | Data | Creates `current_user_role()`, the `menu_items` table, an `updated_at` trigger, the grants and the RLS rules. You run it in the SQL Editor. |
| `supabase/seed/sample_menu_items.sql` | Data | Adds the 8 sample items (same as `src/lib/sample-menu.ts`). Run it once, after the migration. |

### The `menu_items` table
| Column | Type | Why |
|---|---|---|
| `id` | bigint, auto-numbered | Each item's unique number. |
| `name`, `description` | text | Shown on the menu (FR-01). |
| `price` | numeric(10,2), must be ≥ 0 | Exact money. See "Key concepts". |
| `category` | text | e.g. Meals, Sides, Drinks. Plain text so the Manager can add new ones. |
| `allergens` | text[] (a list) | SAF-2. `{}` = no listed allergens. |
| `is_available` | boolean | FR-01: false = greyed out, can't be added. Used instead of stock tracking. |
| `is_daily_special` | boolean | FR-01: highlighted. |
| `is_made_to_order` | boolean | FR-01: e.g. fries → pickup needs at least 15 min. |
| `sort_order` | integer | Order on the menu page. |
| `created_at`, `updated_at` | timestamptz | When added / last changed (a trigger keeps `updated_at` correct). |

### Who can do what (RLS)
| Action | Visitor (not logged in) | Customer / other staff | Manager |
|---|---|---|---|
| Read the menu | ✅ | ✅ | ✅ |
| Add / edit / delete items | ❌ | ❌ | ✅ |

### Key concepts
- **numeric vs float for money:** a float is an *approximate* number (`0.1 + 0.2` = `0.30000000000000004`). `numeric(10,2)` stores the exact value with 2 decimal places. Money must add up exactly, because the daily closeout (FR-06) compares expected cash with counted cash.
- **CHECK constraint:** a rule the database itself enforces on every row. `check (price >= 0)` means a negative price is refused even if a page has a bug or someone sends a hand-made request.
- **Grants vs RLS (again):** grants decide *which actions* a kind of user may try (anyone may SELECT; logged-in users may *try* to edit). RLS decides *which rows* the action works on (edits only succeed for a manager).
- **`current_user_role()` helper:** one function that answers "what is this user's role?" for every RLS rule. It is `security definer`, meaning it runs with its owner's permissions, so it can read the role safely, and it is reused by later tables (orders, refunds, closeouts).
- **Migration vs seed:** a migration builds the *structure* (tables, rules). Seed data is *starting content*. Keeping them apart lets us swap in The Spot's real menu later without touching the structure.

### Possible lecturer questions
- *Why is the menu readable without logging in?* Our decision: anyone can browse; only ordering needs an account. RLS has a SELECT rule for `anon` (visitors).
- *What stops a customer from changing a price through the API?* The UPDATE policy only passes when `current_user_role()` is `'manager'`. For anyone else the update changes 0 rows.
- *Why `numeric` and not `float`?* Floats round. Money must be exact, especially for cash closeout.
- *Can a manager set a price of -500?* No. The CHECK constraint refuses it, even for a manager.
