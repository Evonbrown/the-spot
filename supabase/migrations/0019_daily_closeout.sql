-- =============================================================================
-- supabase/migrations/0019_daily_closeout.sql   (Build step 7, Step 36)
--
-- WHAT: Daily closeout (SDS class DailyCloseout, FR-06 SR-6.6, SR-6.7,
--       SR-6.8, SR-6.10):
--         1. store_settings: ONE row with the cash difference limit (J$500 by
--            default; the Manager changes it, no code change needed);
--         2. daily_closeouts: one row per business day: the cash count, and
--            once approved, the saved figures and is_locked = true;
--         3. daily_closeout_events: the history (count submitted, approved,
--            reopened) with WHO, WHEN and the REASON (a day may be reopened
--            more than once, so every reason is kept);
--         4. LOCK triggers: once a day is locked, its orders, payments and
--            deliveries can't change, and no new order can be placed on it;
--         5. the functions that do the work (server only): count, approve,
--            reopen, set the limit; and closeout_details() to READ it all.
--
-- LAYER: Data layer (Supabase Postgres).
--
-- THE RULES:
--   - A business day = midnight to midnight JAMAICA time; an order belongs to
--     the day it was PLACED (same as the reports, 0016/0017).
--   - EXPECTED cash = the PAID cash of that day's counted orders (the same
--     "Cash" figure as the sales summary). STEP 38: minus cash refunds.
--   - Difference = counted - expected. If it is more than the limit (over OR
--     short), an explanation of 10+ characters is required.
--   - OPEN orders (Pending, In progress, Ready for pickup, Being delivered)
--     block the count for counter staff, and block approval unless the
--     Manager writes an OVERRIDE reason (decision: allowed, with a warning;
--     those orders are then frozen by the lock until a reopen).
--   - Counter staff: count TODAY only. Manager: count, approve, reopen any
--     day up to today. Approve and reopen: MANAGER ONLY.
--   - Approval re-checks expected cash: if it changed since the count
--     (e.g. a late cash order), approval is refused: count again.
--
-- WHO WRITES? Nobody with the public key. Our server actions
--   (src/lib/reports/closeout-actions.ts) call the functions below with the
--   secret key, passing who is acting (from the login cookie); each function
--   checks that person's role itself.
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0019_closeout_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Small helper: which Jamaica DAY is this moment in? (e.g. 11 p.m. UTC on
--    the 15th is 6 p.m. on the 15th in Jamaica.)
-- -----------------------------------------------------------------------------
create function public.jamaica_day(p_moment timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_moment at time zone 'America/Jamaica')::date
$$;


-- -----------------------------------------------------------------------------
-- 1. store_settings: exactly ONE row ("id" can only be true).
-- -----------------------------------------------------------------------------
create table public.store_settings (
  id                    boolean primary key default true
                          constraint store_settings_one_row check (id),
  cash_difference_limit numeric(10, 2) not null default 500
                          constraint store_settings_limit_valid check (cash_difference_limit between 0 and 100000),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles (id)
);

insert into public.store_settings (id) values (true);


-- -----------------------------------------------------------------------------
-- 2. daily_closeouts: one row per business day.
--    status    = SUBMITTED (cash counted, waiting for the Manager),
--                APPROVED (closed: is_locked = true),
--                REOPENED (the Manager unlocked it; count again to close).
--    summary   = the sales figures saved AT APPROVAL (orders, gross, net, Lynk,
--                Cash ...), so the closed day's record never changes.
-- -----------------------------------------------------------------------------
create table public.daily_closeouts (
  business_day      date primary key,
  status            text not null
                      constraint daily_closeouts_status_valid
                      check (status in ('SUBMITTED', 'APPROVED', 'REOPENED')),
  is_locked         boolean not null default false,
  expected_cash     numeric(10, 2) not null,
  counted_cash      numeric(10, 2) not null,
  cash_difference   numeric(10, 2) not null, -- counted - expected
  difference_note   text not null default ''
                      constraint daily_closeouts_note_max check (char_length(difference_note) <= 500),
  submitted_by      uuid not null references public.profiles (id),
  submitted_at      timestamptz not null,
  summary           jsonb,
  override_reason   text
                      constraint daily_closeouts_reason_max check (char_length(override_reason) <= 500),
  open_orders_at_approval integer,
  approved_by       uuid references public.profiles (id),
  approved_at       timestamptz,
  -- Locked exactly when approved, and an approval must say who and when.
  constraint daily_closeouts_locked_means_approved check (is_locked = (status = 'APPROVED')),
  constraint daily_closeouts_approved_needs_who
    check (status <> 'APPROVED' or (approved_by is not null and approved_at is not null and summary is not null))
);


