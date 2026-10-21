-- 130 Internal messenger (customer <-> admin) using existing CRM tables.
-- Safety goals:
-- - Additive schema changes only.
-- - Preserve existing CRM RLS policies.
-- - No changes to booking/contract/payment authorization.

begin;

alter table public.crm_conversations
  add column if not exists conversation_scope text not null default 'external',
  add column if not exists customer_unread_count integer not null default 0,
  add column if not exists customer_last_read_at timestamptz;

alter table public.crm_conversations
  drop constraint if exists crm_conversations_scope_check;

alter table public.crm_conversations
  add constraint crm_conversations_scope_check
  check (conversation_scope in ('external', 'internal'));

alter table public.crm_conversations
  drop constraint if exists crm_conversations_customer_unread_count_nonnegative;

alter table public.crm_conversations
  add constraint crm_conversations_customer_unread_count_nonnegative
  check (customer_unread_count >= 0);

create index if not exists idx_crm_conversations_scope_last_message
  on public.crm_conversations(conversation_scope, last_message_at desc, created_at desc);

create unique index if not exists uq_crm_conversations_internal_per_customer
  on public.crm_conversations(customer_id)
  where conversation_scope = 'internal' and customer_id is not null;

create table if not exists public.crm_internal_attachment_uploads (
  storage_path text primary key,
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  uploaded_by uuid not null,
  uploaded_as text not null check (uploaded_as in ('customer', 'admin')),
  upload_nonce uuid not null unique,
  deletion_status text not null default 'active',
  deletion_token uuid,
  consumed_by_message_id uuid references public.crm_messages(id) on delete set null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint crm_internal_attachment_uploads_path_not_blank check (btrim(storage_path) <> '')
);

alter table public.crm_internal_attachment_uploads
  add column if not exists deletion_status text not null default 'active',
  add column if not exists deletion_token uuid;

alter table public.crm_internal_attachment_uploads
  drop constraint if exists crm_internal_attachment_uploads_deletion_status_check;

alter table public.crm_internal_attachment_uploads
  add constraint crm_internal_attachment_uploads_deletion_status_check
  check (deletion_status in ('active', 'pending_delete'));

create index if not exists idx_crm_internal_attachment_uploads_conversation
  on public.crm_internal_attachment_uploads(conversation_id, created_at desc);

create index if not exists idx_crm_internal_attachment_uploads_unconsumed
  on public.crm_internal_attachment_uploads(conversation_id, created_at desc)
  where consumed_by_message_id is null;

create index if not exists idx_crm_internal_attachment_uploads_pending_delete
  on public.crm_internal_attachment_uploads(conversation_id, created_at desc)
  where consumed_by_message_id is null
    and deletion_status = 'pending_delete';

create table if not exists public.crm_internal_message_idempotency (
  sender_user_id uuid not null,
  sender_role text not null check (sender_role in ('customer', 'admin')),
  client_message_id uuid not null,
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  body_text text not null,
  attachments jsonb not null default '[]'::jsonb,
  message_id uuid not null unique references public.crm_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint crm_internal_message_idempotency_body_len check (length(body_text) <= 4000),
  constraint crm_internal_message_idempotency_attachments_array check (jsonb_typeof(attachments) = 'array'),
  primary key (sender_user_id, sender_role, client_message_id)
);

create index if not exists idx_crm_internal_message_idempotency_conversation
  on public.crm_internal_message_idempotency(conversation_id, created_at desc);

alter table public.crm_internal_attachment_uploads enable row level security;
alter table public.crm_internal_message_idempotency enable row level security;

create or replace function public.resolve_internal_messenger_customer_id()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_customer_id uuid;
  v_customer_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.auth_user_id = v_user_id
      and lower(coalesce(p.role, '')) = 'customer'
      and coalesce(p.is_active, false) = true
  ) then
    raise exception 'forbidden';
  end if;

  select count(*)
  into v_customer_count
  from public.customers c
  where c.auth_user_id = v_user_id;

  if v_customer_count = 0 then
    raise exception 'customer_not_found';
  end if;

  if v_customer_count > 1 then
    raise exception 'customer_mapping_ambiguous';
  end if;

  select c.id
  into v_customer_id
  from public.customers c
  where c.auth_user_id = v_user_id
  limit 1;

  if v_customer_id is null then
    raise exception 'customer_not_found';
  end if;

  return v_customer_id;
end;
$$;

