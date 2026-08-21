create extension if not exists pgcrypto with schema extensions;

create table if not exists public.booking_completion_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  customer_email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  created_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_booking_completion_sessions_booking_id
  on public.booking_completion_sessions(booking_id);

create index if not exists idx_booking_completion_sessions_expires_at
  on public.booking_completion_sessions(expires_at);

alter table public.booking_completion_sessions enable row level security;

create or replace function public.get_booking_completion_session(raw_token text)
returns table (
  status text,
  expires_at timestamptz,
  customer_email text,
  event_date date,
  customer_name text
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    case
      when s.revoked_at is not null then 'revoked'
      when s.completed_at is not null then 'completed'
      when s.expires_at <= now() then 'expired'
      else 'active'
    end,
    s.expires_at,
    s.customer_email,
    b.event_date,
    c.full_name
  from public.booking_completion_sessions s
  join public.bookings b on b.id = s.booking_id
  left join public.customers c on c.id = b.customer_id
  where s.token_hash = encode(
    extensions.digest(
      convert_to(coalesce(raw_token, ''), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
  limit 1;
$$;

grant execute on function public.get_booking_completion_session(text)
  to anon, authenticated;

create or replace function public.claim_booking_completion_session(raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.booking_completion_sessions%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'success', false,
      'status', 'authentication_required'
    );
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select *
  into v_session
  from public.booking_completion_sessions
  where token_hash = encode(
    extensions.digest(
      convert_to(coalesce(raw_token, ''), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'status', 'not_found'
    );
  end if;

  if v_session.revoked_at is not null then
    return jsonb_build_object(
      'success', false,
      'status', 'revoked'
    );
  end if;

  if v_session.completed_at is not null then
    return jsonb_build_object(
      'success', true,
      'status', 'completed',
      'booking_id', v_session.booking_id
    );
  end if;

  if v_session.expires_at <= now() then
    return jsonb_build_object(
      'success', false,
      'status', 'expired'
    );
  end if;

  if v_email = '' or v_email <> lower(v_session.customer_email) then
    return jsonb_build_object(
      'success', false,
      'status', 'email_mismatch'
    );
  end if;

  update public.booking_completion_sessions
  set
    claimed_at = coalesce(claimed_at, now()),
    updated_at = now()
  where id = v_session.id;

  return jsonb_build_object(
    'success', true,
    'status', 'claimed',
    'booking_id', v_session.booking_id
  );
end;
$$;

grant execute on function public.claim_booking_completion_session(text)
  to authenticated;

notify pgrst, 'reload schema';
