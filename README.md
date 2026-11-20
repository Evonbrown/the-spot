# The Spot – Food Sales Management System

COMP2140 group project (Group ACE, UWI Mona): a pre-order and pickup/delivery web app for The Spot Sports Bar & Grill.

Built with **Next.js** (App Router, TypeScript), **Tailwind CSS** and **Supabase** (Postgres database, Auth, Realtime).

## What you need
- **Node.js 20.9 or newer** (includes `npm`)
- A **Supabase** project (free tier is fine)

## Run it on your computer

1. **Install the packages**
   ```bash
   npm install
   ```

2. **Add your Supabase keys.** Create a file called `.env.local` in the project folder:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```
   Find both in Supabase under **Project Settings → API**. Never commit this file (it is already in `.gitignore`).

3. **Set up the database.** In Supabase, open **SQL Editor** and run these files **in this order**:
   1. `supabase/migrations/0001_profiles.sql`
   2. `supabase/migrations/0002_menu_items.sql`
   3. `supabase/migrations/0003_menu_item_sizes.sql`
   4. `supabase/migrations/0004_customizations.sql`
   5. `supabase/seed/real_menu_items.sql` (the menu)
   6. `supabase/seed/sample_customizations.sql` (sample extras)

4. **Start the app**
   ```bash
   npm run dev
   ```
   Open <http://localhost:3000>.

New sign-ups are **customers**. To try a staff screen, change that user's `role` in the `profiles` table (Supabase **Table Editor**) to `counter_staff`, `delivery_personnel`, `manager` or `supervisor`.

## Other commands
| Command | What it does |
|---|---|
| `npm run build` | Builds the production version and checks for errors |
| `npm run start` | Runs the production build (after `npm run build`) |
| `npm run lint` | Checks the code style |

## Project notes
- `CLAUDE.md`: requirements summary (SRS/SDS), roles, statuses, build order and decisions made.
- `LEARNING.md`: study notes for each part we built.
- `the-spot-real-menu.md`: the real menu copied from the menu boards, with open questions for the client.
- `studio/`: code from studio sessions (not part of the app).