-- -----------------------------------------------------------------------------
-- 3. daily_closeout_events: the history. Never changed, only added to.
-- -----------------------------------------------------------------------------
create table public.daily_closeout_events (
  id           bigint generated by default as identity primary key,
  business_day date not null references public.daily_closeouts (business_day),
  action       text not null
                 constraint daily_closeout_events_action_valid
                 check (action in ('SUBMITTED', 'APPROVED', 'REOPENED')),
  reason       text,
  actor        uuid not null references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index daily_closeout_events_day_idx on public.daily_closeout_events (business_day);


-- -----------------------------------------------------------------------------
-- 4. RLS: read-only, and only what each role needs. No writes for anyone
--    with the public key (only the functions below write).
-- -----------------------------------------------------------------------------
alter table public.store_settings        enable row level security;
alter table public.daily_closeouts       enable row level security;
alter table public.daily_closeout_events enable row level security;

revoke all on public.store_settings, public.daily_closeouts, public.daily_closeout_events
  from anon, authenticated;
grant select on public.store_settings, public.daily_closeouts, public.daily_closeout_events
  to authenticated;

create policy "Manager and counter staff can read the store settings"
  on public.store_settings for select to authenticated
  using ((select public.current_user_role()) in ('manager', 'counter_staff'));

create policy "Manager can read all closeouts"
  on public.daily_closeouts for select to authenticated
  using ((select public.current_user_role()) = 'manager');

-- SR-6.10: counter staff see TODAY's closeout only.
create policy "Counter staff can read today's closeout"
  on public.daily_closeouts for select to authenticated
  using (
    (select public.current_user_role()) = 'counter_staff'
    and business_day = public.jamaica_day(now())
  );

create policy "Manager can read the closeout history"
  on public.daily_closeout_events for select to authenticated
  using ((select public.current_user_role()) = 'manager');


-- -----------------------------------------------------------------------------
-- 5. THE LOCK (SR-6.8): refuse changes to a locked day.
--    A trigger runs before every change. "Which day?" = the day the ORDER
--    was placed. It runs for everyone (server, SQL Editor), so it can't be
--    skipped. STEP 38: the refunds table must get the same trigger.
-- -----------------------------------------------------------------------------

-- Is this business day locked?
create function public.is_day_locked(p_day date)
returns boolean
language sql
stable
security definer -- reads daily_closeouts whoever is changing the order
set search_path = ''
as $$
  select exists (select 1 from public.daily_closeouts c
                  where c.business_day = p_day and c.is_locked)
$$;

-- orders: new orders (decision: "closed for today") and any change.
create function public.enforce_day_not_locked_orders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_day_locked(public.jamaica_day(coalesce(new.created_at, now()))) then
      raise exception 'The Spot has closed for today. Please order tomorrow.';
    end if;
  else
    -- Check the order's day before AND after (in case created_at is moved).
    if public.is_day_locked(public.jamaica_day(old.created_at))
       or public.is_day_locked(public.jamaica_day(new.created_at)) then
      raise exception 'Order %: the business day % is closed, so it can''t change. The Manager can reopen the day.',
        old.id, public.jamaica_day(old.created_at);
    end if;
  end if;
  return new;
end;
$$;

-- payments and deliveries: look up their order's day.
create function public.enforce_day_not_locked_by_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created timestamptz;
begin
  select o.created_at into v_created from public.orders o where o.id = new.order_id;
  if v_created is not null and public.is_day_locked(public.jamaica_day(v_created)) then
    raise exception 'Order %: the business day % is closed, so its % can''t change. The Manager can reopen the day.',
      new.order_id, public.jamaica_day(v_created), tg_table_name;
  end if;
  return new;
end;
$$;

revoke execute on function public.is_day_locked(date) from public, anon, authenticated;
revoke execute on function public.enforce_day_not_locked_orders() from public, anon, authenticated;
revoke execute on function public.enforce_day_not_locked_by_order() from public, anon, authenticated;

create trigger orders_day_not_locked
  before insert or update on public.orders
  for each row execute function public.enforce_day_not_locked_orders();

create trigger payments_day_not_locked
  before insert or update on public.payments
  for each row execute function public.enforce_day_not_locked_by_order();

create trigger deliveries_day_not_locked
  before insert or update on public.deliveries
  for each row execute function public.enforce_day_not_locked_by_order();


-- -----------------------------------------------------------------------------
-- 6. Helpers for the closeout functions (nobody may call them directly).
-- -----------------------------------------------------------------------------

-- The day's figures (same as the sales summary, 0017).
create function public.closeout_summary(p_day date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.report_summary(public.jamaica_midnight(p_day), public.jamaica_midnight(p_day + 1))
$$;

-- EXPECTED cash = the summary's Cash net (PAID cash of counted orders).
create function public.closeout_expected_cash(p_day date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select (m ->> 'net')::numeric
      from jsonb_array_elements(public.closeout_summary(p_day) -> 'by_method') m
     where m ->> 'method' = 'CASH'
  ), 0)
$$;

-- The day's OPEN orders: [{id, status}, ...] in Order ID order.
create function public.closeout_open_orders(p_day date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status) order by r.id), '[]'::jsonb)
    from public.report_orders(public.jamaica_midnight(p_day), public.jamaica_midnight(p_day + 1)) r
   where r.status in ('PENDING', 'IN_PROGRESS', 'READY_FOR_PICKUP', 'BEING_DELIVERED')
