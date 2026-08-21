-- Read-only verification after 056_working_time_california_overtime.sql

-- 1) Confirm configured workweek start: 0=Sun, 1=Mon, ... 6=Sat.
select id, business_name, timezone, workweek_start_dow
from public.system_settings
order by created_at asc nulls last, id
limit 1;

-- 2) Current admin report.
select public.get_working_time_admin_report(
  '2026-07-23'::date,
  '2026-08-06'::date
);

-- 3) Invariant: Regular + OT + DT must equal paid minutes per employee
-- (small decimal differences may occur from timestamp precision).
with report as (
  select public.get_working_time_admin_report(
    '2026-07-23'::date,
    '2026-08-06'::date
  ) as payload
), employees as (
  select jsonb_array_elements(payload -> 'employees') as employee
  from report
)
select
  employee ->> 'display_name' as employee,
  (employee ->> 'paid_minutes')::numeric as paid_minutes,
  (employee ->> 'regular_minutes')::numeric as regular_minutes,
  (employee ->> 'overtime_minutes')::numeric as overtime_minutes,
  (employee ->> 'doubletime_minutes')::numeric as doubletime_minutes,
  round(
    (employee ->> 'paid_minutes')::numeric
    - (employee ->> 'regular_minutes')::numeric
    - (employee ->> 'overtime_minutes')::numeric
    - (employee ->> 'doubletime_minutes')::numeric,
    6
  ) as classification_difference
from employees
order by employee;
