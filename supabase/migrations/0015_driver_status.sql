-- =============================================================================
-- supabase/migrations/0015_driver_status.sql   (Build step 6, Step 33)
--
-- WHAT: What the driver's buttons need in the database (FR-04 SR-4.2 update
--       part, SR-4.3, SR-4.4, SAF-1, FR-06):
--         1. driver_change_delivery_status(): the ONLY way a driver changes a
--            status. It checks that this person is the ASSIGNED driver, that
--            they only choose Being delivered or Completed, and (FR-06) that
--            an unpaid CASH order isn't completed without "cash received".
--            Then it REUSES change_order_status() (0009/0010): status +
--            history row + cash PAID (paid_at, paid_by), one transaction,
--            and every status trigger still runs (Step 28 rules, "needs a
--            driver", customer notifications).
--         2. a trigger that fills in deliveries.picked_up_at (Being
--            delivered) and delivered_at (Completed) AUTOMATICALLY, whoever
--            made the change (the driver, or counter staff using the backup
--            button, decision B).
--
-- LAYER: Data layer (Supabase Postgres).
--
-- WHO MAY RUN IT? Only our server (service_role). The server action
--   (src/lib/orders/delivery-actions.ts) checks the typed Order ID (SAF-1)
--   first: only the server knows what the driver typed.
--
-- LYNK is still NOT marked paid here: the Supervisor verifies it (Build
--   step 7). change_order_status() refuses to mark a Lynk payment paid.
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0015_driver_status_checks.sql block by block.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. driver_change_delivery_status()
--    p_expected_status = the status the driver SAW (same idea as 0009: if it
--      changed meanwhile, nothing happens and it returns false).
--    p_cash_received   = the driver ticked "Cash received (J$X)".
--    Returns true when saved. Raises an error when a rule is broken (and
--    then NOTHING is saved: one transaction).
-- -----------------------------------------------------------------------------
create function public.driver_change_delivery_status(
  p_order_id        bigint,
  p_expected_status public.order_status,
  p_new_status      public.order_status,
  p_driver_id       uuid,
  p_cash_received   boolean default false
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_assigned uuid;
begin
  -- Drivers only do these two steps (cancel / abandon stay with the counter).
  if p_new_status not in ('BEING_DELIVERED', 'COMPLETED') then
    raise exception 'Drivers can only mark an order Being delivered or Completed.';
  end if;

  -- The person must really be delivery staff ...
  if not exists (select 1 from public.profiles p
                  where p.id = p_driver_id and p.role = 'delivery_personnel') then
    raise exception 'That person is not a delivery staff member.';
  end if;

  -- ... and THE driver assigned to this order. "for update" locks the
  -- delivery row, so it can't be moved to another driver halfway through.
  select d.driver_id into v_assigned
    from public.deliveries d
   where d.order_id = p_order_id
     for update;

  if v_assigned is distinct from p_driver_id then
    raise exception 'Order %: this delivery is not assigned to you.', p_order_id;
  end if;

  -- FR-06: an unpaid CASH order can't be completed unless the cash was
  -- received (otherwise revenue reports would miss it).
  if p_new_status = 'COMPLETED' and not p_cash_received and exists (
       select 1 from public.payments pay
        where pay.order_id = p_order_id and pay.method = 'CASH' and pay.status = 'UNPAID') then
    raise exception 'Order %: confirm the cash was received before completing it.', p_order_id;
  end if;

  -- REUSE: status + history + (cash -> PAID, paid_by = the driver), all the
  -- status triggers, one transaction.
  return public.change_order_status(p_order_id, p_expected_status, p_new_status, p_driver_id, p_cash_received);
end;
$$;

-- Only the server (service_role) may run it.
revoke execute on function public.driver_change_delivery_status(
  bigint, public.order_status, public.order_status, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.driver_change_delivery_status(
  bigint, public.order_status, public.order_status, uuid, boolean
) to service_role;


-- -----------------------------------------------------------------------------
-- 2. SR-4.3: record WHEN the driver left and WHEN it was delivered.
--    An AFTER trigger (like the notifications one, 0012): it runs once the
--    status change has passed the rules, in the SAME transaction.
--    coalesce(picked_up_at, now()) = keep an existing time; only fill it in
--    if it's empty (also covers older test orders that left before this
--    migration, so "delivered needs picked up" (0013) is never broken).
-- -----------------------------------------------------------------------------
create function public.record_delivery_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'BEING_DELIVERED' then
    update public.deliveries
       set picked_up_at = coalesce(picked_up_at, now())
     where order_id = new.id;
  elsif new.status = 'COMPLETED' then
    update public.deliveries
       set picked_up_at = coalesce(picked_up_at, now()),
           delivered_at = now()
     where order_id = new.id;
  end if;
  return null; -- an AFTER trigger's return value is ignored
end;
$$;

revoke execute on function public.record_delivery_times() from public, anon, authenticated;

create trigger orders_record_delivery_times
  after update of status on public.orders
  for each row
  when (
    new.fulfilment = 'DELIVERY'
    and new.status in ('BEING_DELIVERED', 'COMPLETED')
    and old.status is distinct from new.status
  )
  execute function public.record_delivery_times();
