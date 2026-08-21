-- 059_working_time_break_premium_review.sql
-- Admin-reviewed California meal/rest premium workflow.
-- IMPORTANT: compliance flags remain advisory. Premium pay is created only after
-- an authorized administrator explicitly confirms it.
-- Premium amounts use the employee's effective hourly rate as an operational
-- regular-rate estimate/snapshot. They are NOT counted as hours worked for OT.

create table if not exists public.staff_break_premium_decisions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  premium_type text not null,
  decision text not null,
  reason text not null,
  regular_rate_snapshot numeric(10,2) null,
  premium_amount_snapshot numeric(10,2) null,
  decided_by uuid null references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_break_premium_type_check
    check (premium_type in ('meal', 'rest')),
  constraint staff_break_premium_decision_check
    check (decision in ('no_premium', 'premium_owed')),
  constraint staff_break_premium_reason_check
    check (length(trim(reason)) >= 3),
  constraint staff_break_premium_amount_check
    check (premium_amount_snapshot is null or premium_amount_snapshot >= 0),
  unique (profile_id, work_date, premium_type)
);

create index if not exists staff_break_premium_decisions_period_idx
  on public.staff_break_premium_decisions(work_date, profile_id);

create table if not exists public.staff_break_premium_history (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid null references public.staff_break_premium_decisions(id) on delete set null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  premium_type text not null,
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  reason text not null,
  changed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists staff_break_premium_history_period_idx
  on public.staff_break_premium_history(work_date, profile_id, created_at desc);

alter table public.staff_break_premium_decisions enable row level security;
alter table public.staff_break_premium_history enable row level security;

drop policy if exists staff_break_premium_decisions_management_all
on public.staff_break_premium_decisions;
create policy staff_break_premium_decisions_management_all
on public.staff_break_premium_decisions
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role::text in ('super_admin', 'admin', 'manager')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role::text in ('super_admin', 'admin', 'manager')
  )
);

drop policy if exists staff_break_premium_history_management_select
on public.staff_break_premium_history;
create policy staff_break_premium_history_management_select
on public.staff_break_premium_history
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role::text in ('super_admin', 'admin', 'manager')
  )
);

create or replace function public.admin_review_staff_break_premium(
  p_profile_id uuid,
  p_work_date date,
  p_premium_type text,
  p_decision text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_reason text := trim(coalesce(p_reason, ''));
  v_existing public.staff_break_premium_decisions%rowtype;
  v_decision_id uuid;
  v_rate numeric(10,2);
  v_amount numeric(10,2);
begin
  select p.role::text into v_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized to review break premiums.';
  end if;

  if p_premium_type not in ('meal', 'rest') then
    raise exception 'Premium type must be meal or rest.';
  end if;

  if p_decision not in ('no_premium', 'premium_owed') then
    raise exception 'Decision must be no_premium or premium_owed.';
  end if;

  if length(v_reason) < 3 then
    raise exception 'A reason is required.';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_profile_id) then
    raise exception 'Employee profile was not found.';
  end if;

  -- Operational regular-rate estimate: hourly rate effective on this work date.
  select r.hourly_rate
    into v_rate
  from public.staff_pay_rates r
  where r.profile_id = p_profile_id
    and r.effective_from <= p_work_date
    and (r.effective_until is null or r.effective_until >= p_work_date)
  order by r.effective_from desc, r.created_at desc
  limit 1;

  v_amount := case
    when p_decision = 'premium_owed' and v_rate is not null then v_rate
    when p_decision = 'premium_owed' then null
    else 0
  end;

  select * into v_existing
  from public.staff_break_premium_decisions d
  where d.profile_id = p_profile_id
    and d.work_date = p_work_date
    and d.premium_type = p_premium_type
  for update;

  if found then
    update public.staff_break_premium_decisions
       set decision = p_decision,
           reason = v_reason,
           regular_rate_snapshot = v_rate,
           premium_amount_snapshot = v_amount,
           decided_by = auth.uid(),
           decided_at = now(),
           updated_at = now()
     where id = v_existing.id
     returning id into v_decision_id;

    insert into public.staff_break_premium_history (
      decision_id, profile_id, work_date, premium_type,
      old_values, new_values, reason, changed_by
    ) values (
      v_decision_id, p_profile_id, p_work_date, p_premium_type,
      jsonb_build_object(
        'decision', v_existing.decision,
        'regular_rate_snapshot', v_existing.regular_rate_snapshot,
        'premium_amount_snapshot', v_existing.premium_amount_snapshot,
        'reason', v_existing.reason
      ),
      jsonb_build_object(
        'decision', p_decision,
        'regular_rate_snapshot', v_rate,
        'premium_amount_snapshot', v_amount,
        'reason', v_reason
      ),
      v_reason,
      auth.uid()
    );
  else
    insert into public.staff_break_premium_decisions (
      profile_id, work_date, premium_type, decision, reason,
      regular_rate_snapshot, premium_amount_snapshot,
      decided_by, decided_at, updated_at
    ) values (
      p_profile_id, p_work_date, p_premium_type, p_decision, v_reason,
      v_rate, v_amount, auth.uid(), now(), now()
    ) returning id into v_decision_id;

    insert into public.staff_break_premium_history (
      decision_id, profile_id, work_date, premium_type,
      old_values, new_values, reason, changed_by
    ) values (
      v_decision_id, p_profile_id, p_work_date, p_premium_type,
      '{}'::jsonb,
      jsonb_build_object(
        'decision', p_decision,
        'regular_rate_snapshot', v_rate,
        'premium_amount_snapshot', v_amount,
        'reason', v_reason
      ),
      v_reason,
      auth.uid()
    );
  end if;

  return v_decision_id;
