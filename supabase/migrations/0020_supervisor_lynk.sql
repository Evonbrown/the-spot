-- =============================================================================
-- supabase/migrations/0020_supervisor_lynk.sql   (Build step 7, Step 38a)
--
-- WHAT: What the Supervisor screen needs to CHECK LYNK PAYMENTS (FR-02,
--       FR-06, UC-07, SDS class Supervisor):
--         1. payments get a "NOT RECEIVED" flag (when, who, an optional
--            note). The payment stays UNPAID; counter staff see the flag.
--         2. READ rules (RLS) for the Supervisor: all orders, all payments,
--            and the name + phone of customers who have an order.
--         3. verify_lynk_payment(): the Supervisor saw the money in the Lynk
--            app -> the payment becomes PAID (paid_at, paid_by), so it counts
--            in the sales reports (Step 34).
--         4. flag_lynk_not_received(): the money is NOT in the Lynk app ->
--            flag it (it can still be verified later if the money arrives).
--
-- LAYER: Data layer (Supabase Postgres).
--
-- WHO MAY WRITE? Only our server (service_role), like every other write
--   since Step 26. The server action passes WHO is acting (p_supervisor),
--   taken from the login cookie; the functions check that person really is
--   a supervisor. Nobody can change payments with the public key (0006 only
--   grants SELECT).
--
-- THE CLOSED-DAY LOCK (Step 36) already covers this: payments of an order
--   placed on a locked day can't change (trigger payments_day_not_locked),
--   so a Lynk payment of a closed day can't be verified or flagged until
--   the Manager reopens the day.
--
-- REFUNDS are Step 38b (a separate migration).
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0020_supervisor_lynk_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The "not received" flag on payments.
--    not_received_at   when the Supervisor flagged it (null = not flagged);
--    not_received_by   which Supervisor;
--    not_received_note an optional short note ("Nothing in Lynk at 1:15").
--    The CHECKs keep it tidy: "when" and "who" are filled in TOGETHER, and a
--    note is at most 200 characters.
-- -----------------------------------------------------------------------------
alter table public.payments
  add column not_received_at   timestamptz,
  add column not_received_by   uuid references public.profiles (id),
  add column not_received_note text;

alter table public.payments
  add constraint payments_not_received_who_and_when
    check ((not_received_at is null) = (not_received_by is null)),
  add constraint payments_not_received_note_length
    check (not_received_note is null or char_length(not_received_note) <= 200);


-- -----------------------------------------------------------------------------
-- 2. READ rules for the Supervisor (read-only: no new grants).
--    Policies add up: customers still read only their own (0006), counter
--    staff and drivers keep theirs. (select ...) around current_user_role()
--    = worked out once per query, not once per row (see 0008).
-- -----------------------------------------------------------------------------

-- 2a. All orders: to list the Lynk payments with their Order ID, time and
--     status (and so Realtime tells the Supervisor's screen about changes).
create policy "Supervisor can read all orders"
  on public.orders
  for select
  to authenticated
  using ((select public.current_user_role()) = 'supervisor');

-- 2b. All payments (method, amount, status, flag).
create policy "Supervisor can read all payments"
  on public.payments
  for select
  to authenticated
  using ((select public.current_user_role()) = 'supervisor');

-- 2c. Customers WHO HAVE AN ORDER (name + phone), the same narrow rule as
--     counter staff (0008): no other staff accounts, no customers who never
--     ordered. Emails stay in Supabase Auth, so they stay hidden.
create policy "Supervisor can read customers who have orders"
  on public.profiles
  for select
  to authenticated
  using (
    (select public.current_user_role()) = 'supervisor'
    and role = 'customer'
    and exists (select 1 from public.orders o where o.customer_id = profiles.id)
  );


-- -----------------------------------------------------------------------------
-- 3. verify_lynk_payment(order, supervisor) -> true when saved.
--    Returns FALSE (nothing changes) if the payment is ALREADY PAID: another
--    Supervisor verified it a moment ago. The app then says so (the same
--    "someone else changed it" idea as Step 26).
--    Raises an error for broken rules (not a supervisor, not Lynk, ...).
--    "for update" locks the payment row until we finish, so two Supervisors
--    pressing at the same moment can't both "verify" it.
--    It also touches orders.updated_at: payments are not in Realtime, but
--    orders are, so the staff and Supervisor screens refresh by themselves.
-- -----------------------------------------------------------------------------
create function public.verify_lynk_payment(
  p_order_id   bigint,
  p_supervisor uuid
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_method text;
  v_status text;
begin
  -- Only the Supervisor verifies Lynk payments (FR-02).
  if not exists (select 1 from public.profiles p
                  where p.id = p_supervisor and p.role = 'supervisor') then
    raise exception 'Only the Supervisor can verify Lynk payments.';
  end if;

  select pay.method, pay.status into v_method, v_status
    from public.payments pay
   where pay.order_id = p_order_id
     for update;

  if not found then
    raise exception 'Order %: there is no payment for this order.', p_order_id;
  end if;
  if v_method <> 'LYNK' then
    raise exception 'Order %: this is a cash payment. Cash is marked paid when it''s received.', p_order_id;
  end if;
  if v_status <> 'UNPAID' then
    return false; -- already verified (by someone else, a moment ago)
  end if;

  -- PAID + when + who (the CHECK from 0010 needs both). The flag is cleared:
  -- the money has arrived after all.
  update public.payments
     set status            = 'PAID',
         paid_at           = now(),
         paid_by           = p_supervisor,
         not_received_at   = null,
         not_received_by   = null,
         not_received_note = null
   where order_id = p_order_id;

  update public.orders set updated_at = now() where id = p_order_id;
  return true;
end;
$$;

revoke execute on function public.verify_lynk_payment(bigint, uuid) from public, anon, authenticated;
grant execute on function public.verify_lynk_payment(bigint, uuid) to service_role;


-- -----------------------------------------------------------------------------
-- 4. flag_lynk_not_received(order, note, supervisor) -> true when saved.
--    The payment stays UNPAID (it does NOT count in sales). Flagging again
--    just updates the time and note. Returns FALSE if it was verified
--    meanwhile (nothing to flag any more).
-- -----------------------------------------------------------------------------
create function public.flag_lynk_not_received(
  p_order_id   bigint,
  p_note       text,
  p_supervisor uuid
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_method text;
  v_status text;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not exists (select 1 from public.profiles p
                  where p.id = p_supervisor and p.role = 'supervisor') then
    raise exception 'Only the Supervisor can flag Lynk payments.';
  end if;
  if char_length(coalesce(v_note, '')) > 200 then
    raise exception 'The note can be at most 200 characters.';
  end if;

  select pay.method, pay.status into v_method, v_status
    from public.payments pay
   where pay.order_id = p_order_id
     for update;

  if not found then
    raise exception 'Order %: there is no payment for this order.', p_order_id;
  end if;
  if v_method <> 'LYNK' then
    raise exception 'Order %: this is a cash payment, not Lynk.', p_order_id;
  end if;
  if v_status <> 'UNPAID' then
    return false; -- verified meanwhile: nothing to flag
  end if;

  update public.payments
     set not_received_at   = now(),
         not_received_by   = p_supervisor,
         not_received_note = v_note
   where order_id = p_order_id;

  update public.orders set updated_at = now() where id = p_order_id;
  return true;
end;
$$;

revoke execute on function public.flag_lynk_not_received(bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.flag_lynk_not_received(bigint, text, uuid) to service_role;
