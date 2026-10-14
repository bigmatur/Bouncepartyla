begin;

create table if not exists public.customer_booking_cancellation_requests (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  revision integer not null default 1,
  state text not null check (state in ('pending', 'approved', 'declined')),
  reason text,
  customer_comment text,
  requested_at timestamptz not null default now(),
  requested_by_auth_user_id uuid,
  reviewed_at timestamptz,
  reviewed_by_auth_user_id uuid,
  admin_comment text,
  financial_decision text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_booking_cancellation_requests_financial_decision_check
    check (
      financial_decision is null
      or financial_decision in ('keep_deposit', 'refund_deposit', 'no_payment')
    )
);

create table if not exists public.customer_booking_cancellation_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  revision integer not null,
  from_state text,
  to_state text not null,
  payload jsonb not null default '{}'::jsonb,
  acted_by_auth_user_id uuid,
  acted_at timestamptz not null default now()
);

create index if not exists idx_customer_booking_cancellation_requests_pending
  on public.customer_booking_cancellation_requests(requested_at desc)
  where state = 'pending';

create index if not exists idx_customer_booking_cancellation_history_booking
  on public.customer_booking_cancellation_history(booking_id, acted_at desc);

create or replace function public.touch_customer_booking_cancellation_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_customer_booking_cancellation_requests_updated_at on public.customer_booking_cancellation_requests;
create trigger trg_customer_booking_cancellation_requests_updated_at
before update on public.customer_booking_cancellation_requests
for each row execute function public.touch_customer_booking_cancellation_request_updated_at();

alter table public.customer_booking_cancellation_requests enable row level security;
alter table public.customer_booking_cancellation_history enable row level security;

drop policy if exists customer_booking_cancellation_requests_staff_all on public.customer_booking_cancellation_requests;
create policy customer_booking_cancellation_requests_staff_all
on public.customer_booking_cancellation_requests
for all
using (public.current_user_can_create_bookings())
with check (public.current_user_can_create_bookings());

drop policy if exists customer_booking_cancellation_requests_customer_read_own on public.customer_booking_cancellation_requests;
create policy customer_booking_cancellation_requests_customer_read_own
on public.customer_booking_cancellation_requests
for select
to authenticated
using (public.current_user_owns_booking(booking_id));

drop policy if exists customer_booking_cancellation_history_staff_all on public.customer_booking_cancellation_history;
create policy customer_booking_cancellation_history_staff_all
on public.customer_booking_cancellation_history
for select
to authenticated
using (public.current_user_can_create_bookings());

drop policy if exists customer_booking_cancellation_history_customer_read_own on public.customer_booking_cancellation_history;
create policy customer_booking_cancellation_history_customer_read_own
on public.customer_booking_cancellation_history
for select
to authenticated
using (public.current_user_owns_booking(booking_id));

