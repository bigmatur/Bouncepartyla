begin;

create or replace function public.review_customer_booking_approval(
  p_booking_id uuid,
  p_revision integer,
  p_decision text,
  p_customer_comment text default null,
  p_hold_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_current public.customer_booking_approvals%rowtype;
  v_decision text;
  v_attempt_id uuid;
  v_hold_result jsonb;
  v_hold_status text;
  v_hold_expires_at timestamptz;
  v_capacity_check jsonb;
  v_has_park_venue boolean := false;
  v_capacity_limit integer := 0;
  v_capacity_count integer := 0;
begin
  if not public.current_user_can_create_bookings() then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  v_decision := lower(coalesce(p_decision, ''));

  if v_decision not in ('approved', 'rejected', 'expired') then
    return jsonb_build_object('success', false, 'status', 'invalid_decision');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if coalesce(v_booking.booking_source, '') <> 'customer_self_service' then
    return jsonb_build_object('success', false, 'status', 'not_customer_self_service');
  end if;

  if lower(coalesce(v_booking.status::text, '')) in ('booked', 'closed', 'refunded') and v_decision = 'rejected' then
    return jsonb_build_object('success', false, 'status', 'already_paid_or_closed');
  end if;

  select * into v_current
  from public.customer_booking_approvals a
  where a.booking_id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'approval_not_found');
  end if;

  if p_revision is not null and p_revision <> v_current.revision then
    return jsonb_build_object('success', false, 'status', 'revision_conflict', 'current_revision', v_current.revision);
  end if;

  if v_current.state = v_decision then
    return jsonb_build_object(
      'success', true,
      'status', case
        when v_decision = 'approved' then 'already_approved'
        when v_decision = 'rejected' then 'already_rejected'
        when v_decision = 'expired' then 'already_expired'
        else v_decision
      end,
      'revision', v_current.revision,
      'hold_expires_at', v_current.active_hold_expires_at
    );
  end if;

  if coalesce(v_current.state, 'pending') <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'status', 'state_conflict',
      'current_state', coalesce(v_current.state, 'pending')
    );
  end if;

  if v_decision = 'approved' then
    if lower(coalesce(v_booking.status::text, '')) <> 'pending_deposit' then
      return jsonb_build_object('success', false, 'status', 'booking_not_pending_deposit');
    end if;

    v_hold_result := public.acquire_booking_temporary_inventory_hold(
      p_booking_id,
      'admin_initial_hold',
      120,
      false
    );

    v_hold_status := coalesce(v_hold_result ->> 'status', 'unknown_error');
    if v_hold_status <> 'ok' then
      return jsonb_build_object(
        'success', false,
        'status', 'hold_acquire_failed',
        'hold_status', v_hold_status,
        'hold_payload', v_hold_result
      );
    end if;

    v_hold_expires_at := nullif(v_hold_result ->> 'hold_expires_at', '')::timestamptz;
    if v_hold_expires_at is null or v_hold_expires_at <= now() then
      return jsonb_build_object('success', false, 'status', 'hold_acquire_invalid');
    end if;

    v_attempt_id := nullif(v_hold_result ->> 'attempt_id', '')::uuid;
    if v_attempt_id is null then
      return jsonb_build_object('success', false, 'status', 'hold_attempt_missing');
    end if;

    update public.booking_checkout_attempts a
    set approval_revision = v_current.revision,
        hold_expires_at = least(a.hold_expires_at, now() + interval '120 minutes'),
        updated_at = now()
    where a.id = v_attempt_id
      and a.booking_id = p_booking_id
    returning a.hold_expires_at into v_hold_expires_at;

    if v_hold_expires_at is null or v_hold_expires_at <= now() then
      return jsonb_build_object('success', false, 'status', 'hold_attempt_invalid');
    end if;
  end if;

  update public.customer_booking_approvals
  set state = v_decision,
      reviewed_at = now(),
      reviewed_by_auth_user_id = auth.uid(),
      customer_comment = coalesce(nullif(trim(coalesce(p_customer_comment, '')), ''), customer_comment),
      active_hold_expires_at = case when v_decision = 'approved' then v_hold_expires_at else null end,
      updated_at = now()
  where booking_id = p_booking_id;

  update public.bookings
  set customer_approval_state = v_decision,
      customer_approval_reasons = coalesce(v_current.reasons, '{}'::text[]),
      customer_approval_expires_at = case when v_decision = 'approved' then v_hold_expires_at else null end,
      updated_at = now()
  where id = p_booking_id;

  insert into public.customer_booking_approval_history(
    booking_id,
    revision,
    from_state,
    to_state,
    reasons,
    payload,
    acted_by_auth_user_id,
    acted_at
  ) values (
    p_booking_id,
    v_current.revision,
    v_current.state,
    v_decision,
    coalesce(v_current.reasons, '{}'::text[]),
    jsonb_build_object(
      'customer_comment', coalesce(nullif(trim(coalesce(p_customer_comment, '')), ''), null),
      'hold_expires_at', case when v_decision = 'approved' then v_hold_expires_at else null end
    ),
    auth.uid(),
    now()
  );

  return jsonb_build_object(
    'success', true,
    'status', v_decision,
    'revision', v_current.revision,
    'hold_expires_at', case when v_decision = 'approved' then v_hold_expires_at else null end
  );
