-- 071 verification (read-only)

select event_code, name, enabled, anchor_type, offset_minutes, catchup_minutes, requires_balance_due
from public.notification_schedules
order by event_code;

select e.code, e.label, r.channel, r.enabled, t.name as template_name
from public.notification_events e
left join public.notification_rules r on r.event_code=e.code and r.recipient_role='customer'
left join public.notification_templates t on t.id=r.template_id
where e.code in ('event_reminder','balance_reminder','delivery_reminder','pickup_reminder')
order by e.code, r.channel;

-- Dry diagnostic: bookings that would currently be considered due by enabled schedules.
select
  s.event_code,
  b.booking_number,
  b.event_date,
  b.balance_due,
  public.notification_booking_anchor(b, s.anchor_type) as anchor_at,
  public.notification_booking_anchor(b, s.anchor_type) - make_interval(mins => s.offset_minutes) as due_at
from public.notification_schedules s
join public.bookings b on b.customer_id is not null
where s.enabled=true
  and lower(coalesce(b.status::text,'')) not in ('draft','quote','pending_deposit','cancelled','refunded','closed')
  and (not s.requires_balance_due or coalesce(b.balance_due,0) > 0.009)
  and public.notification_booking_anchor(b, s.anchor_type) is not null
  and public.notification_booking_anchor(b, s.anchor_type) - make_interval(mins => s.offset_minutes) <= now()
  and public.notification_booking_anchor(b, s.anchor_type) - make_interval(mins => s.offset_minutes) >= now() - make_interval(mins => s.catchup_minutes)
order by due_at;