create or replace function public.request_my_booking_cancellation(
  p_booking_id uuid,
  p_reason text default null,
  p_customer_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_existing public.customer_booking_cancellation_requests%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_customer_comment text := nullif(trim(coalesce(p_customer_comment, '')), '');
  v_snapshot jsonb;
  v_next_revision integer;
begin
  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if auth.uid() is null then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  if not public.current_user_owns_booking(p_booking_id) then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if lower(coalesce(v_booking.status::text, '')) in ('cancelled', 'closed') then
    return jsonb_build_object('success', false, 'status', 'booking_not_cancellable_requestable');
  end if;

  select * into v_existing
  from public.customer_booking_cancellation_requests r
  where r.booking_id = p_booking_id
  for update;

  if found and v_existing.state = 'pending' then
    return jsonb_build_object(
      'success', true,
      'status', 'pending',
      'revision', v_existing.revision,
      'idempotent', true
    );
  end if;

  if found and v_existing.state = 'approved' then
    return jsonb_build_object(
      'success', false,
      'status', 'already_approved',
      'revision', v_existing.revision
    );
  end if;

  v_next_revision := case
    when found then greatest(coalesce(v_existing.revision, 0), 0) + 1
    else 1
  end;

  v_snapshot := jsonb_build_object(
    'booking_status', coalesce(v_booking.status::text, ''),
    'payment_status', coalesce(v_booking.payment_status::text, ''),
    'total_amount', coalesce(v_booking.total_amount, 0),
    'amount_paid', coalesce(v_booking.amount_paid, 0),
    'balance_due', coalesce(v_booking.balance_due, 0),
    'deposit_amount', coalesce(v_booking.deposit_amount, 0),
    'event_date', v_booking.event_date
  );

  insert into public.customer_booking_cancellation_requests(
    booking_id,
    revision,
    state,
    reason,
    customer_comment,
    requested_at,
    requested_by_auth_user_id,
    reviewed_at,
    reviewed_by_auth_user_id,
    admin_comment,
    financial_decision,
    snapshot,
    updated_at
  ) values (
    p_booking_id,
    v_next_revision,
    'pending',
    v_reason,
    v_customer_comment,
    now(),
    auth.uid(),
    null,
    null,
    null,
    null,
    v_snapshot,
    now()
  )
  on conflict (booking_id)
  do update set
    revision = excluded.revision,
    state = 'pending',
    reason = excluded.reason,
    customer_comment = excluded.customer_comment,
    requested_at = now(),
    requested_by_auth_user_id = auth.uid(),
    reviewed_at = null,
    reviewed_by_auth_user_id = null,
    admin_comment = null,
    financial_decision = null,
    snapshot = excluded.snapshot,
    updated_at = now();

  insert into public.customer_booking_cancellation_history(
    booking_id,
    revision,
    from_state,
    to_state,
    payload,
    acted_by_auth_user_id,
    acted_at
  ) values (
    p_booking_id,
    v_next_revision,
    coalesce(v_existing.state, 'none'),
    'pending',
    jsonb_build_object(
      'reason', v_reason,
      'customer_comment', v_customer_comment,
      'snapshot', v_snapshot
    ),
    auth.uid(),
    now()
  );

  return jsonb_build_object(
    'success', true,
    'status', 'pending',
    'revision', v_next_revision
  );
end;
$$;

revoke all on function public.request_my_booking_cancellation(uuid, text, text) from public, anon;
grant execute on function public.request_my_booking_cancellation(uuid, text, text) to authenticated;
grant execute on function public.request_my_booking_cancellation(uuid, text, text) to service_role;

create or replace function public.approve_customer_booking_cancellation_request(
  p_booking_id uuid,
  p_expected_revision integer,
  p_admin_comment text default null,
  p_financial_decision text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_current public.customer_booking_cancellation_requests%rowtype;
  v_admin_comment text := nullif(trim(coalesce(p_admin_comment, '')), '');
  v_financial_decision text := nullif(trim(coalesce(p_financial_decision, '')), '');
  v_attempt record;
  v_now timestamptz := now();
  v_cancellation_reason text;
  v_released_unit_ids uuid[] := '{}'::uuid[];
begin
  -- DB-level gate: active staff roles (super_admin/admin/manager) only.
  -- Granular bookings.cancel permission is enforced in the application server action.
  if not public.current_user_can_create_bookings() then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    return jsonb_build_object('success', false, 'status', 'invalid_revision');
  end if;

  if v_financial_decision is null
     or v_financial_decision not in ('keep_deposit', 'refund_deposit', 'no_payment') then
    return jsonb_build_object('success', false, 'status', 'financial_decision_required');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  select *
  into v_current
  from public.customer_booking_cancellation_requests r
  where r.booking_id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'request_not_found');
  end if;

  if v_current.revision <> p_expected_revision then
    return jsonb_build_object(
      'success', false,
      'status', 'revision_conflict',
      'current_revision', v_current.revision,
      'current_state', coalesce(v_current.state, 'pending')
    );
  end if;

  if v_current.state = 'approved' then
    if coalesce(v_current.financial_decision, '') = v_financial_decision then
      return jsonb_build_object(
        'success', true,
        'status', 'already_approved',
        'revision', v_current.revision,
        'financial_decision', v_current.financial_decision,
        'idempotent', true
      );
    end if;

    return jsonb_build_object(
      'success', false,
      'status', 'approval_conflict',
      'current_state', v_current.state,
      'current_revision', v_current.revision,
      'current_financial_decision', v_current.financial_decision
    );
  end if;

  if coalesce(v_current.state, 'pending') <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'status', 'state_conflict',
      'current_state', coalesce(v_current.state, 'pending'),
      'current_revision', v_current.revision
    );
  end if;

  if lower(coalesce(v_booking.status::text, '')) = 'closed' then
    return jsonb_build_object(
      'success', false,
      'status', 'booking_state_conflict',
      'current_booking_status', coalesce(v_booking.status::text, '')
    );
  end if;

  -- Release active temporary checkout attempts by reusing the existing hold-release RPC.
  for v_attempt in
    select a.id, a.stripe_checkout_session_id
    from public.booking_checkout_attempts a
    where a.booking_id = p_booking_id
      and a.state in ('holding', 'stripe_bound')
    for update
  loop
    perform public.release_booking_checkout_attempt_hold(
      p_booking_id,
      v_attempt.id,
      v_attempt.stripe_checkout_session_id,
      'booking_cancelled_after_customer_cancellation_approval'
    );
  end loop;

  with released_reservations as (
    update public.inventory_reservations ir
    set status = 'released',
        updated_at = now()
    where ir.booking_id = p_booking_id
      and ir.status in ('reserved', 'picked', 'loaded', 'installed')
    returning ir.inventory_unit_id
  )
  select coalesce(
           array_agg(distinct inventory_unit_id)
           filter (where inventory_unit_id is not null),
           '{}'::uuid[]
         )
  into v_released_unit_ids
  from released_reservations;

  if coalesce(array_length(v_released_unit_ids, 1), 0) > 0 then
    update public.inventory_units iu
    set status = 'available',
        updated_at = now()
    where iu.id = any(v_released_unit_ids)
      and iu.status in ('reserved', 'picked', 'loaded', 'installed');
  end if;

  begin
    update public.route_stops
    set status = 'cancelled',
        updated_at = now()
    where booking_id = p_booking_id
      and coalesce(status::text, '') not in ('cancelled', 'completed', 'failed');
  exception
    when undefined_column then
      update public.route_stops
      set status = 'cancelled'
      where booking_id = p_booking_id
        and coalesce(status::text, '') not in ('cancelled', 'completed', 'failed');
    when undefined_table then
      null;
  end;

  v_cancellation_reason := nullif(trim(coalesce(v_current.reason, '')), '');
  if v_cancellation_reason is null then
    v_cancellation_reason := nullif(trim(coalesce(v_current.customer_comment, '')), '');
  end if;

  begin
    update public.bookings
    set status = 'cancelled',
        archived_at = null,
        cancellation_reason = v_cancellation_reason,
        cancelled_at = v_now,
        updated_at = v_now
    where id = p_booking_id;
  exception
    when undefined_column then
      begin
        update public.bookings
        set status = 'cancelled',
            archived_at = null,
            notes = case
              when v_cancellation_reason is not null
                then trim(both from concat_ws(' | ', nullif(notes, ''), concat('Cancellation reason: ', v_cancellation_reason)))
              else notes
            end,
            cancelled_at = v_now,
            updated_at = v_now
        where id = p_booking_id;
      exception
        when undefined_column then
          begin
            update public.bookings
            set status = 'cancelled',
                archived_at = null,
                updated_at = v_now
            where id = p_booking_id;
          exception
            when undefined_column then
              update public.bookings
              set status = 'cancelled'
              where id = p_booking_id;
          end;
      end;
  end;

  -- Financial decision is administrative/accounting state only.
  -- Selecting refund_deposit here does NOT execute a payment provider refund.
  update public.customer_booking_cancellation_requests
  set state = 'approved',
      reviewed_at = now(),
      reviewed_by_auth_user_id = auth.uid(),
      admin_comment = v_admin_comment,
      financial_decision = v_financial_decision,
      updated_at = now()
  where booking_id = p_booking_id;

  insert into public.customer_booking_cancellation_history(
    booking_id,
    revision,
    from_state,
    to_state,
    payload,
    acted_by_auth_user_id,
    acted_at
  ) values (
    p_booking_id,
    v_current.revision,
    v_current.state,
    'approved',
    jsonb_build_object(
      'admin_comment', v_admin_comment,
      'financial_decision', v_financial_decision,
      'refund_executed', false
    ),
    auth.uid(),
    now()
  );

  return jsonb_build_object(
    'success', true,
    'status', 'approved',
    'revision', v_current.revision,
    'financial_decision', v_financial_decision
  );