end;
$$;

revoke all on function public.review_customer_booking_approval(uuid, integer, text, text, timestamptz) from public, anon;
grant execute on function public.review_customer_booking_approval(uuid, integer, text, text, timestamptz) to authenticated;
grant execute on function public.review_customer_booking_approval(uuid, integer, text, text, timestamptz) to service_role;

create or replace function public.approve_customer_booking_approval(
  p_booking_id uuid,
  p_revision integer,
  p_customer_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_current public.customer_booking_approvals%rowtype;
  v_hold_minutes integer := 120;
  v_attempt_id uuid;
  v_hold_result jsonb;
  v_hold_status text;
  v_hold_expires_at timestamptz;
  v_capacity_check jsonb;
  v_capacity_warning boolean := false;
begin
  if not public.current_user_can_create_bookings() then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if coalesce(v_booking.booking_source, '') <> 'customer_self_service'
     or lower(coalesce(v_booking.status::text, '')) <> 'pending_deposit' then
    return jsonb_build_object('success', false, 'status', 'booking_not_pending_self_service');
  end if;

  select * into v_current
  from public.customer_booking_approvals a
  where a.booking_id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'approval_not_found');
  end if;

  if p_revision is not null and p_revision <> v_current.revision then
    return jsonb_build_object('success', false, 'status', 'revision_conflict', 'current_revision', v_current.revision);
  end if;

  if v_current.state = 'approved' then
    return jsonb_build_object(
      'success', true,
      'status', 'already_approved',
      'revision', v_current.revision,
      'hold_expires_at', v_current.active_hold_expires_at
    );
  end if;

  if coalesce(v_current.state, 'pending') <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'status', 'state_conflict',
      'current_state', coalesce(v_current.state, 'pending')
    );
  end if;

  v_capacity_check := public.evaluate_customer_booking_approval(
    v_booking.event_date,
    v_booking.event_start_time::text,
    null,
    p_booking_id
  );

  if coalesce((v_capacity_check ->> 'ok')::boolean, false) is false then
    return jsonb_build_object(
      'success', false,
      'status', 'approval_settings_invalid',
      'config_errors', coalesce(v_capacity_check -> 'config_errors', '[]'::jsonb)
    );
  end if;

  v_capacity_warning := coalesce((v_capacity_check ->> 'has_park_venue')::boolean, false)
    and greatest(coalesce((v_capacity_check ->> 'park_venue_limit')::integer, 0), 0) > 0
    and greatest(coalesce((v_capacity_check ->> 'park_venue_count')::integer, 0), 0)
        >= greatest(coalesce((v_capacity_check ->> 'park_venue_limit')::integer, 0), 0);

  v_hold_result := public.acquire_booking_temporary_inventory_hold(
    p_booking_id,
    'admin_initial_hold',
    v_hold_minutes,
    false
  );

  v_hold_status := coalesce(v_hold_result ->> 'status', 'unknown_error');
  if v_hold_status <> 'ok' then
    return jsonb_build_object(
      'success', false,
      'status', 'hold_acquire_failed',
      'hold_status', v_hold_status,
      'hold_payload', v_hold_result
    );
  end if;

  v_hold_expires_at := nullif(v_hold_result ->> 'hold_expires_at', '')::timestamptz;

  v_attempt_id := nullif(v_hold_result ->> 'attempt_id', '')::uuid;
  if v_attempt_id is null then
    return jsonb_build_object('success', false, 'status', 'hold_attempt_missing');
  end if;

  update public.booking_checkout_attempts a
  set approval_revision = v_current.revision,
      hold_expires_at = least(a.hold_expires_at, now() + interval '120 minutes'),
      updated_at = now()
  where a.id = v_attempt_id
    and a.booking_id = p_booking_id
  returning a.hold_expires_at into v_hold_expires_at;

  if v_hold_expires_at is null or v_hold_expires_at <= now() then
    return jsonb_build_object('success', false, 'status', 'hold_attempt_invalid');
  end if;

  update public.customer_booking_approvals
  set state = 'approved',
      reviewed_at = now(),
      reviewed_by_auth_user_id = auth.uid(),
      customer_comment = coalesce(nullif(trim(coalesce(p_customer_comment, '')), ''), customer_comment),
      active_hold_expires_at = v_hold_expires_at,
      updated_at = now()
  where booking_id = p_booking_id;

  update public.bookings
  set customer_approval_state = 'approved',
      customer_approval_reasons = coalesce(v_current.reasons, '{}'::text[]),
      customer_approval_expires_at = v_hold_expires_at,
      updated_at = now()
  where id = p_booking_id;

  insert into public.customer_booking_approval_history(
    booking_id,
    revision,
    from_state,
    to_state,
    reasons,
    payload,
    acted_by_auth_user_id,
    acted_at
  ) values (
    p_booking_id,
    v_current.revision,
    v_current.state,
    'approved',
    coalesce(v_current.reasons, '{}'::text[]),
    jsonb_build_object(
      'customer_comment', coalesce(nullif(trim(coalesce(p_customer_comment, '')), ''), null),
      'hold_expires_at', v_hold_expires_at,
      'park_venue_capacity_warning', v_capacity_warning,
      'capacity_check', v_capacity_check
    ),
    auth.uid(),
    now()
  );

  return jsonb_build_object(
    'success', true,
    'status', 'approved',
    'revision', v_current.revision,
    'hold_expires_at', v_hold_expires_at,
    'park_venue_capacity_warning', v_capacity_warning,
    'capacity_check', v_capacity_check
  );