$$;

-- The acting person's role (from their profile), or null.
create function public.closeout_actor_role(p_actor uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select p.role::text from public.profiles p where p.id = p_actor
$$;

revoke execute on function public.closeout_summary(date) from public, anon, authenticated;
revoke execute on function public.closeout_expected_cash(date) from public, anon, authenticated;
revoke execute on function public.closeout_open_orders(date) from public, anon, authenticated;
revoke execute on function public.closeout_actor_role(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 7. submit_closeout_count(day, counted, note, actor): stage 1 (SR-6.7).
--    Counter staff: TODAY only, and no open orders. Manager: any day up to
--    today (open orders allowed here; they need an override to APPROVE).
--    Can be submitted again (replaced) until the day is approved.
--    Returns {expected_cash, counted_cash, cash_difference}.
-- -----------------------------------------------------------------------------
create function public.submit_closeout_count(
  p_day     date,
  p_counted numeric,
  p_note    text,
  p_actor   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role     text := public.closeout_actor_role(p_actor);
  v_today    date := public.jamaica_day(now());
  v_open     jsonb;
  v_expected numeric;
  v_counted  numeric;
  v_diff     numeric;
  v_limit    numeric;
  v_note     text := btrim(coalesce(p_note, ''));
begin
  -- WHO and WHICH DAY (SR-6.10).
  if v_role = 'counter_staff' then
    if p_day is distinct from v_today then
      raise exception 'Counter staff can only close out today.';
    end if;
  elsif v_role = 'manager' then
    if p_day is null or p_day > v_today then
      raise exception 'Choose today or an earlier day.';
    end if;
  else
    raise exception 'Only counter staff or the Manager can count the cash.';
  end if;

  -- Already closed?
  if public.is_day_locked(p_day) then
    raise exception 'This day is already closed. The Manager must reopen it first.';
  end if;

  -- SR-6.6: open orders block counter staff.
  v_open := public.closeout_open_orders(p_day);
  if v_role = 'counter_staff' and jsonb_array_length(v_open) > 0 then
    raise exception '% order(s) from this day are still open. Finish or cancel them before closing out.',
      jsonb_array_length(v_open);
  end if;

  -- The amount counted.
  if p_counted is null or p_counted < 0 or p_counted > 99999999 then
    raise exception 'Enter the cash counted (J$0 or more).';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'The explanation can be at most 500 characters.';
  end if;

  v_counted  := round(p_counted, 2);
  v_expected := public.closeout_expected_cash(p_day);
  v_diff     := v_counted - v_expected;
  select s.cash_difference_limit into v_limit from public.store_settings s where s.id;

  -- SR-6.7: a big difference (over OR short) needs an explanation.
  if abs(v_diff) > v_limit and char_length(v_note) < 10 then
    raise exception 'The difference (J$%) is more than the allowed J$%. Write an explanation (at least 10 characters).',
      v_diff, v_limit;
  end if;

  -- Save (or replace) the count. Approval fields are cleared.
  insert into public.daily_closeouts (
    business_day, status, is_locked, expected_cash, counted_cash, cash_difference,
    difference_note, submitted_by, submitted_at
  )
  values (p_day, 'SUBMITTED', false, v_expected, v_counted, v_diff, v_note, p_actor, now())
  on conflict (business_day) do update
     set status          = 'SUBMITTED',
         is_locked       = false,
         expected_cash   = excluded.expected_cash,
         counted_cash    = excluded.counted_cash,
         cash_difference = excluded.cash_difference,
         difference_note = excluded.difference_note,
         submitted_by    = excluded.submitted_by,
         submitted_at    = excluded.submitted_at,
         summary         = null,
         override_reason = null,
         open_orders_at_approval = null,
         approved_by     = null,
         approved_at     = null;

  insert into public.daily_closeout_events (business_day, action, reason, actor)
  values (p_day, 'SUBMITTED', nullif(v_note, ''), p_actor);

  return jsonb_build_object('expected_cash', v_expected, 'counted_cash', v_counted, 'cash_difference', v_diff);
end;
$$;


-- -----------------------------------------------------------------------------
-- 8. approve_closeout(day, override_reason, actor): stage 2 (SR-6.8).
--    MANAGER ONLY. Needs a submitted count. Re-checks expected cash and open
--    orders NOW, saves the figures and LOCKS the day.
-- -----------------------------------------------------------------------------
create function public.approve_closeout(
  p_day             date,
  p_override_reason text,
  p_actor           uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row      public.daily_closeouts;
  v_open     jsonb;
  v_expected numeric;
  v_reason   text := nullif(btrim(coalesce(p_override_reason, '')), '');
begin
  if public.closeout_actor_role(p_actor) is distinct from 'manager' then
    raise exception 'Only the Manager can approve a closeout.';
  end if;

  -- The count, locked so nobody changes it while we approve.
  select * into v_row from public.daily_closeouts c where c.business_day = p_day for update;
  if not found or v_row.status <> 'SUBMITTED' then
    raise exception 'Count the cash for this day first.';
  end if;

  -- Did the expected cash change since the count?
  v_expected := public.closeout_expected_cash(p_day);
  if v_expected <> v_row.expected_cash then
    raise exception 'The figures changed since the count (expected cash is now J$%). Please count again.', v_expected;
  end if;

  -- SR-6.6: open orders need a written override (decision: allowed, frozen).
  v_open := public.closeout_open_orders(p_day);
  if jsonb_array_length(v_open) > 0 and char_length(coalesce(v_reason, '')) < 10 then
    raise exception '% order(s) are still open. To close the day anyway, write a reason (at least 10 characters).',
      jsonb_array_length(v_open);
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'The reason can be at most 500 characters.';
  end if;

  update public.daily_closeouts
     set status          = 'APPROVED',
         is_locked       = true,
         summary         = public.closeout_summary(p_day),
         override_reason = case when jsonb_array_length(v_open) > 0 then v_reason end,
         open_orders_at_approval = jsonb_array_length(v_open),
         approved_by     = p_actor,
         approved_at     = now()
   where business_day = p_day;

  insert into public.daily_closeout_events (business_day, action, reason, actor)
  values (p_day, 'APPROVED', case when jsonb_array_length(v_open) > 0 then v_reason end, p_actor);

  return true;
end;
$$;


-- -----------------------------------------------------------------------------
-- 9. reopen_closeout(day, reason, actor): MANAGER ONLY, with a reason
--    (SR-6.8). Unlocks the day; to close it again: count + approve again.
-- -----------------------------------------------------------------------------
create function public.reopen_closeout(p_day date, p_reason text, p_actor uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if public.closeout_actor_role(p_actor) is distinct from 'manager' then
    raise exception 'Only the Manager can reopen a day.';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'Write why the day is being reopened (at least 10 characters).';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'The reason can be at most 500 characters.';
  end if;
  if not public.is_day_locked(p_day) then
    raise exception 'This day isn''t closed.';
  end if;

  update public.daily_closeouts
     set status = 'REOPENED', is_locked = false,
         summary = null, override_reason = null, open_orders_at_approval = null,
         approved_by = null, approved_at = null
   where business_day = p_day;

  insert into public.daily_closeout_events (business_day, action, reason, actor)
  values (p_day, 'REOPENED', v_reason, p_actor);

  return true;
end;
$$;


-- -----------------------------------------------------------------------------
-- 10. set_cash_difference_limit(limit, actor): MANAGER ONLY.
-- -----------------------------------------------------------------------------
create function public.set_cash_difference_limit(p_limit numeric, p_actor uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.closeout_actor_role(p_actor) is distinct from 'manager' then
    raise exception 'Only the Manager can change the cash difference limit.';
  end if;
  if p_limit is null or p_limit < 0 or p_limit > 100000 then
    raise exception 'The limit must be between J$0 and J$100,000.';
  end if;
  update public.store_settings
     set cash_difference_limit = round(p_limit, 2), updated_at = now(), updated_by = p_actor
   where id;
  return true;
end;
$$;

-- The four WRITE functions: our server (service_role) only.
revoke execute on function public.submit_closeout_count(date, numeric, text, uuid) from public, anon, authenticated;
revoke execute on function public.approve_closeout(date, text, uuid) from public, anon, authenticated;
revoke execute on function public.reopen_closeout(date, text, uuid) from public, anon, authenticated;
revoke execute on function public.set_cash_difference_limit(numeric, uuid) from public, anon, authenticated;
grant execute on function public.submit_closeout_count(date, numeric, text, uuid) to service_role;
grant execute on function public.approve_closeout(date, text, uuid) to service_role;
grant execute on function public.reopen_closeout(date, text, uuid) to service_role;
grant execute on function public.set_cash_difference_limit(numeric, uuid) to service_role;


-- -----------------------------------------------------------------------------
-- 11. closeout_details(day): everything the closeout box SHOWS, for the
--     logged-in person (their own login, not the secret key):
--     manager -> any day; counter staff -> today only; others refused.
--     Includes NAMES of who counted / approved (staff can't read other
--     staff profiles directly, so the function looks them up).
-- -----------------------------------------------------------------------------
create function public.closeout_details(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.current_user_role();
begin
  if v_role = 'counter_staff' then
    if p_day is distinct from public.jamaica_day(now()) then
      raise exception 'Counter staff can only see today''s closeout.';
    end if;
  elsif v_role is distinct from 'manager' then
    raise exception 'You are not allowed to see closeouts.';
  end if;

  return jsonb_build_object(
    'day',           p_day,
    'expected_cash', public.closeout_expected_cash(p_day),
    'open_orders',   public.closeout_open_orders(p_day),
    'limit',         (select s.cash_difference_limit from public.store_settings s where s.id),
    'closeout', (
      select jsonb_build_object(
               'status',          c.status,
               'is_locked',       c.is_locked,
               'expected_cash',   c.expected_cash,
               'counted_cash',    c.counted_cash,
               'cash_difference', c.cash_difference,
               'difference_note', c.difference_note,
               'submitted_by',    (select p.full_name from public.profiles p where p.id = c.submitted_by),
               'submitted_at',    c.submitted_at,
               'override_reason', c.override_reason,
               'approved_by',     (select p.full_name from public.profiles p where p.id = c.approved_by),
               'approved_at',     c.approved_at,
               'summary',         c.summary)
        from public.daily_closeouts c where c.business_day = p_day),
    -- The history: Manager only (counter staff get an empty list).
    'events', case when v_role = 'manager' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'action',     e.action,
               'reason',     e.reason,
               'actor',      (select p.full_name from public.profiles p where p.id = e.actor),
               'created_at', e.created_at) order by e.id), '[]'::jsonb)
        from public.daily_closeout_events e where e.business_day = p_day)
      else '[]'::jsonb end
  );
end;
$$;

revoke execute on function public.closeout_details(date) from public, anon;
grant execute on function public.closeout_details(date) to authenticated;
