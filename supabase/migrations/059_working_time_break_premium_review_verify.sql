-- Read-only verification after migration 059.
select public.get_working_time_break_premium_report(
  '2026-07-23'::date,
  '2026-08-06'::date
);

select
  profile_id,
  work_date,
  premium_type,
  decision,
  regular_rate_snapshot,
  premium_amount_snapshot,
  reason,
  decided_at
from public.staff_break_premium_decisions
order by work_date desc, profile_id, premium_type;

select
  profile_id,
  work_date,
  premium_type,
  old_values,
  new_values,
  reason,
  created_at
from public.staff_break_premium_history
order by created_at desc;
