# The Spot Food Sales Management System

COMP2140 group project (Group ACE, UWI Mona). This web app must match our SRS (requirements) and SDS (design). When anything below conflicts with an idea you have, follow this file.

## How to work with me (most important section)
I am a student and I must understand everything we build, because my lecturer can ask me about any part of it. Teaching me matters more than speed.

Build in parts:
- Work on ONE small part at a time (for example "the login page" or "the cart", not "the whole ordering feature").
- Before writing any code, explain in plain words: what this part does, why we need it (link it to the SRS feature, e.g. FR-05), and which files you will create or change. Then wait for me to say "go".
- After finishing a part, STOP. Tell me how to test it in the browser and wait for me to confirm it works before starting the next part.

Comment the code:
- At the top of every file, write a short comment explaining what the file is for and where it fits in our three layers (Presentation, Application or Data).
- Above every function, component and important block, write a comment explaining WHAT it does and WHY it is done this way.
- Explain any rule from our SRS where it is enforced (e.g. "// FR-05 SR-5.3: status can only move forward").
- Use plain, beginner-friendly English in comments. Avoid jargon, or explain it the first time you use it.

Explain as we go:
- After each part, give me a short summary: what you built, what each new file does, and one or two key ideas I should understand (e.g. what Row Level Security is).
- Keep a file called LEARNING.md. After each part, add a section with: the part's name, the files involved, what they do, and the key concepts, so I can study it before presentations.
- If I ask "why", explain it simply with an example from our system.

Rules:
- Do not rename classes, statuses or roles listed here. Ask before adding anything not listed.
- Never build several parts at once, even if it would be faster.

## Stack
- Next.js (App Router, TypeScript) with Tailwind CSS
- Supabase: Postgres database, Auth (email + password), Realtime (live status updates without refresh)
- Deploy on Vercel
- Must work in current Chrome, Safari, Firefox and Edge on phones and computers. Staff and Manager screens are used on smartphones, so design mobile-first.

## Branding (for a later "branding" part; do not change the design until then)
- The Spot's real logo is `public/the-spot-logo.jpeg`: a red circle with "spot" in white script, "Sports Bar & Grill" underneath, and "THE" in a small orange box.
- In the branding part: switch the colour scheme to match the logo (red = main colour, orange = accent, white text on red), and put the logo at the top left of the header.
- Current placeholder colours live in `src/app/globals.css` (`@theme`), so the switch should happen there.

## Open decisions (settle before Build step 8)
- Login with "email or student ID": the SRS allows both. For now login is EMAIL ONLY. Decide whether to add student ID login (and how customers without a student ID log in) before Build step 8.

## Decisions made
- Menu is public: anyone can browse it without logging in. Only ordering needs an account.
- Menu item category is a plain text column (not an enum).
- The cart lives in the browser for now; the server re-checks prices and availability at checkout (Build step 3).
- Strict role access: each role opens only its own screen (e.g. a manager cannot open /staff).
- Phone number is required at sign-up; minimum password length is 8.
- Login is email only for now (see "Open decisions" for student ID login).
- Sizes (Option C): MenuItem has `price` (single-price items, e.g. drinks) OR `price_small` / `price_medium` / `price_large` (food). An empty size = not offered. No new class/table. Drinks sold in two sizes stay as separate single-price items (e.g. "Sprite (Small)").
- Real menu (the-spot-real-menu.md), until the client answers:
  - Items with no price (Snapper Fish, Boom, Supligen, True Juice) are left out.
  - Curry Goat Large = 1500 (unconfirmed: 1500 or 1600).
  - Allergens unknown: `allergens` NULL = not confirmed, shown as "ask at the counter" (SAF-2). Never show "None listed" for unconfirmed items.
  - Alcohol items are added but marked unavailable until the client decides on online alcohol sales.
  - Oxtail (Thursdays) and Stew Peas (Wednesdays) are daily specials; the Manager switches is_available on for their day, so they show in "Today's specials" only then. Day noted in the description.
  - Categories (Part 10): Chicken, Pork & Beef, Goat & Fish, Mixes, Sodas, Water & Juice, Energy & Sports, Alcohol. Each has its own sort_order block (100s, 200s, ... 1500s). Only Chicken & Fries is made-to-order.
  - Menu usability parts: 10 categories, 11 sticky bar + highlight + 4 cards per row, 12 compact rows for single-price items, 13 search. Then customizations, then cart.
- Customizations (FR-02): one shared list for ALL food (sized items); drinks have none (no link table). `kind` is 'side' or 'sauce'. Chosen with tick boxes, each at most once (no quantities). Real extras unknown: sample extras are marked "(Sample)" in the name until the client gives the real ones.
- Parts: 14 customizations table + sample seed; 15 options panel on Add (size, extras, meal note, quantity, live price); 16 cart (browser storage, cart page, header count). Meal notes: max 200 characters, checked on the server at checkout; saved on the order item (Build step 3).
- Options panel: no size is pre-chosen unless the item has only one size; quantity per cart line is 1-10.
- Cart: split into Part 16 (browser storage + Add buttons + header count) and Part 17 (cart page). The cart link is for visitors and customers only (no cart for staff). On the cart page a line can only change quantity or be removed (to change size/extras/note: remove and add again). The cart is kept when someone logs in, but CLEARED when they log out (shared campus computers), and cleared after an order is placed (Build step 3). Descriptions empty until the client says what comes with each meal.

