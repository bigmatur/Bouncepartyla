-- 055_working_time_pay_rate_history.sql
-- Adds a read-only pay-rate history report for Staff -> Working Time.
-- Does not change time entries, routes, Driver View, or payroll calculations.

create or replace function public.get_staff_pay_rate_history(
  p_profile_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_role text;
  v_result jsonb;
begin
  select p.role::text
    into v_admin_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_admin_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized to view pay-rate history.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'profile_id', r.profile_id,
        'pay_type', r.pay_type,
        'hourly_rate', r.hourly_rate,
        'overtime_eligible', r.overtime_eligible,
        'effective_from', r.effective_from,
        'effective_until', r.effective_until,
        'created_by_email', au.email,
        'created_at', r.created_at,
        'updated_at', r.updated_at
      )
      order by r.profile_id, r.effective_from desc, r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.staff_pay_rates r
  left join auth.users au on au.id = r.created_by
  where p_profile_ids is null
     or cardinality(p_profile_ids) = 0
     or r.profile_id = any(p_profile_ids);

  return v_result;
end;
$$;

revoke all on function public.get_staff_pay_rate_history(uuid[]) from public;
grant execute on function public.get_staff_pay_rate_history(uuid[]) to authenticated;

notify pgrst, 'reload schema';
