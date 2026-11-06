-- 147_instagram_outbound_status_backfill.sql
-- Normalize historical outbound Instagram CRM message statuses and timestamps.

begin;

with instagram_outbound as (
  select
    m.id,
    m.status,
    m.sent_at,
    m.delivered_at,
    m.read_at,
    m.failed_at,
    m.created_at
  from public.crm_messages m
  where m.channel = 'instagram'
    and m.direction = 'outbound'
),
normalized as (
  select
    io.id,
    case
      when io.failed_at is not null then 'failed'
      when io.read_at is not null then 'read'
      when io.delivered_at is not null then 'delivered'
      else
        case
          when lower(coalesce(io.status, '')) in ('failed', 'read', 'delivered', 'sent', 'queued') then lower(io.status)
          else 'sent'
        end
    end as next_status,
    case
      when io.read_at is not null and io.delivered_at is null then io.read_at
      when lower(coalesce(io.status, '')) = 'read' and io.read_at is null then coalesce(io.delivered_at, io.sent_at, io.created_at, now())
      when lower(coalesce(io.status, '')) = 'delivered' and io.delivered_at is null then coalesce(io.sent_at, io.created_at, now())
      else io.delivered_at
    end as next_delivered_at,
    case
      when lower(coalesce(io.status, '')) = 'read' and io.read_at is null then coalesce(io.delivered_at, io.sent_at, io.created_at, now())
      else io.read_at
    end as next_read_at
  from instagram_outbound io
)
update public.crm_messages m
set
  status = n.next_status,
  delivered_at = n.next_delivered_at,
  read_at = n.next_read_at,
  metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
    'instagram_status_backfilled', true,
    'instagram_status_backfilled_at', now()
  )
from normalized n
where m.id = n.id
  and (
    m.status is distinct from n.next_status
    or m.delivered_at is distinct from n.next_delivered_at
    or m.read_at is distinct from n.next_read_at
  );

notify pgrst, 'reload schema';

commit;