## Architecture (SDS 2.3: three-tier layered)
- Presentation layer: role screens in `app/` (customer, staff, driver, manager, supervisor)
- Application layer: server actions / route handlers in `lib/` and `app/api/`. All business rules live here, never only in the browser.
- Data layer: Supabase tables, protected by Row Level Security (RLS)
- External services: Lynk (Jamdex) QR payments (simulate for now), SMS/email notifications (simulate or log for now)

## Roles (User subclasses)
- customer: browse menu, cart, place and track orders
- counter_staff (CounterStaff): live order queue, update statuses, assign deliveries, mark abandoned, confirm Order ID at handover
- delivery_personnel (DeliveryPersonnel): see assigned deliveries, mark Being Delivered and Completed
- manager (Manager): sales reports, daily closeout, edit menu items/prices/delivery locations
- supervisor (Supervisor): verify Lynk payments, issue refunds (only role that can refund)
Hierarchy: User -> Customer, Supervisor, Staff; Staff -> CounterStaff, DeliveryPersonnel, Manager.

## Order statuses (use exactly these, in this order)
PENDING -> IN_PROGRESS -> READY_FOR_PICKUP -> COMPLETED (pickup)
PENDING -> IN_PROGRESS -> READY_FOR_PICKUP -> BEING_DELIVERED -> COMPLETED (delivery)
End states also allowed: CANCELLED, ABANDONED.
- Status may only move forward; reject skips and backwards moves with an error message.
- A pickup order can be marked ABANDONED only 20 minutes or more after it became READY_FOR_PICKUP.

## Features (SRS 2.3)
FR-01 Online Pre-Order Placement & Scheduling
- Show menu with prices, descriptions, daily specials and allergens. Unavailable items are greyed out and cannot be added.
- Pickup or Delivery. Delivery locations only: UWI Mona, UTech, UWI Hospital.
- Lead times: standard pickup immediate; pickup containing a made-to-order item (fries) at least 15 min; delivery at least 20 min. Use the larger rule when both apply.
- Opening/delivery hours 11:00 a.m. - 7:00 p.m.
- On submit: unique numeric Order ID, confirmation shown to customer, order appears in staff queue as PENDING within 3 seconds.

FR-02 Pre-Order Customization & Submission
- Customizations (sides, extra sauces) with extra cost; meal notes (dietary instructions).
- Total = items + customizations + delivery fee (delivery only).
- Payment method: Lynk (show QR code) or Cash. Lynk payments are verified by the Supervisor; the order is still submitted immediately.

FR-03 Real-Time Order Management Queue (CounterStaff)
- Vertical queue: Order ID, items, order time, pickup/delivery, status. New orders at the bottom as PENDING.
- Update status; completed/cancelled/abandoned orders move to a "Past Orders" section.

FR-04 Delivery Processing
- Validate delivery location and hours. Staff assign delivery orders to an available DeliveryPersonnel.
- Driver sees Order ID, customer phone, drop-off location; marks Being Delivered, then Completed after confirming the Order ID.

FR-05 Real-Time Order Status Tracking & Alerts (Customer)
- Customer sees Order ID and current status; updates appear within 5 seconds without refresh (Supabase Realtime).
- Notify customer (SMS/email, simulated) when READY_FOR_PICKUP, CANCELLED or ABANDONED.
- Customers can only see their own orders.

FR-06 Sales Summary & Daily Closeout (Manager)
- Revenue from paid orders only (exclude unpaid, cancelled, abandoned). Breakdown by payment type (Lynk vs Cash). Item volume report. Date range filter. Export CSV (PDF optional).
- Closeout blocked while any order is open. Staff enter counted cash; system shows difference from expected cash. Manager approves -> day is locked (read-only). Only Manager can reopen, with a reason.
- Counter staff may only see the current day's sales.

## Non-functional requirements (SRS 3)
- PR-1 menu loads within 3 s; PR-2 status update reaches customer within 5 s; PR-3 supports 100 concurrent customers at lunch.
- SAF-1 Order ID confirmed before handover. SAF-2 show allergens on menu items.
- Security: login required; role-based access (enforce with RLS + server checks); HTTPS; passwords handled by Supabase Auth (hashed); lock account 15 min after 5 failed logins; staff auto-logout after 30 min idle; never store card details.
- Usability: a first-time customer can order in under 3 minutes (Menu -> Cart -> Checkout).
- Maintainability: menu items, prices and delivery locations editable by Manager without code changes.
- No inventory/stock tracking (client said food never runs out); use MenuItem.isAvailable instead.

## Data model (match SDS class diagram names)
User/profile (role), Customer, Staff, CounterStaff, DeliveryPersonnel, Manager, Supervisor,
Cart, Order, OrderItem, OrderStatus, Notification, Menu, MenuItem, Customization,
Payment, Refund, Delivery, SalesReport, DailyCloseout.
Suggested tables: profiles, menu_items, customizations, orders, order_items, order_item_customizations,
order_status_history, payments, refunds, deliveries, notifications, daily_closeouts.

## Build order
1. Project setup, Supabase connection, auth (sign up / log in) and roles
2. Menu + cart (FR-01, FR-02)
3. Checkout + order submission + payment method (FR-01, FR-02)
4. Staff live queue + status rules (FR-03)
5. Customer live tracking + notifications (FR-05)
6. Delivery assignment + driver screen (FR-04)
7. Manager reports + daily closeout; Supervisor refunds (FR-06, UC-07)
8. Security hardening, seed data, testing against each SRS acceptance criterion, deploy to Vercel
