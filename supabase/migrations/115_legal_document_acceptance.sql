-- 115_legal_document_acceptance.sql
--
-- Minimal audit trail for legal document acceptance (signup-focused).
-- Intentionally excludes IP storage by default to reduce personal-data footprint.

create extension if not exists pgcrypto;

create table if not exists public.legal_document_acceptances (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  document_type text not null check (document_type in ('terms_of_service', 'privacy_policy')),
  action_type text not null check (action_type in ('accepted', 'acknowledged')),
  document_version text not null,
  acceptance_context text not null check (acceptance_context in ('signup', 'booking')),
  accepted_at timestamptz not null default now(),
  user_agent text,
  created_at timestamptz not null default now(),
  constraint legal_document_acceptances_document_action_check check (
    (document_type = 'terms_of_service' and action_type = 'accepted')
    or
    (document_type = 'privacy_policy' and action_type = 'acknowledged')
  )
);

create or replace function public.validate_legal_document_acceptance_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_auth_user_id uuid;
  v_profile_customer_id uuid;
begin
  if new.profile_id is not null then
    select p.auth_user_id, p.customer_id
      into v_profile_auth_user_id, v_profile_customer_id
    from public.profiles p
    where p.id = new.profile_id;

    if v_profile_auth_user_id is distinct from new.auth_user_id then
      raise exception using
        errcode = '23514',
        message = 'profile_id does not belong to auth_user_id';
    end if;

    if new.customer_id is not null and v_profile_customer_id is distinct from new.customer_id then
      raise exception using
        errcode = '23514',
        message = 'customer_id does not match profile_id for auth_user_id';
    end if;
  end if;

  if new.customer_id is not null and not exists (
    select 1
    from public.profiles p
    where p.auth_user_id = new.auth_user_id
      and p.customer_id = new.customer_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'customer_id is not linked to auth_user_id';
  end if;

  return new;
end;
$$;

drop trigger if exists legal_document_acceptances_validate_identity
  on public.legal_document_acceptances;
create trigger legal_document_acceptances_validate_identity
before insert or update on public.legal_document_acceptances
for each row execute function public.validate_legal_document_acceptance_identity();

create unique index if not exists idx_legal_document_acceptances_unique
  on public.legal_document_acceptances(auth_user_id, document_type, action_type, document_version, acceptance_context);

create index if not exists idx_legal_document_acceptances_auth_user
  on public.legal_document_acceptances(auth_user_id, accepted_at desc);

create index if not exists idx_legal_document_acceptances_customer
  on public.legal_document_acceptances(customer_id, accepted_at desc);

alter table public.legal_document_acceptances enable row level security;

drop policy if exists legal_document_acceptances_own_select
  on public.legal_document_acceptances;
create policy legal_document_acceptances_own_select
on public.legal_document_acceptances
for select
to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists legal_document_acceptances_staff_all
  on public.legal_document_acceptances;
drop policy if exists legal_document_acceptances_staff_select
  on public.legal_document_acceptances;
create policy legal_document_acceptances_staff_select
on public.legal_document_acceptances
for select
to authenticated
using (public.current_user_is_staff());

revoke all privileges on table public.legal_document_acceptances from anon, authenticated;
grant select on table public.legal_document_acceptances to authenticated;
grant select, insert, update, delete on public.legal_document_acceptances to service_role;

notify pgrst, 'reload schema';
