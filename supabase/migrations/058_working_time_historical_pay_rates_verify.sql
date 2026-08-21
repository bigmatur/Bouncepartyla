-- 058_working_time_historical_pay_rates_verify.sql
-- Read-only verification after applying migration 058.

-- A. Rate history must not overlap for the same employee.
select
  p.id as profile_id,
  trim(concat_ws(' ', p.first_name, p.last_name)) as employee,
  r.id as rate_id,
  r.hourly_rate,
  r.overtime_eligible,
  r.effective_from,
  r.effective_until,
  lead(r.effective_from) over (
    partition by r.profile_id
    order by r.effective_from, r.created_at, r.id
  ) as next_effective_from
from public.staff_pay_rates r
join public.profiles p on p.id = r.profile_id
order by employee, r.effective_from, r.created_at, r.id;

-- B. Explicit overlap detector. Expected: 0 rows.
select
  a.profile_id,
  a.id as first_rate_id,
  b.id as second_rate_id,
  a.effective_from as first_from,
  a.effective_until as first_until,
  b.effective_from as second_from,
  b.effective_until as second_until
from public.staff_pay_rates a
join public.staff_pay_rates b
  on b.profile_id = a.profile_id
 and b.id <> a.id
 and a.id::text < b.id::text
where daterange(
        a.effective_from,
        coalesce(a.effective_until, 'infinity'::date),
        '[]'
      ) &&
      daterange(
        b.effective_from,
        coalesce(b.effective_until, 'infinity'::date),
        '[]'
      )
order by a.profile_id, a.effective_from, b.effective_from;

-- C. Current Working Time report. Change dates if needed.
select public.get_working_time_admin_report(
  '2026-07-23'::date,
  '2026-08-06'::date
);

-- D. Compact payroll summary from the report.
with report as (
  select public.get_working_time_admin_report(
    '2026-07-23'::date,
    '2026-08-06'::date
  ) as data
)
select
  e->>'display_name' as employee,
  round((e->>'paid_minutes')::numeric, 4) as paid_minutes,
  round((e->>'regular_minutes')::numeric, 4) as regular_minutes,
  round((e->>'overtime_minutes')::numeric, 4) as overtime_minutes,
  round((e->>'doubletime_minutes')::numeric, 4) as doubletime_minutes,
  round((e->>'estimated_pay')::numeric, 2) as estimated_pay,
  e->>'hourly_rate' as displayed_rate
from report,
lateral jsonb_array_elements(data->'employees') e
order by employee;
