-- Staff Mobile support chat. Each active staff profile owns exactly one
-- CRM conversation; staff never receive direct access to CRM tables.

begin;

alter table public.crm_conversations
  add column if not exists staff_profile_id uuid references public.profiles(id) on delete set null;

alter table public.crm_conversations
  drop constraint if exists crm_conversations_scope_check;

alter table public.crm_conversations
  add constraint crm_conversations_scope_check
  check (conversation_scope in ('external', 'internal', 'internal_driver', 'staff_internal'));

create unique index if not exists uq_crm_staff_internal_conversation
  on public.crm_conversations(staff_profile_id)
  where conversation_scope = 'staff_internal' and staff_profile_id is not null;

create index if not exists idx_crm_conversations_staff_support
  on public.crm_conversations(staff_profile_id, last_message_at desc)
  where conversation_scope = 'staff_internal';

create or replace function public.resolve_staff_support_profile_id()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
    and coalesce(p.role::text, '') <> 'customer'
  order by p.created_at asc nulls last, p.id
  limit 1;

  -- Older driver accounts can be linked directly to route_drivers without a
  -- profiles row. Bootstrap only a verified active route driver; never create
  -- a profile merely because an arbitrary authenticated user opens the app.
  if v_profile_id is null and exists (
    select 1
    from public.route_drivers d
    join auth.users u on u.id = auth.uid()
    where (
      d.auth_user_id = auth.uid()
      or (
        nullif(lower(btrim(coalesce(d.account_email, ''))), '') is not null
        and lower(btrim(coalesce(d.account_email, ''))) = lower(btrim(coalesce(u.email, '')))
      )
    )
      and coalesce(d.active, true) = true
      and d.deleted_at is null
  ) then
    -- A driver can legitimately use the same auth account as a customer.
    -- The active route-driver link is the authorization boundary here; do not
    -- overwrite the existing customer role just to enable staff support chat.
    select p.id into v_profile_id
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
    order by p.created_at asc nulls last, p.id
    limit 1;

    if v_profile_id is null then
      insert into public.profiles (
        auth_user_id,
        role,
        is_active,
        updated_at
      )
      values (auth.uid(), 'driver', true, now())
      on conflict do nothing;

      select p.id into v_profile_id
      from public.profiles p
      where p.auth_user_id = auth.uid()
        and coalesce(p.is_active, true) = true
      order by p.created_at asc nulls last, p.id
      limit 1;
    end if;
  end if;

  if v_profile_id is null then raise exception 'staff_profile_required'; end if;
  return v_profile_id;
end;
$$;

create or replace function public.ensure_my_staff_support_conversation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := public.resolve_staff_support_profile_id();
  v_conversation_id uuid;
  v_name text;
begin
  select coalesce(
    nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
    (
      select nullif(btrim(d.name), '')
      from public.route_drivers d
      join auth.users u on u.id = auth.uid()
      where (
        d.auth_user_id = auth.uid()
        or (
          nullif(lower(btrim(coalesce(d.account_email, ''))), '') is not null
          and lower(btrim(coalesce(d.account_email, ''))) = lower(btrim(coalesce(u.email, '')))
        )
      )
        and coalesce(d.active, true) = true
        and d.deleted_at is null
      order by d.updated_at desc nulls last, d.created_at desc nulls last, d.id
      limit 1
    )
  ) into v_name
  from public.profiles p
  where p.id = v_profile_id;

  select c.id into v_conversation_id
  from public.crm_conversations c
  where c.staff_profile_id = v_profile_id and c.conversation_scope = 'staff_internal'
  for update;

  if v_conversation_id is null then
    insert into public.crm_conversations (
      staff_profile_id, subject, status, priority, needs_reply, unread_count,
      customer_unread_count, last_channel, conversation_scope
    ) values (
      v_profile_id, 'Staff support — ' || coalesce(v_name, 'Staff account'),
      'open', 'normal', false, 0, 0, 'internal', 'staff_internal'
    ) returning id into v_conversation_id;
  else
    update public.crm_conversations
    set subject = 'Staff support — ' || coalesce(v_name, 'Staff account'), updated_at = now()
    where id = v_conversation_id;
  end if;
  return v_conversation_id;
end;
$$;

create or replace function public.get_my_staff_support_conversation()
returns table (id uuid, subject text, customer_unread_count integer, last_message_at timestamptz)
language sql security definer set search_path = '' as $$
  select c.id, c.subject, coalesce(c.customer_unread_count, 0), c.last_message_at
  from public.crm_conversations c
  where c.staff_profile_id = public.resolve_staff_support_profile_id()
    and c.conversation_scope = 'staff_internal'
  limit 1
$$;

