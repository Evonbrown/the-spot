-- =============================================================================
-- supabase/migrations/0009_order_status_changes.sql   (Build step 4, Step 26)
--
-- WHAT: change_order_status(): changes ONE order's status AND records the
--       change in order_status_history (who, which status, when), together.
--
-- LAYER: Data layer (Supabase Postgres).
--
-- WHY A FUNCTION (like create_order in 0006)?
--   - One transaction: the new status and its history row are saved
--     together, or (if anything fails) not at all. Never a status change
--     without a record of who made it.
--   - Staff still can't change the orders table directly (0006 grants only
--     allow SELECT). Only our SERVER may run this function (service_role,
--     the secret key), and only after the server action has checked the
--     rules (src/lib/orders/status-rules.ts; full rules in Step 28).
--
-- "SOMEONE ELSE JUST CHANGED IT": the update only happens if the order still
--   has the status the staff member SAW (p_expected_status). If two staff tap
--   at the same moment, the second one changes nothing and gets FALSE back,
--   so a step can never be skipped by accident.
--
-- The history is also what Step 28 needs for the Abandoned rule ("20 minutes
-- after it became READY_FOR_PICKUP"): changed_at records exactly when.
--
-- HOW TO RUN: Supabase SQL Editor -> paste this whole file -> Run.
--   Then run supabase/tests/0009_order_status_checks.sql block by block.
-- =============================================================================

create function public.change_order_status(
  p_order_id        bigint,
  p_expected_status public.order_status,
  p_new_status      public.order_status,
  p_changed_by      uuid
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_changed integer;
begin
  -- Change the status ONLY if it is still what the staff member saw.
  -- (updated_at is set automatically by the trigger from 0006.)
  update public.orders
     set status = p_new_status
   where id = p_order_id
     and status = p_expected_status;

  -- row_count = how many rows the update changed (0 or 1).
  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    return false; -- no such order, or someone else changed it first
  end if;

  -- Record who changed it to what (changed_at defaults to now()).
  insert into public.order_status_history (order_id, status, changed_by)
  values (p_order_id, p_new_status, p_changed_by);

  return true;
end;
$$;

-- Only the server (service_role) may run it. By default Postgres lets
-- everyone run new functions, so we take that away first.
revoke execute on function public.change_order_status(
  bigint, public.order_status, public.order_status, uuid
) from public, anon, authenticated;

grant execute on function public.change_order_status(
  bigint, public.order_status, public.order_status, uuid
) to service_role;