end;
$$;

revoke all on function public.approve_customer_booking_approval(uuid, integer, text) from public, anon;
grant execute on function public.approve_customer_booking_approval(uuid, integer, text) to authenticated;
grant execute on function public.approve_customer_booking_approval(uuid, integer, text) to service_role;

create or replace function public.guard_customer_checkout_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_max_hold interval := interval '120 minutes';
  v_min_hold interval := interval '60 minutes';
begin
  if coalesce(new.attempt_kind, '') <> 'customer_temporary_deposit' then
    return new;
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = new.booking_id;

  if not found then
    raise exception 'booking_not_found';
  end if;

  if coalesce(v_booking.booking_source, '') = 'customer_self_service' then
    if lower(coalesce(v_booking.status::text, '')) <> 'pending_deposit' then
      raise exception 'self_service_booking_not_pending_deposit';
    end if;

    if coalesce(v_booking.customer_approval_state, 'none') <> 'approved' then
      raise exception 'self_service_approval_not_active';
    end if;

    if coalesce(v_booking.customer_approval_expires_at, '-infinity'::timestamptz) <= now() then
      perform public.expire_customer_booking_approval_if_needed(v_booking.id, 'guard_expired');
      raise exception 'approval_expired';
    end if;

    if new.approval_revision is null then
      new.approval_revision := v_booking.customer_approval_revision;
    elsif new.approval_revision is distinct from v_booking.customer_approval_revision then
      raise exception 'approval_revision_mismatch';
    end if;
  else
    if auth.role() <> 'service_role'
       and not public.current_user_can_create_bookings()
       and not public.current_user_has_active_completion_session(v_booking.id) then
      raise exception 'completion_session_required';
    end if;
  end if;

  if new.hold_expires_at is null then
    new.hold_expires_at := now() + interval '60 minutes';
  end if;

  if new.hold_expires_at < now() + v_min_hold then
    if coalesce(v_booking.booking_source, '') = 'customer_self_service' then
      new.hold_expires_at := least(v_booking.customer_approval_expires_at, now() + v_min_hold);
    else
      new.hold_expires_at := now() + v_min_hold;
    end if;
  end if;

  if new.hold_expires_at > now() + v_max_hold then
    new.hold_expires_at := now() + v_max_hold;
  end if;

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and new.hold_expires_at > v_booking.customer_approval_expires_at then
    new.hold_expires_at := v_booking.customer_approval_expires_at;
  end if;

  if new.hold_expires_at <= now() then
    perform public.expire_customer_booking_approval_if_needed(v_booking.id, 'guard_expired');
    raise exception 'approval_expired';
  end if;

  return new;
end;
$$;


commit;