end;
$$;

create or replace function public.get_working_time_break_premium_report(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_result jsonb;
begin
  select p.role::text into v_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized to view break premium decisions.';
  end if;

  with decision_rows as (
    select
      d.id,
      d.profile_id,
      d.work_date,
      d.premium_type,
      d.decision,
      d.reason,
      d.regular_rate_snapshot,
      d.premium_amount_snapshot,
      d.decided_at,
      u.email as decided_by_email
    from public.staff_break_premium_decisions d
    left join auth.users u on u.id = d.decided_by
    where d.work_date between p_from and p_to
  ), history_rows as (
    select
      h.id,
      h.decision_id,
      h.profile_id,
      h.work_date,
      h.premium_type,
      h.old_values,
      h.new_values,
      h.reason,
      h.created_at,
      u.email as changed_by_email
    from public.staff_break_premium_history h
    left join auth.users u on u.id = h.changed_by
    where h.work_date between p_from and p_to
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'summary', jsonb_build_object(
      'confirmed_premiums', (select count(*) from decision_rows where decision = 'premium_owed'),
      'meal_premiums', (select count(*) from decision_rows where decision = 'premium_owed' and premium_type = 'meal'),
      'rest_premiums', (select count(*) from decision_rows where decision = 'premium_owed' and premium_type = 'rest'),
      'estimated_premium_pay', coalesce((select sum(premium_amount_snapshot) from decision_rows where decision = 'premium_owed'), 0),
      'unknown_rate_premiums', (select count(*) from decision_rows where decision = 'premium_owed' and premium_amount_snapshot is null)
    ),
    'decisions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', dr.id,
          'profile_id', dr.profile_id,
          'work_date', dr.work_date,
          'premium_type', dr.premium_type,
          'decision', dr.decision,
          'reason', dr.reason,
          'regular_rate_snapshot', dr.regular_rate_snapshot,
          'premium_amount_snapshot', dr.premium_amount_snapshot,
          'decided_at', dr.decided_at,
          'decided_by_email', dr.decided_by_email
        ) order by dr.work_date desc, dr.premium_type
      ) from decision_rows dr
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', hr.id,
          'decision_id', hr.decision_id,
          'profile_id', hr.profile_id,
          'work_date', hr.work_date,
          'premium_type', hr.premium_type,
          'old_values', hr.old_values,
          'new_values', hr.new_values,
          'reason', hr.reason,
          'created_at', hr.created_at,
          'changed_by_email', hr.changed_by_email
        ) order by hr.created_at desc
      ) from history_rows hr
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_review_staff_break_premium(uuid, date, text, text, text) from public;
revoke all on function public.get_working_time_break_premium_report(date, date) from public;
grant execute on function public.admin_review_staff_break_premium(uuid, date, text, text, text) to authenticated;
grant execute on function public.get_working_time_break_premium_report(date, date) to authenticated;

notify pgrst, 'reload schema';