end;
$$;

revoke all on function public.approve_customer_booking_cancellation_request(uuid, integer, text, text) from public, anon;
grant execute on function public.approve_customer_booking_cancellation_request(uuid, integer, text, text) to authenticated;
grant execute on function public.approve_customer_booking_cancellation_request(uuid, integer, text, text) to service_role;

create or replace function public.review_customer_booking_cancellation_request(
  p_booking_id uuid,
  p_revision integer,
  p_decision text,
  p_admin_comment text default null,
  p_financial_decision text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_current public.customer_booking_cancellation_requests%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_admin_comment text := nullif(trim(coalesce(p_admin_comment, '')), '');
  v_financial_decision text := nullif(trim(coalesce(p_financial_decision, '')), '');
  v_target_state text;
begin
  -- DB-level gate: active staff roles (super_admin/admin/manager) only.
  -- Granular bookings.cancel permission is enforced in the application server action.
  if not public.current_user_can_create_bookings() then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if v_decision not in ('approve', 'decline') then
    return jsonb_build_object('success', false, 'status', 'invalid_decision');
  end if;

  if v_decision = 'approve' then
    return jsonb_build_object('success', false, 'status', 'approve_requires_atomic_rpc');
  else
    v_financial_decision := null;
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  select * into v_current
  from public.customer_booking_cancellation_requests r
  where r.booking_id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'request_not_found');
  end if;

  if p_revision is not null and p_revision <> v_current.revision then
    return jsonb_build_object(
      'success', false,
      'status', 'revision_conflict',
      'current_revision', v_current.revision
    );
  end if;

  v_target_state := case when v_decision = 'approve' then 'approved' else 'declined' end;

  if v_current.state = v_target_state then
    return jsonb_build_object(
      'success', true,
      'status', case when v_target_state = 'approved' then 'already_approved' else 'already_declined' end,
      'revision', v_current.revision,
      'idempotent', true
    );
  end if;

  if coalesce(v_current.state, 'pending') <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'status', 'state_conflict',
      'current_state', coalesce(v_current.state, 'pending')
    );
  end if;

  update public.customer_booking_cancellation_requests
  set state = v_target_state,
      reviewed_at = now(),
      reviewed_by_auth_user_id = auth.uid(),
      admin_comment = v_admin_comment,
      financial_decision = v_financial_decision,
      updated_at = now()
  where booking_id = p_booking_id;

  insert into public.customer_booking_cancellation_history(
    booking_id,
    revision,
    from_state,
    to_state,
    payload,
    acted_by_auth_user_id,
    acted_at
  ) values (
    p_booking_id,
    v_current.revision,
    v_current.state,
    v_target_state,
    jsonb_build_object(
      'admin_comment', v_admin_comment,
      'financial_decision', v_financial_decision
    ),
    auth.uid(),
    now()
  );

  return jsonb_build_object(
    'success', true,
    'status', v_target_state,
    'revision', v_current.revision,
    'financial_decision', v_financial_decision
  );
end;
$$;

revoke all on function public.review_customer_booking_cancellation_request(uuid, integer, text, text, text) from public, anon;
grant execute on function public.review_customer_booking_cancellation_request(uuid, integer, text, text, text) to authenticated;
grant execute on function public.review_customer_booking_cancellation_request(uuid, integer, text, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
