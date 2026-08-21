create or replace function public.record_temporary_booking_deposit(
  p_booking_id uuid,
  p_amount numeric,
  p_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_session public.booking_completion_sessions%rowtype;
  v_booking public.bookings%rowtype;
  v_paid numeric := 0;
  v_required numeric := 0;
  v_amount numeric := round(greatest(coalesce(p_amount, 0), 0), 2);
  v_method_input text := lower(trim(coalesce(p_method, '')));
  v_method payment_method;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'status', 'authentication_required');
  end if;

  begin
    v_method := v_method_input::payment_method;
  exception
    when invalid_text_representation then
      return jsonb_build_object('success', false, 'status', 'unsupported_method');
  end;

  select * into v_session
  from public.booking_completion_sessions
  where booking_id = p_booking_id and revoked_at is null
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'status', 'session_not_found');
  end if;

  if lower(v_session.customer_email) <> v_email then
    return jsonb_build_object('success', false, 'status', 'email_mismatch');
  end if;

  if v_session.completed_at is not null then
    return jsonb_build_object('success', false, 'status', 'already_completed');
  end if;

  if v_session.expires_at <= v_now then
    return jsonb_build_object('success', false, 'status', 'expired');
  end if;

  if not exists (
    select 1 from public.contracts
    where booking_id = p_booking_id and status = 'signed'
  ) then
    return jsonb_build_object('success', false, 'status', 'contract_required');
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where booking_id = p_booking_id and status = 'paid';

  v_required := greatest(coalesce(v_booking.deposit_amount, 0) - v_paid, 0);

  if v_required <= 0 then
    return jsonb_build_object('success', true, 'status', 'deposit_already_paid', 'amount_paid', v_paid);
  end if;

  if v_amount <= 0 or v_amount > v_required then
    return jsonb_build_object('success', false, 'status', 'invalid_amount', 'required_now', v_required);
  end if;

  insert into public.payments (booking_id, amount, method, status, note, paid_at)
  values (p_booking_id, v_amount, v_method, 'paid', 'Recorded from customer completion POS', v_now);

  v_paid := v_paid + v_amount;

  update public.bookings
  set
    amount_paid = v_paid,
    balance_due = greatest(coalesce(total_amount, 0) - v_paid, 0),
    payment_status = case
      when v_paid >= coalesce(total_amount, 0) then 'paid'
      when v_paid >= coalesce(deposit_amount, 0) then 'deposit_paid'
      else 'partial'
    end,
    updated_at = v_now
  where id = p_booking_id;

  return jsonb_build_object('success', true, 'status', 'paid', 'amount_paid', v_paid);
end;
$$;

grant execute on function public.record_temporary_booking_deposit(uuid, numeric, text)
  to authenticated;

notify pgrst, 'reload schema';
