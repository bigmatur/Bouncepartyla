-- 122_staff_booking_notifications_email_and_targeting.sql
-- Stage 1: ensure admin/manager booking events can notify both in_app and email.
--
-- Backward-compatibility note:
-- enqueue_staff_booking_notification is shared infrastructure. To avoid changing
-- semantics for unrelated staff events, this migration personalizes deliveries
-- only for booking_created and customer_booking_approval_requested on in_app and
-- email channels. Other events/channels keep legacy role-level behavior.

begin;

-- Enable admin/manager email rules for booking-created and approval-requested events.
insert into public.notification_rules(event_code, recipient_role, channel, enabled, template_id)
select
  'booking_created',
  role_name,
  'email',
  true,
  t.id
from (values ('admin'), ('manager')) as roles(role_name)
left join public.notification_templates t
  on t.event_code = 'booking_created'
 and t.channel = 'email'
on conflict (event_code, recipient_role, channel) do update set
  enabled = true,
  template_id = coalesce(excluded.template_id, public.notification_rules.template_id),
  updated_at = now();

insert into public.notification_rules(event_code, recipient_role, channel, enabled, template_id)
select
  'customer_booking_approval_requested',
  role_name,
  'email',
  true,
  t.id
from (values ('admin'), ('manager')) as roles(role_name)
left join public.notification_templates t
  on t.event_code = 'customer_booking_approval_requested'
 and t.channel = 'email'
on conflict (event_code, recipient_role, channel) do update set
  enabled = true,
  template_id = coalesce(excluded.template_id, public.notification_rules.template_id),
  updated_at = now();

create or replace function public.enqueue_staff_booking_notification(
  p_event_code text,
  p_booking_id uuid,
  p_recipient_role text,
  p_dedupe_suffix text default null,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event public.notification_events%rowtype;
  v_rule record;
  v_recipient record;
  v_inserted integer := 0;
  v_inserted_for_rule integer := 0;
  v_key text;
  v_role text := lower(trim(coalesce(p_recipient_role, '')));
  v_personalize_event boolean := p_event_code in ('booking_created', 'customer_booking_approval_requested');
  v_personalize_rule boolean;
begin
  if p_booking_id is null or v_role = '' then
    return 0;
  end if;

  select * into v_event
  from public.notification_events
  where code = p_event_code and active = true;

  if not found then
    return 0;
  end if;

  for v_rule in
    select r.*, cs.enabled as channel_enabled
    from public.notification_rules r
    join public.notification_channel_settings cs on cs.channel = r.channel
    where r.event_code = p_event_code
      and lower(coalesce(r.recipient_role, '')) = v_role
      and r.enabled = true
      and cs.enabled = true
  loop
    v_inserted_for_rule := 0;
    v_personalize_rule := v_personalize_event and v_rule.channel in ('in_app', 'email');

    if v_personalize_rule then
      for v_recipient in
        select
          p.auth_user_id,
          nullif(lower(trim(coalesce(au.email, ''))), '') as email
        from public.profiles p
        left join auth.users au
          on au.id = p.auth_user_id
        where coalesce(p.is_active, true) = true
          and p.auth_user_id is not null
          and lower(coalesce(p.role, '')) = v_role
      loop
        if v_rule.channel = 'email' and v_recipient.email is null then
          continue;
        end if;

        v_key := concat_ws(
          ':',
          p_event_code,
          p_booking_id::text,
          v_role,
          v_rule.channel,
          v_recipient.auth_user_id::text,
          coalesce(p_dedupe_suffix, 'booking')
        );

        insert into public.notification_deliveries(
          event_code,
          category_code,
          channel,
          recipient_role,
          auth_user_id,
          recipient_email,
          booking_id,
          template_id,
          status,
          scheduled_for,
          dedupe_key,
          payload
        ) values (
          p_event_code,
          v_event.category_code,
          v_rule.channel,
          v_role,
          v_recipient.auth_user_id,
          case when v_rule.channel = 'email' then v_recipient.email else null end,
          p_booking_id,
          v_rule.template_id,
          'queued',
          now() + make_interval(mins => greatest(coalesce(v_rule.delay_minutes, 0), 0)),
          v_key,
          coalesce(p_payload, '{}'::jsonb)
        )
        on conflict (dedupe_key) where dedupe_key is not null do nothing;

        if found then
          v_inserted := v_inserted + 1;
          v_inserted_for_rule := v_inserted_for_rule + 1;
        end if;
      end loop;

      -- For personalized channels, intentionally do not fall back to role-level
      -- deliveries: staff inboxes require concrete recipients.
      continue;
    end if;

    -- Legacy role-level behavior for unrelated events/channels.
    v_key := concat_ws(':', p_event_code, p_booking_id::text, v_role, v_rule.channel, coalesce(p_dedupe_suffix, 'booking'));

    insert into public.notification_deliveries(
      event_code,
      category_code,
      channel,
      recipient_role,
      booking_id,
      template_id,
      status,
      scheduled_for,
      dedupe_key,
      payload
    ) values (
      p_event_code,
      v_event.category_code,
      v_rule.channel,
      v_role,
      p_booking_id,
      v_rule.template_id,
      'queued',
      now() + make_interval(mins => greatest(coalesce(v_rule.delay_minutes, 0), 0)),
      v_key,
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.enqueue_staff_booking_notification(text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_staff_booking_notification(text, uuid, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
