-- REVIEW ONLY. Do not apply without explicit approval.
-- Purpose:
-- 1) Add atomic claim/finalize RPCs for Instagram media processing.
-- 2) Prevent concurrent workers from claiming the same message.
-- 3) Preserve unrelated metadata via JSONB field-level merges.

begin;

create index if not exists idx_crm_messages_instagram_inbound_created_id
  on public.crm_messages (created_at asc, id asc)
  where channel = 'instagram' and direction = 'inbound';

create or replace function public.crm_claim_instagram_media_message(
  p_message_id uuid,
  p_worker_id text,
  p_claim_token text default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.crm_messages%rowtype;
  v_now timestamptz := now();
  v_metadata jsonb;
  v_ingestion jsonb;
  v_source_attachments jsonb;
  v_image_count integer := 0;
  v_status text := '';
  v_attempts integer := 0;
  v_attempts_big bigint := 0;
  v_processed_count integer := 0;
  v_failed_count integer := 0;
  v_next_retry_at timestamptz := null;
  v_lock_token text := '';
  v_lock_expires_at timestamptz := null;
  v_claim_token text := '';
  v_new_attempts integer := 0;
  v_new_ingestion jsonb;
  v_new_metadata jsonb;
begin
  perform set_config('lock_timeout', '2s', true);
  perform set_config('statement_timeout', '15s', true);

  -- p_now is kept for signature compatibility, but server time is authoritative.
  perform p_now;

  if p_message_id is null then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'message_id_required'
    );
  end if;

  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'worker_id_required'
    );
  end if;

  select *
    into v_row
  from public.crm_messages m
  where m.id = p_message_id
    and m.channel = 'instagram'
    and m.direction = 'inbound'
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'message_not_found_or_not_instagram_inbound'
    );
  end if;

  v_metadata := coalesce(v_row.metadata, '{}'::jsonb);
  v_source_attachments := v_metadata #> '{message,attachments}';

  if jsonb_typeof(v_source_attachments) <> 'array' then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'source_attachments_missing'
    );
  end if;

  select count(*)::integer
    into v_image_count
  from jsonb_array_elements(v_source_attachments) as item
  where lower(coalesce(item ->> 'type', '')) = 'image'
    and nullif(btrim(coalesce(item #>> '{payload,url}', '')), '') is not null;

  if v_image_count <= 0 then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'no_image_candidates'
    );
  end if;

  v_ingestion := coalesce(v_metadata -> 'instagram_media_ingestion', '{}'::jsonb);
  v_status := lower(coalesce(v_ingestion ->> 'status', ''));

  if v_status = 'completed' then
    return jsonb_build_object(
      'status', 'completed',
      'message_id', v_row.id,
      'metadata', v_metadata
    );
  end if;

  -- Busy check must happen before retry/exhausted decisions.
  v_lock_token := btrim(coalesce(v_ingestion ->> 'lock_token', ''));

  begin
    if nullif(btrim(coalesce(v_ingestion ->> 'lock_expires_at', '')), '') is not null then
      v_lock_expires_at := (v_ingestion ->> 'lock_expires_at')::timestamptz;
    end if;
  exception
    when others then
      v_lock_expires_at := null;
  end;

  if v_status = 'pending'
     and v_lock_token <> ''
     and v_lock_expires_at is not null
     and v_lock_expires_at > v_now then
    return jsonb_build_object(
      'status', 'busy',
      'message_id', v_row.id,
      'lock_expires_at', v_lock_expires_at,
      'metadata', v_metadata
    );
  end if;

  if coalesce(v_ingestion ->> 'attempts', '') ~ '^[0-9]{1,18}$' then
    begin
      v_attempts_big := (v_ingestion ->> 'attempts')::bigint;
    exception
      when others then
        v_attempts_big := 0;
    end;
  else
    v_attempts_big := 0;
  end if;

  if v_attempts_big < 0 then
    v_attempts := 0;
  elsif v_attempts_big > 2147483647 then
    v_attempts := 2147483647;
  else
    v_attempts := v_attempts_big::integer;
  end if;

  if v_attempts >= 4 then
    return jsonb_build_object(
      'status', 'exhausted',
      'message_id', v_row.id,
      'attempts', v_attempts,
      'metadata', v_metadata
    );
  end if;

  begin
    if nullif(btrim(coalesce(v_ingestion ->> 'next_retry_at', '')), '') is not null then
      v_next_retry_at := (v_ingestion ->> 'next_retry_at')::timestamptz;
    end if;
  exception
    when others then
      v_next_retry_at := null;
  end;

  if v_next_retry_at is not null and v_next_retry_at > v_now then
    return jsonb_build_object(
      'status', 'retry_not_due',
      'message_id', v_row.id,
      'next_retry_at', v_next_retry_at,
      'attempts', v_attempts,
      'metadata', v_metadata
    );
  end if;

  v_claim_token := replace(pg_catalog.gen_random_uuid()::text, '-', '');

  v_new_attempts := v_attempts + 1;

  if coalesce(v_ingestion ->> 'processed_count', '') ~ '^[0-9]{1,18}$' then
    begin
      v_processed_count := least((v_ingestion ->> 'processed_count')::bigint, 2147483647)::integer;
    exception
      when others then
        v_processed_count := 0;
    end;
  else
    v_processed_count := 0;
  end if;

  if coalesce(v_ingestion ->> 'failed_count', '') ~ '^[0-9]{1,18}$' then
    begin
      v_failed_count := least((v_ingestion ->> 'failed_count')::bigint, 2147483647)::integer;
    exception
      when others then
        v_failed_count := 0;
    end;
  else
    v_failed_count := 0;
  end if;

  -- Lock TTL remains 8 minutes. If processing can exceed this duration,
  -- a separate lease-renewal mechanism should be introduced.
  v_new_ingestion := jsonb_build_object(
    'status', 'pending',
    'attempts', v_new_attempts,
    'next_retry_at', null,
    'retry_after_seconds', null,
    'last_attempt_at', v_now,
    'completed_at', null,
    'provider_message_id', coalesce(v_row.provider_message_id, null),
    'source_hosts', case
      when jsonb_typeof(v_ingestion -> 'source_hosts') = 'array'
        then v_ingestion -> 'source_hosts'
      else '[]'::jsonb
    end,
    'processed_count', v_processed_count,
    'failed_count', v_failed_count,
    'failures', case
      when jsonb_typeof(v_ingestion -> 'failures') = 'array'
        then v_ingestion -> 'failures'
      else '[]'::jsonb
    end,
    'source_attachment_count', v_image_count,
    'lock_token', v_claim_token,
    'lock_expires_at', v_now + interval '8 minutes',
    'worker_id', left(btrim(p_worker_id), 120)
  );

  v_new_metadata := jsonb_set(
    v_metadata,
    '{instagram_media_ingestion}',
    v_new_ingestion,
    true
  );

  update public.crm_messages m
  set metadata = v_new_metadata
  where m.id = v_row.id;

  return jsonb_build_object(
    'status', 'claimed',
    'message_id', v_row.id,
    'claim_token', v_claim_token,
    'attempts', v_new_attempts,
    'lock_expires_at', v_now + interval '8 minutes',
    'source_attachment_count', v_image_count,
    'metadata', v_new_metadata
  );
end;
$$;

create or replace function public.crm_finalize_instagram_media_message(
  p_message_id uuid,
  p_claim_token text,
  p_added_attachments jsonb,
  p_failures jsonb,
  p_status text,
  p_retry_after_seconds integer default null,
  p_source_hosts text[] default '{}'::text[],
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.crm_messages%rowtype;
  v_now timestamptz := now();
  v_metadata jsonb;
  v_ingestion jsonb;
  v_existing_status text := '';
  v_existing_lock_token text := '';
  v_existing_lock_expires_at timestamptz := null;
  v_attempts integer := 0;
  v_attempts_big bigint := 0;
  v_retry_after integer := null;
  v_next_retry_at timestamptz := null;
  v_completed_at timestamptz := null;
  v_failures jsonb := '[]'::jsonb;
  v_existing_attachments jsonb := '[]'::jsonb;
  v_added_attachments jsonb := '[]'::jsonb;
  v_merged_attachments jsonb := '[]'::jsonb;
  v_source_hosts text[] := '{}'::text[];
  v_source_hosts_json jsonb := '[]'::jsonb;
  v_seen_paths text[] := '{}'::text[];
  v_item jsonb;
  v_storage_path text;
  v_name text;
  v_mime text;
  v_size bigint;
  v_type text;
  v_new_item jsonb;
  v_source_attachments jsonb;
  v_source_attachment_count integer := 0;
  v_new_ingestion jsonb;
  v_new_metadata jsonb;
begin
  perform set_config('lock_timeout', '2s', true);
  perform set_config('statement_timeout', '15s', true);

  -- p_now is kept for signature compatibility, but server time is authoritative.
  perform p_now;

  if p_message_id is null then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'message_id_required'
    );
  end if;

  if nullif(btrim(coalesce(p_claim_token, '')), '') is null then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'claim_token_required'
    );
  end if;

  if lower(coalesce(p_status, '')) not in ('completed', 'partial', 'failed') then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'invalid_status'
    );
  end if;

  if p_added_attachments is not null and jsonb_typeof(p_added_attachments) <> 'array' then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'added_attachments_must_be_array'
    );
  end if;

  if p_failures is not null and jsonb_typeof(p_failures) <> 'array' then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'failures_must_be_array'
    );
  end if;

  if p_retry_after_seconds is not null and (p_retry_after_seconds < 0 or p_retry_after_seconds > 21600) then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'retry_after_out_of_range'
    );
  end if;

  select *
    into v_row
  from public.crm_messages m
  where m.id = p_message_id
    and m.channel = 'instagram'
    and m.direction = 'inbound'
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'invalid',
      'reason', 'message_not_found_or_not_instagram_inbound'
    );
  end if;

  v_metadata := coalesce(v_row.metadata, '{}'::jsonb);
  v_ingestion := coalesce(v_metadata -> 'instagram_media_ingestion', '{}'::jsonb);
  v_existing_status := lower(coalesce(v_ingestion ->> 'status', ''));
  v_existing_lock_token := btrim(coalesce(v_ingestion ->> 'lock_token', ''));

  begin
    if nullif(btrim(coalesce(v_ingestion ->> 'lock_expires_at', '')), '') is not null then
      v_existing_lock_expires_at := (v_ingestion ->> 'lock_expires_at')::timestamptz;
    end if;
  exception
    when others then
      v_existing_lock_expires_at := null;
  end;

  if v_existing_status = 'completed' then
    if v_existing_lock_token = btrim(p_claim_token) then
      return jsonb_build_object(
        'status', 'already_finalized_idempotent',
        'message_id', v_row.id,
        'metadata', v_metadata
      );
    end if;

    return jsonb_build_object(
      'status', 'stale_claim',
      'message_id', v_row.id,
      'reason', 'already_completed_with_different_claim'
    );
  end if;

  if v_existing_status <> 'pending' then
    return jsonb_build_object(
      'status', 'stale_claim',
      'message_id', v_row.id,
      'reason', 'claim_not_pending'
    );
  end if;

  if v_existing_lock_token = '' then
    return jsonb_build_object(
      'status', 'stale_claim',
      'message_id', v_row.id,
      'reason', 'claim_token_missing'
    );
  end if;

  if v_existing_lock_token <> btrim(p_claim_token) then
    return jsonb_build_object(
      'status', 'stale_claim',
      'message_id', v_row.id,
      'reason', 'claim_token_mismatch'
    );
  end if;

  if v_existing_lock_expires_at is not null and v_existing_lock_expires_at < v_now then
    return jsonb_build_object(
      'status', 'stale_claim',
      'message_id', v_row.id,
      'reason', 'claim_expired'
    );
  end if;

  if v_existing_lock_expires_at is null then
    return jsonb_build_object(
      'status', 'stale_claim',
      'message_id', v_row.id,
      'reason', 'claim_lock_expiry_missing'
    );
  end if;

  v_existing_attachments := case
    when jsonb_typeof(v_metadata -> 'attachments') = 'array'
      then v_metadata -> 'attachments'
    else '[]'::jsonb
  end;

  v_added_attachments := coalesce(p_added_attachments, '[]'::jsonb);
  v_failures := coalesce(p_failures, '[]'::jsonb);

  -- Preserve existing attachment entries exactly as they are.
  v_merged_attachments := v_existing_attachments;

  for v_item in
    select value
    from jsonb_array_elements(v_existing_attachments)
  loop
    v_storage_path := coalesce(
      nullif(btrim(coalesce(v_item ->> 'storagePath', '')), ''),
      nullif(btrim(coalesce(v_item ->> 'storage_path', '')), '')
    );

    if v_storage_path is null then
      continue;
    end if;

    if v_storage_path = any(v_seen_paths) then
      continue;
    end if;

    v_seen_paths := array_append(v_seen_paths, v_storage_path);
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(v_added_attachments)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      return jsonb_build_object(
        'status', 'invalid',
        'message_id', v_row.id,
        'reason', 'attachment_entry_must_be_object'
      );
    end if;

    v_storage_path := coalesce(
      nullif(btrim(coalesce(v_item ->> 'storagePath', '')), ''),
      nullif(btrim(coalesce(v_item ->> 'storage_path', '')), '')
    );

    if v_storage_path is null then
      return jsonb_build_object(
        'status', 'invalid',
        'message_id', v_row.id,
        'reason', 'attachment_storage_path_required'
      );
    end if;

    if left(v_storage_path, length(v_row.conversation_id::text) + 1) <> v_row.conversation_id::text || '/' then
      return jsonb_build_object(
        'status', 'invalid',
        'message_id', v_row.id,
        'reason', 'attachment_path_not_owned_by_conversation'
      );
    end if;

    if v_storage_path = any(v_seen_paths) then
      continue;
    end if;

    v_seen_paths := array_append(v_seen_paths, v_storage_path);

    v_name := coalesce(nullif(btrim(coalesce(v_item ->> 'name', '')), ''), 'Attachment');
    v_mime := lower(btrim(coalesce(v_item ->> 'mimeType', v_item ->> 'mime_type', '')));

    if v_mime = '' then
      return jsonb_build_object(
        'status', 'invalid',
        'message_id', v_row.id,
        'reason', 'attachment_mime_required'
      );
    end if;

    if coalesce(v_item ->> 'size', '') ~ '^[0-9]{1,18}$' then
      begin
        v_size := (v_item ->> 'size')::bigint;
      exception
        when others then
          return jsonb_build_object(
            'status', 'invalid',
            'message_id', v_row.id,
            'reason', 'attachment_size_invalid'
          );
      end;
    else
      return jsonb_build_object(
        'status', 'invalid',
        'message_id', v_row.id,
        'reason', 'attachment_size_invalid'
      );
    end if;

    v_type := case
      when lower(coalesce(v_item ->> 'type', '')) = 'image' then 'image'
      when lower(coalesce(v_item ->> 'type', '')) = 'file' then 'file'
      else ''
    end;

    if v_type = '' then
      return jsonb_build_object(
        'status', 'invalid',
        'message_id', v_row.id,
        'reason', 'attachment_type_invalid'
      );
    end if;

    v_new_item := jsonb_build_object(
      'storagePath', v_storage_path,
      'name', v_name,
      'mimeType', v_mime,
      'size', v_size,
      'type', v_type
    );

    v_merged_attachments := v_merged_attachments || jsonb_build_array(v_new_item);
  end loop;

  v_source_hosts := '{}'::text[];

  if jsonb_typeof(v_ingestion -> 'source_hosts') = 'array' then
    select coalesce(array_agg(distinct host), '{}'::text[])
      into v_source_hosts
    from (
      select nullif(btrim(value), '') as host
      from jsonb_array_elements_text(v_ingestion -> 'source_hosts')
      union all
      select nullif(btrim(host), '') as host
      from unnest(coalesce(p_source_hosts, '{}'::text[])) as host
    ) h
    where host is not null;
  else
    select coalesce(array_agg(distinct host), '{}'::text[])
      into v_source_hosts
    from (
      select nullif(btrim(host), '') as host
      from unnest(coalesce(p_source_hosts, '{}'::text[])) as host
    ) h
    where host is not null;
  end if;

  v_source_hosts_json := to_jsonb(v_source_hosts);

  if coalesce(v_ingestion ->> 'attempts', '') ~ '^[0-9]{1,18}$' then
    begin
      v_attempts_big := (v_ingestion ->> 'attempts')::bigint;
    exception
      when others then
        v_attempts_big := 1;
    end;
  else
    v_attempts_big := 1;
  end if;

  if v_attempts_big < 1 then
    v_attempts := 1;
  elsif v_attempts_big > 2147483647 then
    v_attempts := 2147483647;
  else
    v_attempts := v_attempts_big::integer;
  end if;

  if lower(p_status) = 'completed' then
    v_retry_after := null;
    v_next_retry_at := null;
    v_completed_at := v_now;
  else
    v_retry_after := p_retry_after_seconds;

    if v_retry_after is not null then
      v_next_retry_at := v_now + make_interval(secs => v_retry_after);
    else
      v_next_retry_at := null;
    end if;

    v_completed_at := null;
  end if;

  v_source_attachments := v_metadata #> '{message,attachments}';

  if jsonb_typeof(v_source_attachments) = 'array' then
    select count(*)::integer
      into v_source_attachment_count
    from jsonb_array_elements(v_source_attachments) as item
    where lower(coalesce(item ->> 'type', '')) = 'image'
      and nullif(btrim(coalesce(item #>> '{payload,url}', '')), '') is not null;
  else
    v_source_attachment_count := 0;
  end if;

  v_new_ingestion := jsonb_build_object(
    'status', lower(p_status),
    'attempts', v_attempts,
    'next_retry_at', v_next_retry_at,
    'retry_after_seconds', v_retry_after,
    'last_attempt_at', v_now,
    'completed_at', v_completed_at,
    'provider_message_id', coalesce(v_row.provider_message_id, null),
    'source_hosts', v_source_hosts_json,
    'processed_count', jsonb_array_length(v_merged_attachments),
    'failed_count', jsonb_array_length(v_failures),
    'failures', v_failures,
    'source_attachment_count', v_source_attachment_count,
    'lock_token', btrim(p_claim_token),
    'lock_expires_at', null
  );

  v_new_metadata := jsonb_set(
    jsonb_set(
      v_metadata,
      '{attachments}',
      v_merged_attachments,
      true
    ),
    '{instagram_media_ingestion}',
    v_new_ingestion,
    true
  );

  update public.crm_messages m
  set metadata = v_new_metadata
  where m.id = v_row.id;

  return jsonb_build_object(
    'status', 'finalized',
    'message_id', v_row.id,
    'merged_attachment_count', jsonb_array_length(v_merged_attachments),
    'failed_count', jsonb_array_length(v_failures),
    'next_retry_at', v_next_retry_at,
    'completed_at', v_completed_at,
    'metadata', v_new_metadata
  );
end;
$$;

alter function public.crm_claim_instagram_media_message(uuid, text, text, timestamptz) owner to postgres;
alter function public.crm_finalize_instagram_media_message(uuid, text, jsonb, jsonb, text, integer, text[], timestamptz) owner to postgres;

revoke all on function public.crm_claim_instagram_media_message(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.crm_finalize_instagram_media_message(uuid, text, jsonb, jsonb, text, integer, text[], timestamptz) from public, anon, authenticated;

grant execute on function public.crm_claim_instagram_media_message(uuid, text, text, timestamptz) to service_role;
grant execute on function public.crm_finalize_instagram_media_message(uuid, text, jsonb, jsonb, text, integer, text[], timestamptz) to service_role;

notify pgrst, 'reload schema';

commit;
