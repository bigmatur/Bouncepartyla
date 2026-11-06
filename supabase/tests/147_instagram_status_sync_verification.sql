-- 147_instagram_status_sync_verification.sql
-- Verification queries for Instagram CRM status sync and historical backfill.

-- 1) Distribution of outbound Instagram statuses after backfill
select
  coalesce(status, '(null)') as status,
  count(*) as total
from public.crm_messages
where channel = 'instagram'
  and direction = 'outbound'
group by 1
order by 2 desc;

-- 2) Consistency checks (should be 0 or explainable)
-- read must imply delivered
select
  count(*) as read_without_delivered
from public.crm_messages
where channel = 'instagram'
  and direction = 'outbound'
  and read_at is not null
  and delivered_at is null;

-- failed should usually have failed_at
select
  count(*) as failed_without_failed_at
from public.crm_messages
where channel = 'instagram'
  and direction = 'outbound'
  and lower(coalesce(status, '')) = 'failed'
  and failed_at is null;

-- 3) Rows that were touched by migration 147
select
  count(*) as backfilled_rows
from public.crm_messages
where channel = 'instagram'
  and direction = 'outbound'
  and coalesce(metadata, '{}'::jsonb) ? 'instagram_status_backfilled';

-- 4) Recent outbound Instagram messages with status fields
select
  id,
  conversation_id,
  provider_message_id,
  status,
  sent_at,
  delivered_at,
  read_at,
  failed_at,
  metadata ->> 'instagram_status' as instagram_status,
  metadata ->> 'instagram_status_updated_at' as instagram_status_updated_at,
  created_at
from public.crm_messages
where channel = 'instagram'
  and direction = 'outbound'
order by created_at desc
limit 50;

-- 6) Automated invariants. The script must fail when the backfill is inconsistent.
do $$
begin
  if exists (
    select 1
    from public.crm_messages
    where channel = 'instagram'
      and direction = 'outbound'
      and read_at is not null
      and delivered_at is null
  ) then
    raise exception 'Instagram status invariant failed: read_at requires delivered_at';
  end if;

  if exists (
    select 1
    from public.crm_messages
    where channel = 'instagram'
      and direction = 'outbound'
      and lower(coalesce(status, '')) = 'read'
      and read_at is null
  ) then
    raise exception 'Instagram status invariant failed: read status requires read_at';
  end if;

  if exists (
    select 1
    from public.crm_messages
    where channel = 'instagram'
      and direction = 'outbound'
      and lower(coalesce(status, '')) = 'delivered'
      and delivered_at is null
  ) then
    raise exception 'Instagram status invariant failed: delivered status requires delivered_at';
  end if;
end
$$;

-- 5) Recent inbound webhook-derived status metadata
select
  id,
  conversation_id,
  provider_message_id,
  status,
  metadata ->> 'instagram_status' as instagram_status,
  metadata -> 'instagram_status_metadata' as instagram_status_metadata,
  created_at
from public.crm_messages
where channel = 'instagram'
  and direction = 'outbound'
  and (metadata ? 'instagram_status' or metadata ? 'instagram_status_metadata')
order by created_at desc
limit 50;