create or replace function public.validate_internal_message_attachments(
  p_conversation_id uuid,
  p_attachments jsonb,
  p_require_auth_owner boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_storage_path text;
  v_file_name text;
  v_mime_type text;
  v_file_type text;
  v_size_bytes bigint;
  v_count integer := 0;
  v_object_metadata jsonb;
  v_object_size bigint;
  v_object_mime text;
  v_object_created_at timestamptz;
  v_object_updated_at timestamptz;
  v_bucket_public boolean;
  v_upload_row public.crm_internal_attachment_uploads%rowtype;
begin
  select b.public
  into v_bucket_public
  from storage.buckets b
  where b.id = 'crm-attachments'
  limit 1;

  if v_bucket_public is null then
    raise exception 'crm_attachments_bucket_missing';
  end if;

  if v_bucket_public then
    raise exception 'crm_attachments_bucket_must_be_private';
  end if;

  if p_attachments is null then
    return;
  end if;

  if jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'invalid_attachments_payload';
  end if;

  for v_item in select * from jsonb_array_elements(p_attachments)
  loop
    v_count := v_count + 1;

    if v_count > 5 then
      raise exception 'attachments_limit_exceeded';
    end if;

    v_storage_path := btrim(coalesce(v_item ->> 'storagePath', ''));
    v_file_name := btrim(coalesce(v_item ->> 'name', ''));
    v_mime_type := lower(btrim(coalesce(v_item ->> 'mimeType', '')));
    v_file_type := lower(btrim(coalesce(v_item ->> 'type', '')));
    v_size_bytes := coalesce((v_item ->> 'size')::bigint, 0);

    if v_storage_path = '' or v_file_name = '' then
      raise exception 'attachment_metadata_invalid';
    end if;

    if pg_catalog.strpos(v_storage_path, (p_conversation_id::text || '/')) <> 1 then
      raise exception 'attachment_conversation_mismatch';
    end if;

    if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
      raise exception 'attachment_mime_not_allowed';
    end if;

    if v_size_bytes <= 0 or v_size_bytes > (10 * 1024 * 1024) then
      raise exception 'attachment_size_not_allowed';
    end if;

    if v_file_type not in ('image', 'file') then
      raise exception 'attachment_type_invalid';
    end if;

    select o.metadata, o.created_at, o.updated_at
    into v_object_metadata, v_object_created_at, v_object_updated_at
    from storage.objects o
    where o.bucket_id = 'crm-attachments'
      and o.name = v_storage_path
    limit 1;

    if v_object_metadata is null then
      raise exception 'attachment_object_not_found';
    end if;

    v_object_size := coalesce((v_object_metadata ->> 'size')::bigint, 0);
    v_object_mime := lower(coalesce(v_object_metadata ->> 'mimetype', ''));

    if v_object_size <= 0 or v_object_size > (10 * 1024 * 1024) then
      raise exception 'attachment_object_size_invalid';
    end if;

    if v_object_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
      raise exception 'attachment_object_mime_not_allowed';
    end if;

    if v_object_size <> v_size_bytes then
      raise exception 'attachment_metadata_mismatch';
    end if;

    if v_object_mime <> v_mime_type then
      raise exception 'attachment_metadata_mismatch';
    end if;

    if v_object_updated_at > v_object_created_at then
      raise exception 'attachment_object_overwritten';
    end if;

    select *
    into v_upload_row
    from public.crm_internal_attachment_uploads u
    where u.storage_path = v_storage_path;

    if v_upload_row.storage_path is null then
      raise exception 'attachment_not_registered';
    end if;

    if v_upload_row.conversation_id <> p_conversation_id then
      raise exception 'attachment_conversation_mismatch';
    end if;

    if v_upload_row.consumed_by_message_id is not null then
      raise exception 'attachment_already_consumed';
    end if;

    if v_upload_row.deletion_status <> 'active' then
      raise exception 'attachment_pending_deletion';
    end if;

    if p_require_auth_owner then
      if v_upload_row.uploaded_by <> auth.uid() then
        raise exception 'attachment_owner_mismatch';
      end if;

      if v_upload_row.uploaded_as <> 'customer' then
        raise exception 'attachment_uploader_role_mismatch';
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.register_internal_attachment_upload(
  p_conversation_id uuid,
  p_storage_path text,
  p_uploaded_as text,
  p_upload_nonce uuid,
  p_uploaded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_uploaded_by uuid := p_uploaded_by;
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_uploaded_as text := lower(btrim(coalesce(p_uploaded_as, '')));
  v_nonce uuid := p_upload_nonce;
  v_customer_id uuid;
  v_conversation_customer_id uuid;
  v_conversation_scope text;
  v_object_exists boolean := false;
begin
  if v_role <> 'service_role' then
    raise exception 'forbidden';
  end if;

  if v_path = '' then
    raise exception 'storage_path_required';
  end if;

  if v_nonce is null then
    raise exception 'upload_nonce_required';
  end if;

  if v_uploaded_by is null then
    raise exception 'uploaded_by_required';
  end if;

  if v_uploaded_as not in ('customer', 'admin') then
    raise exception 'invalid_uploaded_as';
  end if;

  select c.customer_id, c.conversation_scope
  into v_conversation_customer_id, v_conversation_scope
  from public.crm_conversations c
  where c.id = p_conversation_id
  for update;

  if v_conversation_scope is null then
    raise exception 'conversation_not_found';
  end if;

  if v_conversation_scope <> 'internal' then
    raise exception 'conversation_scope_invalid';
  end if;

  if pg_catalog.strpos(v_path, (p_conversation_id::text || '/')) <> 1 then
    raise exception 'attachment_conversation_mismatch';
  end if;

  if v_path !~ (
    '^'
    || p_conversation_id::text
    || '/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-[^/]+$'
  ) then
    raise exception 'attachment_path_invalid';
  end if;

  select exists(
    select 1
    from storage.objects o
    where o.bucket_id = 'crm-attachments'
      and o.name = v_path
  ) into v_object_exists;

  if not v_object_exists then
    raise exception 'attachment_object_not_found';
  end if;

  if v_uploaded_as = 'customer' then
    select c.id
    into v_customer_id
    from public.customers c
    where c.auth_user_id = v_uploaded_by
  and exists (
    select 1
    from public.profiles p
    where p.auth_user_id = v_uploaded_by
      and lower(coalesce(p.role, '')) = 'customer'
      and coalesce(p.is_active, false) = true
  )
    limit 1;

    if v_customer_id is null then
      raise exception 'forbidden';
    end if;

    if v_customer_id <> v_conversation_customer_id then
      raise exception 'forbidden';
    end if;
  end if;

  begin
    insert into public.crm_internal_attachment_uploads (
      storage_path,
      conversation_id,
      uploaded_by,
      uploaded_as,
      upload_nonce,
      deletion_status,
      deletion_token,
      consumed_by_message_id,
      consumed_at
    )
    values (
      v_path,
      p_conversation_id,
      v_uploaded_by,
      v_uploaded_as,
      v_nonce,
      'active',
      null,
      null,
      null
    );
  exception
    when unique_violation then
      if exists (
        select 1
        from public.crm_internal_attachment_uploads u
        where u.storage_path = v_path
      ) then
        raise exception 'attachment_already_registered';
      end if;
      raise;
  end;

  return pg_catalog.jsonb_build_object('success', true);
end;
$$;

create or replace function public.consume_internal_attachments(
  p_conversation_id uuid,
  p_message_id uuid,
  p_attachments jsonb,
  p_sender_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_storage_path text;
  v_upload_row public.crm_internal_attachment_uploads%rowtype;
  v_sender_role text := lower(btrim(coalesce(p_sender_role, '')));
begin
  if p_attachments is null then
    return;
  end if;

  if jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'invalid_attachments_payload';
  end if;

  if v_sender_role not in ('customer', 'admin') then
    raise exception 'invalid_sender_role';
  end if;

  for v_item in select * from jsonb_array_elements(p_attachments)
  loop
    v_storage_path := btrim(coalesce(v_item ->> 'storagePath', ''));

    if v_storage_path = '' then
      raise exception 'attachment_metadata_invalid';
    end if;

    select *
    into v_upload_row
    from public.crm_internal_attachment_uploads u
    where u.storage_path = v_storage_path
    for update;

    if v_upload_row.storage_path is null then
      raise exception 'attachment_not_registered';
    end if;

    if v_upload_row.conversation_id <> p_conversation_id then
      raise exception 'attachment_conversation_mismatch';
    end if;

    if v_upload_row.uploaded_as <> v_sender_role then
      raise exception 'attachment_uploader_role_mismatch';
    end if;

    if v_upload_row.uploaded_by <> auth.uid() then
      raise exception 'attachment_owner_mismatch';
    end if;

    if v_upload_row.consumed_by_message_id is not null then
      raise exception 'attachment_already_consumed';
    end if;

    if v_upload_row.deletion_status <> 'active' then
      raise exception 'attachment_pending_deletion';
    end if;

    update public.crm_internal_attachment_uploads
    set
      consumed_by_message_id = p_message_id,
      consumed_at = pg_catalog.now()
    where storage_path = v_storage_path
      and consumed_by_message_id is null;

    if not found then
      raise exception 'attachment_already_consumed';
    end if;
  end loop;
end;
$$;

create or replace function public.safe_remove_internal_upload_attachments(
  p_conversation_id uuid,
  p_storage_paths text[],
  p_deletion_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_customer_id uuid;
  v_path text;
  v_token uuid := p_deletion_token;
  v_effective_token uuid := p_deletion_token;
  v_upload_row public.crm_internal_attachment_uploads%rowtype;
  v_allowed text[] := '{}'::text[];
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if p_storage_paths is null or array_length(p_storage_paths, 1) is null then
    return pg_catalog.jsonb_build_object(
      'deletion_token', v_token,
      'storage_paths', '{}'::text[]
    );
  end if;

  if v_token is null then
    raise exception 'deletion_token_required';
  end if;

  if not exists (
    select 1
    from public.crm_conversations c
    where c.id = p_conversation_id
      and c.conversation_scope = 'internal'
  ) then
    raise exception 'conversation_not_found';
  end if;

  if public.current_user_can_edit_crm() then
    v_is_admin := true;
  else
    v_customer_id := public.resolve_internal_messenger_customer_id();

    if not exists (
      select 1
      from public.crm_conversations c
      where c.id = p_conversation_id
        and c.customer_id = v_customer_id
        and c.conversation_scope = 'internal'
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  foreach v_path in array p_storage_paths
  loop
    select *
    into v_upload_row
    from public.crm_internal_attachment_uploads u
    where u.storage_path = v_path
    for update;

    if v_upload_row.storage_path is null then
      continue;
    end if;

    if v_upload_row.conversation_id <> p_conversation_id then
      raise exception 'attachment_conversation_mismatch';
    end if;

    if v_upload_row.consumed_by_message_id is not null then
      continue;
    end if;

    if v_upload_row.uploaded_by <> v_user_id then
      continue;
    end if;

    if v_is_admin then
      if v_upload_row.uploaded_as <> 'admin' then
        continue;
      end if;
    else
      if v_upload_row.uploaded_as <> 'customer' then
        continue;
      end if;
    end if;

    if v_upload_row.deletion_status = 'pending_delete' then
      if v_upload_row.deletion_token is null then
        update public.crm_internal_attachment_uploads
        set deletion_token = v_effective_token
        where storage_path = v_path
          and deletion_status = 'pending_delete'
          and deletion_token is null;

        if not found then
          continue;
        end if;
      else
        if v_effective_token is distinct from v_upload_row.deletion_token then
          if v_allowed = '{}'::text[] then
            v_effective_token := v_upload_row.deletion_token;
          else
            continue;
          end if;
        end if;
      end if;

      v_allowed := pg_catalog.array_append(v_allowed, v_path);
      continue;
    end if;

    update public.crm_internal_attachment_uploads
    set
      deletion_status = 'pending_delete',
      deletion_token = v_effective_token
    where storage_path = v_path
      and conversation_id = p_conversation_id
      and consumed_by_message_id is null
      and uploaded_by = v_user_id
      and deletion_status = 'active'
      and (
        (v_is_admin and uploaded_as = 'admin')
        or (not v_is_admin and uploaded_as = 'customer')
      );

    if not found then
      continue;
    end if;

    v_allowed := pg_catalog.array_append(v_allowed, v_path);
  end loop;

  return pg_catalog.jsonb_build_object(
    'deletion_token', v_effective_token,
    'storage_paths', v_allowed
  );
end;
$$;

create or replace function public.finalize_internal_upload_attachments_deletion(
  p_conversation_id uuid,
  p_storage_paths text[],
  p_deletion_token uuid
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_customer_id uuid;
  v_path text;
  v_token uuid := p_deletion_token;
  v_upload_row public.crm_internal_attachment_uploads%rowtype;
  v_deleted text[] := '{}'::text[];
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if v_token is null then
    raise exception 'deletion_token_required';
  end if;

  if p_storage_paths is null or array_length(p_storage_paths, 1) is null then
    return '{}'::text[];
  end if;

  if not exists (
    select 1
    from public.crm_conversations c
    where c.id = p_conversation_id
      and c.conversation_scope = 'internal'
  ) then
    raise exception 'conversation_not_found';
  end if;

  if public.current_user_can_edit_crm() then
    v_is_admin := true;
  else
    v_customer_id := public.resolve_internal_messenger_customer_id();

    if not exists (
      select 1
      from public.crm_conversations c
      where c.id = p_conversation_id
        and c.customer_id = v_customer_id
        and c.conversation_scope = 'internal'
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  foreach v_path in array p_storage_paths
  loop
    select *
    into v_upload_row
    from public.crm_internal_attachment_uploads u
    where u.storage_path = v_path
    for update;

    if v_upload_row.storage_path is null then
      continue;
    end if;

    if v_upload_row.conversation_id <> p_conversation_id then
      raise exception 'attachment_conversation_mismatch';
    end if;

    if v_upload_row.consumed_by_message_id is not null then
      continue;
    end if;

    if v_upload_row.uploaded_by <> v_user_id then
      continue;
    end if;

    if v_is_admin then
      if v_upload_row.uploaded_as <> 'admin' then
        continue;
      end if;
    else
      if v_upload_row.uploaded_as <> 'customer' then
        continue;
      end if;
    end if;

    if v_upload_row.deletion_status <> 'pending_delete' then
      continue;
    end if;

    if v_upload_row.deletion_token is distinct from v_token then
      continue;
    end if;

    delete from public.crm_internal_attachment_uploads
    where storage_path = v_path
      and deletion_status = 'pending_delete'
      and deletion_token is not distinct from v_token
      and consumed_by_message_id is null;

    if not found then
      continue;
    end if;

    v_deleted := pg_catalog.array_append(v_deleted, v_path);
  end loop;

  return v_deleted;
end;
$$;

create or replace function public.ensure_my_internal_conversation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_conversation_id uuid;
  v_now timestamptz := pg_catalog.now();
begin
  v_customer_id := public.resolve_internal_messenger_customer_id();

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('crm-internal-customer:' || v_customer_id::text));

  select c.id
  into v_conversation_id
  from public.crm_conversations c
  where c.customer_id = v_customer_id
    and c.conversation_scope = 'internal'
  for update;

  if v_conversation_id is null then
    insert into public.crm_conversations (
      lead_id,
      customer_id,
      booking_id,
      subject,
      status,
      priority,
      needs_reply,
      unread_count,
      customer_unread_count,
      customer_last_read_at,
      last_message_at,
      last_inbound_at,
      last_channel,
      conversation_scope,
      created_at,
      updated_at
    )
    values (
      null,
      v_customer_id,
      null,
      'Internal Support',
      'open',
      'normal',
      false,
      0,
      0,
      null,
      null,
      null,
      'internal',
      'internal',
      v_now,
      v_now
    )
    returning id into v_conversation_id;
  end if;

  return v_conversation_id;
end;
$$;

create or replace function public.get_my_internal_conversation()
returns table (
  id uuid,
  customer_id uuid,
  subject text,
  status text,
  priority text,
  needs_reply boolean,
  unread_count integer,
  last_read_at timestamptz,
  customer_unread_count integer,
  customer_last_read_at timestamptz,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_channel text,
  conversation_scope text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
begin
  v_customer_id := public.resolve_internal_messenger_customer_id();

  return query
  select
    c.id,
    c.customer_id,
    c.subject,
    c.status,
    c.priority,
    c.needs_reply,
    coalesce(c.unread_count, 0),
    c.last_read_at,
    coalesce(c.customer_unread_count, 0),
    c.customer_last_read_at,
    c.last_message_at,
    c.last_inbound_at,
    c.last_outbound_at,
    c.last_channel,
    c.conversation_scope,
    c.created_at,
    c.updated_at
  from public.crm_conversations c
  where c.customer_id = v_customer_id
    and c.conversation_scope = 'internal'
  order by c.created_at desc
  limit 1;
end;
$$;

create or replace function public.get_my_internal_messages(
  p_limit integer default 30,
  p_before timestamptz default null,
  p_before_message_id uuid default null
)
returns table (
  id uuid,
  conversation_id uuid,
  direction text,
  channel text,
  body_text text,
  status text,
  metadata jsonb,
  sent_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_conversation_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  v_customer_id := public.resolve_internal_messenger_customer_id();

  select c.id
  into v_conversation_id
  from public.crm_conversations c
  where c.customer_id = v_customer_id
    and c.conversation_scope = 'internal'
  limit 1;

  if v_conversation_id is null then
    return;
  end if;

  return query
  select
    m.id,
    m.conversation_id,
    m.direction,
    m.channel,
    m.body_text,
    m.status,
    coalesce(m.metadata, '{}'::jsonb),
    m.sent_at,
    m.created_at
  from public.crm_messages m
  where m.conversation_id = v_conversation_id
    and m.channel = 'internal'
    and (
      p_before is null
      or coalesce(m.sent_at, m.created_at) < p_before
      or (
        coalesce(m.sent_at, m.created_at) = p_before
        and m.id < coalesce(
          p_before_message_id,
          'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
        )
      )
    )
  order by coalesce(m.sent_at, m.created_at) desc, m.id desc
  limit v_limit;
end;
$$;

drop function if exists public.send_my_internal_message(text, jsonb);

create or replace function public.send_my_internal_message(
  p_client_message_id uuid,
  p_body text,
  p_attachments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_user_id uuid := auth.uid();
  v_client_message_id uuid := p_client_message_id;
  v_trimmed_body text := btrim(coalesce(p_body, ''));
  v_effective_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_idempotency_row public.crm_internal_message_idempotency%rowtype;
  v_created_conversation boolean := false;
begin
  v_customer_id := public.resolve_internal_messenger_customer_id();

  if v_client_message_id is null then
    raise exception 'client_message_id_required';
  end if;

  if jsonb_typeof(v_effective_attachments) <> 'array' then
    raise exception 'invalid_attachments_payload';
  end if;

  if length(v_trimmed_body) > 4000 then
    raise exception 'message_too_long';
  end if;

  if (v_trimmed_body = '') and (
    jsonb_array_length(v_effective_attachments) = 0
  ) then
    raise exception 'message_or_attachment_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(
      'crm-internal-idem:customer:'
      || coalesce(v_user_id::text, '')
      || ':'
      || v_client_message_id::text
    )
  );

  select i.*
  into v_idempotency_row
  from public.crm_internal_message_idempotency i
  where i.sender_user_id = v_user_id
    and i.sender_role = 'customer'
    and i.client_message_id = v_client_message_id
  for update;

  if v_idempotency_row.sender_user_id is not null then
    if v_idempotency_row.body_text is distinct from v_trimmed_body
      or v_idempotency_row.attachments is distinct from v_effective_attachments then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;

    return pg_catalog.jsonb_build_object(
      'success', true,
      'conversation_id', v_idempotency_row.conversation_id,
      'message_id', v_idempotency_row.message_id,
      'created_conversation', false,
      'idempotent_replay', true
    );
  end if;

  select c.id
  into v_conversation_id
  from public.crm_conversations c
  where c.customer_id = v_customer_id
    and c.conversation_scope = 'internal'
  limit 1;

  if v_conversation_id is null then
    v_conversation_id := public.ensure_my_internal_conversation();
    v_created_conversation := true;
  end if;

  perform 1
  from public.crm_conversations c
  where c.id = v_conversation_id
    and c.customer_id = v_customer_id
    and c.conversation_scope = 'internal'
  for update;

  perform public.validate_internal_message_attachments(
    v_conversation_id,
    v_effective_attachments,
    false
  );

  insert into public.crm_messages (
    conversation_id,
    direction,
    channel,
    sender_identity,
    recipient_identity,
    body_text,
    body_html,
    provider_message_id,
    provider_thread_id,
    status,
    metadata,
    sent_at,
    delivered_at,
    read_at,
    failed_at,
    created_at
  )
  values (
    v_conversation_id,
    'inbound',
    'internal',
    null,
    null,
    nullif(v_trimmed_body, ''),
    null,
    null,
    null,
    'received',
    pg_catalog.jsonb_build_object(
      'scope', 'internal',
      'attachments', v_effective_attachments
    ),
    v_now,
    null,
    null,
    null,
    v_now
  )
  returning id into v_message_id;

  perform public.consume_internal_attachments(
    v_conversation_id,
    v_message_id,
    v_effective_attachments,
    'customer'
  );

  insert into public.crm_internal_message_idempotency (
    sender_user_id,
    sender_role,
    client_message_id,
    conversation_id,
    body_text,
    attachments,
    message_id,
    created_at
  )
  values (
    v_user_id,
    'customer',
    v_client_message_id,
    v_conversation_id,
    v_trimmed_body,
    v_effective_attachments,
    v_message_id,
    v_now
  );

  update public.crm_conversations c
  set
    status = 'open',
    needs_reply = true,
    unread_count = coalesce(c.unread_count, 0) + 1,
    last_channel = 'internal',
    last_message_at = v_now,
    last_inbound_at = v_now,
    updated_at = v_now
  where c.id = v_conversation_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'created_conversation', v_created_conversation,
    'idempotent_replay', false
  );
end;
$$;

create or replace function public.mark_my_internal_conversation_read(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_rows integer := 0;
begin
  v_customer_id := public.resolve_internal_messenger_customer_id();

  update public.crm_conversations c
  set
    customer_unread_count = 0,
    customer_last_read_at = v_now,
    updated_at = v_now
  where c.id = p_conversation_id
    and c.customer_id = v_customer_id
    and c.conversation_scope = 'internal';

  get diagnostics v_rows = row_count;

  return pg_catalog.jsonb_build_object('success', v_rows = 1);
end;
$$;

create or replace function public.get_my_internal_unread_count()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_unread integer := 0;
begin
  v_customer_id := public.resolve_internal_messenger_customer_id();

  select coalesce(c.customer_unread_count, 0)
  into v_unread
  from public.crm_conversations c
  where c.customer_id = v_customer_id
    and c.conversation_scope = 'internal'
  limit 1;

  return coalesce(v_unread, 0);
end;
$$;

drop function if exists public.admin_reply_internal_conversation(uuid, text, jsonb);

create or replace function public.admin_reply_internal_conversation(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_body text,
  p_attachments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_user_id uuid := auth.uid();
  v_client_message_id uuid := p_client_message_id;
  v_trimmed_body text := btrim(coalesce(p_body, ''));
  v_effective_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_idempotency_row public.crm_internal_message_idempotency%rowtype;
  v_locked_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if v_client_message_id is null then
    raise exception 'client_message_id_required';
  end if;

  if jsonb_typeof(v_effective_attachments) <> 'array' then
    raise exception 'invalid_attachments_payload';
  end if;

  if not public.current_user_can_edit_crm() then
    raise exception 'forbidden';
  end if;

  if length(v_trimmed_body) > 4000 then
    raise exception 'message_too_long';
  end if;

  if (v_trimmed_body = '') and (
    jsonb_array_length(v_effective_attachments) = 0
  ) then
    raise exception 'message_or_attachment_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(
      'crm-internal-idem:admin:'
      || v_user_id::text
      || ':'
      || v_client_message_id::text
    )
  );

  select i.*
  into v_idempotency_row
  from public.crm_internal_message_idempotency i
  where i.sender_user_id = v_user_id
    and i.sender_role = 'admin'
    and i.client_message_id = v_client_message_id
  for update;

  if v_idempotency_row.sender_user_id is not null then
    if v_idempotency_row.conversation_id is distinct from p_conversation_id
      or v_idempotency_row.body_text is distinct from v_trimmed_body
      or v_idempotency_row.attachments is distinct from v_effective_attachments then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;

    return pg_catalog.jsonb_build_object(
      'success', true,
      'conversation_id', p_conversation_id,
      'message_id', v_idempotency_row.message_id,
      'idempotent_replay', true
    );
  end if;

  select c.id
  into v_locked_conversation_id
  from public.crm_conversations c
  where c.id = p_conversation_id
    and c.conversation_scope = 'internal'
  for update;

  if v_locked_conversation_id is null then
    raise exception 'conversation_not_found';
  end if;

  perform public.validate_internal_message_attachments(
    p_conversation_id,
    v_effective_attachments,
    false
  );

  insert into public.crm_messages (
    conversation_id,
    direction,
    channel,
    sender_identity,
    recipient_identity,
    body_text,
    body_html,
    provider_message_id,
    provider_thread_id,
    status,
    metadata,
    sent_at,
    delivered_at,
    read_at,
    failed_at,
    created_at
  )
  values (
    p_conversation_id,
    'outbound',
    'internal',
    null,
    null,
    nullif(v_trimmed_body, ''),
    null,
    null,
    null,
    'sent',
    pg_catalog.jsonb_build_object(
      'scope', 'internal',
      'attachments', v_effective_attachments
    ),
    v_now,
    null,
    null,
    null,
    v_now
  )
  returning id into v_message_id;

  perform public.consume_internal_attachments(
    p_conversation_id,
    v_message_id,
    v_effective_attachments,
    'admin'
  );

  insert into public.crm_internal_message_idempotency (
    sender_user_id,
    sender_role,
    client_message_id,
    conversation_id,
    body_text,
    attachments,
    message_id,
    created_at
  )
  values (
    v_user_id,
    'admin',
    v_client_message_id,
    p_conversation_id,
    v_trimmed_body,
    v_effective_attachments,
    v_message_id,
    v_now
  );

  update public.crm_conversations c
  set
    status = 'open',
    needs_reply = false,
    customer_unread_count = coalesce(c.customer_unread_count, 0) + 1,
    last_channel = 'internal',
    last_message_at = v_now,
    last_outbound_at = v_now,
    updated_at = v_now
  where c.id = p_conversation_id
    and c.conversation_scope = 'internal';

  return pg_catalog.jsonb_build_object(
    'success', true,
    'conversation_id', p_conversation_id,
    'message_id', v_message_id,
    'idempotent_replay', false
  );
end;
$$;

create or replace function public.admin_mark_internal_conversation_read(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_rows integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if not public.current_user_can_edit_crm() then
    raise exception 'forbidden';
  end if;

  update public.crm_conversations c
  set
    unread_count = 0,
    last_read_at = v_now,
    updated_at = v_now
  where c.id = p_conversation_id
    and c.conversation_scope = 'internal';

  get diagnostics v_rows = row_count;

  return pg_catalog.jsonb_build_object('success', v_rows = 1);
end;
$$;

revoke all on function public.resolve_internal_messenger_customer_id() from public, anon, authenticated;
revoke all on function public.validate_internal_message_attachments(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.ensure_my_internal_conversation() from public, anon, authenticated;
revoke all on function public.register_internal_attachment_upload(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.consume_internal_attachments(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.safe_remove_internal_upload_attachments(uuid, text[], uuid) from public, anon, authenticated;
revoke all on function public.finalize_internal_upload_attachments_deletion(uuid, text[], uuid) from public, anon, authenticated;
revoke all on function public.get_my_internal_conversation() from public, anon, authenticated;
revoke all on function public.get_my_internal_messages(integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.send_my_internal_message(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_my_internal_conversation_read(uuid) from public, anon, authenticated;
revoke all on function public.get_my_internal_unread_count() from public, anon, authenticated;
revoke all on function public.admin_reply_internal_conversation(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_mark_internal_conversation_read(uuid) from public, anon, authenticated;

grant execute on function public.get_my_internal_conversation() to authenticated;
grant execute on function public.get_my_internal_messages(integer, timestamptz, uuid) to authenticated;
grant execute on function public.send_my_internal_message(uuid, text, jsonb) to authenticated;
grant execute on function public.mark_my_internal_conversation_read(uuid) to authenticated;
grant execute on function public.get_my_internal_unread_count() to authenticated;
grant execute on function public.admin_reply_internal_conversation(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.admin_mark_internal_conversation_read(uuid) to authenticated;
grant execute on function public.safe_remove_internal_upload_attachments(uuid, text[], uuid) to authenticated;
grant execute on function public.finalize_internal_upload_attachments_deletion(uuid, text[], uuid) to authenticated;

grant execute on function public.get_my_internal_conversation() to service_role;
grant execute on function public.ensure_my_internal_conversation() to service_role;
grant execute on function public.get_my_internal_messages(integer, timestamptz, uuid) to service_role;
grant execute on function public.send_my_internal_message(uuid, text, jsonb) to service_role;
grant execute on function public.mark_my_internal_conversation_read(uuid) to service_role;
grant execute on function public.get_my_internal_unread_count() to service_role;
grant execute on function public.admin_reply_internal_conversation(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_mark_internal_conversation_read(uuid) to service_role;
grant execute on function public.register_internal_attachment_upload(uuid, text, text, uuid, uuid) to service_role;
grant execute on function public.consume_internal_attachments(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.safe_remove_internal_upload_attachments(uuid, text[], uuid) to service_role;
grant execute on function public.finalize_internal_upload_attachments_deletion(uuid, text[], uuid) to service_role;

notify pgrst, 'reload schema';

commit;
