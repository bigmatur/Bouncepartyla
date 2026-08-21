-- 070 Notifications: template editor support + SMS STOP/START suppression.
-- Requires 068 and 069.

create extension if not exists pgcrypto;

create table if not exists public.notification_sms_suppressions (
  phone_key text primary key,
  customer_id uuid references public.customers(id) on delete set null,
  phone_raw text,
  source text not null default 'twilio',
  keyword text,
  suppressed_at timestamptz not null default now(),
  resumed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_sms_suppressions_customer
  on public.notification_sms_suppressions(customer_id);

create or replace function public.notification_phone_key(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) >= 10
      then right(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), 10)
    else nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), '')
  end;
$$;

create or replace function public.notification_customer_by_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.customers c
  where public.notification_phone_key(c.phone) = public.notification_phone_key(p_phone)
  order by c.id
  limit 1;
$$;

create or replace function public.apply_notification_sms_optout(
  p_phone text,
  p_keyword text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := public.notification_phone_key(p_phone);
  v_customer_id uuid;
  v_action text := lower(trim(coalesce(p_action,'')));
begin
  if v_key is null then
    return jsonb_build_object('success', false, 'status', 'invalid_phone');
  end if;

  v_customer_id := public.notification_customer_by_phone(p_phone);

  if v_action = 'stop' then
    insert into public.notification_sms_suppressions(
      phone_key, customer_id, phone_raw, source, keyword, suppressed_at, resumed_at, updated_at
    ) values (
      v_key, v_customer_id, p_phone, 'twilio', upper(trim(coalesce(p_keyword,'STOP'))), now(), null, now()
    )
    on conflict (phone_key) do update set
      customer_id = coalesce(excluded.customer_id, public.notification_sms_suppressions.customer_id),
      phone_raw = excluded.phone_raw,
      source = excluded.source,
      keyword = excluded.keyword,
      suppressed_at = now(),
      resumed_at = null,
      updated_at = now();

    update public.notification_deliveries
    set status = 'suppressed',
        error_message = 'sms_opted_out',
        updated_at = now()
    where channel = 'sms'
      and status in ('queued','failed')
      and public.notification_phone_key(recipient_phone) = v_key;

    return jsonb_build_object('success', true, 'status', 'stopped', 'customer_id', v_customer_id);
  end if;

  if v_action = 'start' then
    update public.notification_sms_suppressions
    set resumed_at = now(), updated_at = now()
    where phone_key = v_key;

    delete from public.notification_sms_suppressions
    where phone_key = v_key;

    return jsonb_build_object('success', true, 'status', 'started', 'customer_id', v_customer_id);
  end if;

  return jsonb_build_object('success', false, 'status', 'ignored');
end;
$$;

revoke all on function public.apply_notification_sms_optout(text,text,text) from public, anon, authenticated;
grant execute on function public.apply_notification_sms_optout(text,text,text) to service_role;

-- Last line of defense: if an SMS is queued while a number is globally suppressed,
-- store it in the audit trail as suppressed instead of silently dropping it.
create or replace function public.guard_notification_sms_suppression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if new.channel <> 'sms' then return new; end if;
  v_key := public.notification_phone_key(new.recipient_phone);
  if v_key is null then return new; end if;

  if exists(select 1 from public.notification_sms_suppressions s where s.phone_key = v_key) then
    new.status := 'suppressed';
    new.error_message := 'sms_opted_out';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_notification_sms_suppression on public.notification_deliveries;
create trigger trg_guard_notification_sms_suppression
before insert on public.notification_deliveries
for each row execute function public.guard_notification_sms_suppression();

alter table public.notification_sms_suppressions enable row level security;

drop policy if exists notification_sms_suppressions_staff_all on public.notification_sms_suppressions;
create policy notification_sms_suppressions_staff_all
on public.notification_sms_suppressions
for all to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

drop policy if exists notification_sms_suppressions_customer_read on public.notification_sms_suppressions;
create policy notification_sms_suppressions_customer_read
on public.notification_sms_suppressions
for select to authenticated
using (
  customer_id in (
    select c.id from public.customers c where c.auth_user_id = auth.uid()
  )
);

notify pgrst, 'reload schema';
