-- 088_customer_booking_write_hardening.sql
--
-- Security hardening:
-- 1. Customer can no longer directly UPDATE arbitrary booking columns.
-- 2. Provisional customer booking state is changed only through a guarded RPC.
-- 3. Stripe finalization trusts only a real signed contracts row.

-- =========================================================
-- 1. Remove broad customer booking UPDATE policy
-- =========================================================

drop policy if exists bookings_update_own_customer
on public.bookings;


-- =========================================================
-- 2. Guarded RPC for customer self-service provisional state
-- =========================================================

create or replace function public.mark_my_booking_pending_deposit(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'status', 'authentication_required'
    );
  end if;

  select b.*
  into v_booking
  from public.bookings b
  join public.customers c
    on c.id = b.customer_id
  where b.id = p_booking_id
    and c.auth_user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'status', 'booking_not_found'
    );
  end if;

  -- Only a brand-new/provisional customer booking can enter this state.
  -- Do not allow an already confirmed/cancelled/operational booking
  -- to be pushed backwards by the customer.
  if v_booking.status::text not in (
    'draft',
    'temporary',
    'pending_deposit'
  ) then
    return jsonb_build_object(
      'success', false,
      'status', 'invalid_booking_state'
    );
  end if;

  update public.bookings
  set
    status = 'pending_deposit'::booking_status,
    booking_source = 'customer_self_service',
    amount_paid = 0,
    balance_due = greatest(coalesce(total_amount, 0), 0),
    payment_status = 'unpaid'::payment_status,
    updated_at = now()
  where id = p_booking_id;

  return jsonb_build_object(
    'success', true,
    'status', 'pending_deposit',
    'booking_id', p_booking_id
  );
end;
$$;

revoke all on function public.mark_my_booking_pending_deposit(uuid)
from public, anon;

grant execute on function public.mark_my_booking_pending_deposit(uuid)
to authenticated;


-- =========================================================
-- 3. Remove unnecessary anonymous write privileges
-- =========================================================

revoke insert, update, delete, truncate
on public.bookings
from anon;

revoke insert, update, delete, truncate
on public.contracts
from anon;

revoke insert, update, delete, truncate
on public.payments
from anon;


-- =========================================================
-- 4. Stripe finalization must require a real signed contract
-- =========================================================

create or replace function public.finalize_booking_after_external_payment(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
  v_paid numeric := 0;
  v_contract_signed boolean := false;
  v_now timestamptz := now();
begin
  select b.*
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'status', 'booking_not_found'
    );
  end if;

  select coalesce(
    sum(
      greatest(
        coalesce(p.amount, 0) - coalesce(p.tip_amount, 0),
        0
      )
    ),
    0
  )
  into v_paid
  from public.payments p
  where p.booking_id = p_booking_id
    and lower(coalesce(p.status::text, ''))
      in ('paid', 'completed', 'succeeded');

  -- Contract is authoritative ONLY when a real signed contracts row exists.
  select exists(
    select 1
    from public.contracts c
    where c.booking_id = p_booking_id
      and lower(coalesce(c.status::text, '')) = 'signed'
  )
  into v_contract_signed;

  update public.bookings
  set
    amount_paid = v_paid,
    balance_due = greatest(coalesce(total_amount, 0) - v_paid, 0),
    payment_status = (
      case
        when v_paid >= coalesce(total_amount, 0)
             and coalesce(total_amount, 0) > 0
          then 'paid'
        when v_paid > 0
          then 'partial'
        else 'unpaid'
      end
    )::payment_status,
    updated_at = v_now
  where id = p_booking_id;

  if not v_contract_signed then
    return jsonb_build_object(
      'success', true,
      'status', 'contract_required',
      'booking_id', p_booking_id,
      'amount_paid', v_paid,
      'balance_due',
        greatest(coalesce(v_booking.total_amount, 0) - v_paid, 0)
    );
  end if;

  if v_paid < coalesce(v_booking.deposit_amount, 0) then
    return jsonb_build_object(
      'success', true,
      'status', 'deposit_required',
      'booking_id', p_booking_id,
      'amount_paid', v_paid,
      'deposit_amount', coalesce(v_booking.deposit_amount, 0),
      'balance_due',
        greatest(coalesce(v_booking.total_amount, 0) - v_paid, 0)
    );
  end if;

  update public.bookings
  set
    status = case
      when status::text in ('draft', 'temporary', 'pending_deposit')
        then 'booked'::booking_status
      else status
    end,
    contract_status = 'signed',
    amount_paid = v_paid,
    balance_due = greatest(coalesce(total_amount, 0) - v_paid, 0),
    payment_status = (
      case
        when v_paid >= coalesce(total_amount, 0)
             and coalesce(total_amount, 0) > 0
          then 'paid'
        else 'partial'
      end
    )::payment_status,
    updated_at = v_now
  where id = p_booking_id;

  return jsonb_build_object(
    'success', true,
    'status', 'confirmed',
    'booking_id', p_booking_id,
    'amount_paid', v_paid,
    'balance_due',
      greatest(coalesce(v_booking.total_amount, 0) - v_paid, 0)
  );
end;
$$;

revoke all on function public.finalize_booking_after_external_payment(uuid)
from public, anon, authenticated;

grant execute on function public.finalize_booking_after_external_payment(uuid)
to service_role;

notify pgrst, 'reload schema';