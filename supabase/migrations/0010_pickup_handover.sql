-- =============================================================================
-- supabase/migrations/0010_pickup_handover.sql   (Build step 4, Step 27)
--
-- WHAT: What the pickup handover needs in the database (FR-03, SAF-1, FR-06):
--         1. payments may now be 'PAID' (until now only 'UNPAID' was allowed).
--            'REFUNDED' still comes in Build step 7.
--         2. payments.paid_at / paid_by: WHEN the money was received and WHO
--            received it (decision). Daily closeout (FR-06) needs "which cash
--            came in today, and who took it".
--         3. change_order_status() gets one more input, p_cash_received: when
--            true, the order's CASH payment goes UNPAID -> PAID in the SAME
--            transaction as the status change and its history row.
--
-- LAYER: Data layer (Supabase Postgres).
--
-- WHO MAY MARK PAID? Still only our server (service_role). Customers and staff
--   can't change payments directly (0006 grants only SELECT). The server
--   action checks the Order ID and the "cash received" tick first
--   (src/lib/orders/status-rules.ts, checkPickupHandover).
--
-- LYNK is NOT marked paid here: the Supervisor verifies Lynk payments later
--   (Build step 7). This function refuses to mark a Lynk payment paid.
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0010_pickup_handover_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Allow 'PAID'. A CHECK rule can't be edited, so we drop it and add the
--    wider one (this is why status is text + CHECK, not an enum: see 0006).
-- -----------------------------------------------------------------------------
alter table public.payments drop constraint payments_status_valid;
alter table public.payments
  add constraint payments_status_valid check (status in ('UNPAID', 'PAID'));


-- -----------------------------------------------------------------------------
-- 2. Who received the money, and when (decision).
--    paid_by -> profiles: the staff member (or, in Build step 7, the
--    Supervisor) who confirmed the payment.
--    The rule: a PAID payment MUST say when and by whom, so a payment can't
--    quietly become "paid" with nobody responsible for it.
-- -----------------------------------------------------------------------------
alter table public.payments
  add column paid_at timestamptz,
  add column paid_by uuid references public.profiles (id);

alter table public.payments
  add constraint payments_paid_needs_who_and_when
  check (status <> 'PAID' or (paid_at is not null and paid_by is not null));


-- -----------------------------------------------------------------------------
-- 3. change_order_status(), now with p_cash_received.
--    "default false" means every call from Step 26 (4 inputs) still works
--    exactly as before. Changing a function's inputs makes it a DIFFERENT
--    function in Postgres, so we drop the old one first.
--
--    Everything below runs as ONE transaction: if anything fails (e.g. there
--    is no unpaid cash payment), the status change and history row are
--    undone too. Never "completed but the cash wasn't recorded".
-- -----------------------------------------------------------------------------
drop function public.change_order_status(bigint, public.order_status, public.order_status, uuid);

create function public.change_order_status(
  p_order_id        bigint,
  p_expected_status public.order_status,
  p_new_status      public.order_status,
  p_changed_by      uuid,
  p_cash_received   boolean default false
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_changed integer;
  v_paid    integer;
begin
  -- Cash is only received at the END (handover), never earlier.
  if p_cash_received and p_new_status <> 'COMPLETED' then
    raise exception 'Cash can only be recorded when an order is completed.';
  end if;

  -- Change the status ONLY if it is still what the staff member saw (Step 26).
  update public.orders
     set status = p_new_status
   where id = p_order_id
     and status = p_expected_status;

  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    return false; -- no such order, or someone else changed it first
  end if;

  -- Step 27: cash received at the counter -> the payment becomes PAID.
  -- ONLY a CASH payment that is still UNPAID. Lynk is verified by the
  -- Supervisor (Build step 7), so it can't be marked paid here.
  if p_cash_received then
    update public.payments
       set status  = 'PAID',
           paid_at = now(),
           paid_by = p_changed_by
     where order_id = p_order_id
       and method = 'CASH'
       and status = 'UNPAID';

    get diagnostics v_paid = row_count;
    if v_paid = 0 then
      -- Undoes the status change above too (same transaction).
      raise exception 'Order % has no unpaid cash payment to mark as paid.', p_order_id;
    end if;
  end if;

  -- Record who changed it to what (changed_at defaults to now()).
  insert into public.order_status_history (order_id, status, changed_by)
  values (p_order_id, p_new_status, p_changed_by);

  return true;
end;
$$;

-- Only the server (service_role) may run it, as before.
revoke execute on function public.change_order_status(
  bigint, public.order_status, public.order_status, uuid, boolean
) from public, anon, authenticated;

grant execute on function public.change_order_status(
  bigint, public.order_status, public.order_status, uuid, boolean
) to service_role;