create or replace function public.get_my_staff_support_messages(p_limit integer default 100)
returns table (id uuid, direction text, body_text text, sent_at timestamptz, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select m.id, m.direction, m.body_text, m.sent_at, m.created_at
  from public.crm_messages m
  join public.crm_conversations c on c.id = m.conversation_id
  where c.staff_profile_id = public.resolve_staff_support_profile_id()
    and c.conversation_scope = 'staff_internal'
    and m.channel = 'internal'
  order by coalesce(m.sent_at, m.created_at) desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 100))
$$;

create or replace function public.send_my_staff_support_message(p_client_message_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid := public.resolve_staff_support_profile_id();
  v_conversation_id uuid := public.ensure_my_staff_support_conversation();
  v_body text := btrim(coalesce(p_body, ''));
  v_message_id uuid;
  v_now timestamptz := now();
begin
  if p_client_message_id is null then raise exception 'client_message_id_required'; end if;
  if v_body = '' then raise exception 'message_required'; end if;
  if length(v_body) > 4000 then raise exception 'message_too_long'; end if;

  insert into public.crm_messages (
    conversation_id, direction, channel, body_text, status, metadata, sent_at, created_at
  ) values (
    v_conversation_id, 'inbound', 'internal', v_body, 'received',
    jsonb_build_object('scope', 'staff_internal', 'staff_profile_id', v_profile_id), v_now, v_now
  ) returning id into v_message_id;

  update public.crm_conversations set
    status = 'open', needs_reply = true, unread_count = unread_count + 1,
    last_channel = 'internal', last_message_at = v_now, last_inbound_at = v_now, updated_at = v_now
  where id = v_conversation_id and staff_profile_id = v_profile_id and conversation_scope = 'staff_internal';

  return jsonb_build_object('success', true, 'conversation_id', v_conversation_id, 'message_id', v_message_id);
end;
$$;

create or replace function public.mark_my_staff_support_read()
returns jsonb
language sql security definer set search_path = '' as $$
  with updated as (
    update public.crm_conversations c set customer_unread_count = 0, customer_last_read_at = now(), updated_at = now()
    where c.staff_profile_id = public.resolve_staff_support_profile_id()
      and c.conversation_scope = 'staff_internal'
    returning 1
  ) select jsonb_build_object('success', exists(select 1 from updated))
$$;

create or replace function public.admin_reply_staff_support_conversation(p_conversation_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_message_id uuid;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not public.current_user_can_edit_crm() then raise exception 'forbidden'; end if;
  if v_body = '' then raise exception 'message_required'; end if;
  if length(v_body) > 4000 then raise exception 'message_too_long'; end if;

  perform 1 from public.crm_conversations c
  where c.id = p_conversation_id and c.conversation_scope = 'staff_internal' for update;
  if not found then raise exception 'conversation_not_found'; end if;

  insert into public.crm_messages (conversation_id, direction, channel, body_text, status, metadata, sent_at, created_at)
  values (p_conversation_id, 'outbound', 'internal', v_body, 'sent',
    jsonb_build_object('scope', 'staff_internal'), v_now, v_now)
  returning id into v_message_id;

  update public.crm_conversations set
    status = 'open', needs_reply = false, customer_unread_count = customer_unread_count + 1,
    last_channel = 'internal', last_message_at = v_now, last_outbound_at = v_now, updated_at = v_now
  where id = p_conversation_id;
  return jsonb_build_object('success', true, 'message_id', v_message_id);
end;
$$;

create or replace function public.admin_mark_staff_support_conversation_read(p_conversation_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not public.current_user_can_edit_crm() then raise exception 'forbidden'; end if;
  update public.crm_conversations set unread_count = 0, last_read_at = now(), updated_at = now()
  where id = p_conversation_id and conversation_scope = 'staff_internal';
  return jsonb_build_object('success', found);
end;
$$;

revoke all on function public.resolve_staff_support_profile_id() from public, anon, authenticated;
revoke all on function public.ensure_my_staff_support_conversation() from public, anon, authenticated;
revoke all on function public.get_my_staff_support_conversation() from public, anon, authenticated;
revoke all on function public.get_my_staff_support_messages(integer) from public, anon, authenticated;
revoke all on function public.send_my_staff_support_message(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_my_staff_support_read() from public, anon, authenticated;
revoke all on function public.admin_reply_staff_support_conversation(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_mark_staff_support_conversation_read(uuid) from public, anon, authenticated;
grant execute on function public.get_my_staff_support_conversation() to authenticated;
grant execute on function public.get_my_staff_support_messages(integer) to authenticated;
grant execute on function public.send_my_staff_support_message(uuid, text) to authenticated;
grant execute on function public.mark_my_staff_support_read() to authenticated;
grant execute on function public.admin_reply_staff_support_conversation(uuid, text) to authenticated;
grant execute on function public.admin_mark_staff_support_conversation_read(uuid) to authenticated;

commit;
